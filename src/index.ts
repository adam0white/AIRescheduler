/**
 * AIRescheduler Worker Entry Point
 * Handles both HTTP requests (dashboard + RPC) and scheduled tasks (cron)
 */

import { createClient, getAllTrainingThresholds } from './db/client';
import { handleRpc } from './rpc/handlers';
import { generateCorrelationId, createContext } from './lib/logger';
import { getAssetFromKV } from '@cloudflare/kv-asset-handler';
import * as weatherService from './services/weather-service';
import * as classificationService from './services/classification-service';
import * as candidateSlotService from './services/candidate-slot-service';
import * as aiRescheduleService from './services/ai-reschedule-service';
import * as rescheduleActionService from './services/reschedule-action-service';
import * as cronMonitoringService from './services/cron-monitoring-service';

export interface Env {
  AIRESCHEDULER_DB: D1Database;
  AI_MODEL: Ai;
  WEATHER_API_KEY?: string;
  __STATIC_CONTENT: KVNamespace;
}

export default {
  /**
   * Fetch handler - serves dashboard and handles RPC calls
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Health endpoint - validates database connection
    if (url.pathname === '/api/health') {
      try {
        const dbClient = createClient(env.AIRESCHEDULER_DB);
        const thresholds = await getAllTrainingThresholds(dbClient);

        return new Response(
          JSON.stringify({
            status: 'healthy',
            database: 'connected',
            timestamp: new Date().toISOString(),
            thresholds: thresholds,
          }),
          {
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({
            status: 'error',
            database: 'disconnected',
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error',
          }),
          {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
      }
    }

    // RPC endpoint - handles all RPC method calls
    if (url.pathname === '/rpc' && request.method === 'POST') {
      return handleRpc(request, env);
    }

    // Serve static dashboard assets
    try {
      return await getAssetFromKV(
        {
          request,
          waitUntil(promise) {
            return ctx.waitUntil(promise);
          },
        },
        {
          ASSET_NAMESPACE: env.__STATIC_CONTENT,
          ASSET_MANIFEST: {},
        }
      );
    } catch (e) {
      // If asset not found or error, return 404
      return new Response('Not Found', { status: 404 });
    }
  },

  /**
   * Scheduled handler - runs hourly cron tasks
   */
  async scheduled(event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    const correlationId = generateCorrelationId('cron');
    const execCtx = createContext(correlationId, env);
    const startTime = Date.now();

    // Timeout constants
    const WARN_THRESHOLD = 110000; // Warn at 110s to complete before limit (120s hard limit)

    // Initialize metrics object
    interface CronMetrics {
      duration_ms: number;
      status: 'success' | 'partial' | 'error';
      weather_snapshots_created: number;
      flights_analyzed: number;
      weather_conflicts_found: number;
      flights_rescheduled: number;
      flights_pending_review: number;
      flights_skipped: number;
      errors: number;
      pipeline_status: string;
    }

    const metrics: CronMetrics = {
      duration_ms: 0,
      status: 'success',
      weather_snapshots_created: 0,
      flights_analyzed: 0,
      weather_conflicts_found: 0,
      flights_rescheduled: 0,
      flights_pending_review: 0,
      flights_skipped: 0,
      errors: 0,
      pipeline_status: 'success',
    };

    // Track service-specific errors for notification details (AC3/AC9)
    const errorDetails: string[] = [];

    try {
      execCtx.logger.info('Cron scheduled execution started', {
        scheduledTime: new Date(event.scheduledTime).toISOString(),
        cron: event.cron,
      });

      // Step 1: Weather Polling
      try {
        const weatherStartTime = Date.now();
        const weatherResult = await weatherService.pollWeather(execCtx, {});
        const weatherDuration = Date.now() - weatherStartTime;

        if (weatherResult) {
          metrics.weather_snapshots_created = weatherResult.snapshotsCreated || 0;
          execCtx.logger.info('[cron-pipeline] Weather polling completed', {
            snapshots_created: metrics.weather_snapshots_created,
            weather_service_duration_ms: weatherDuration,
          });
        }
      } catch (error) {
        metrics.errors++;
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errorDetails.push(`Weather service failed: ${errorMsg}`);
        execCtx.logger.warn('[cron-pipeline] Weather polling failed', {
          error: errorMsg,
          duration_ms: Date.now() - startTime,
        });
        // Continue to classification despite weather failure
      }

      // Check timeout before classification
      const elapsedBeforeClassification = Date.now() - startTime;
      if (elapsedBeforeClassification > WARN_THRESHOLD) {
        execCtx.logger.warn('[cron-pipeline] Approaching timeout, completing pipeline');
        throw new Error('Timeout threshold exceeded');
      }

      // Step 2: Flight Classification
      let classificationResults: classificationService.ClassificationResult[] = [];
      try {
        const classificationStartTime = Date.now();
        const classificationResult = await classificationService.classifyFlights(execCtx, {});
        const classificationDuration = Date.now() - classificationStartTime;

        if (classificationResult && classificationResult.results) {
          classificationResults = classificationResult.results;
          metrics.flights_analyzed = classificationResults.length;
          metrics.weather_conflicts_found = classificationResults.filter(
            (r) => r.weatherStatus === 'auto-reschedule' || r.weatherStatus === 'advisory'
          ).length;

          execCtx.logger.info('[cron-pipeline] Flight classification completed', {
            flights_analyzed: metrics.flights_analyzed,
            conflicts_found: metrics.weather_conflicts_found,
            classification_service_duration_ms: classificationDuration,
          });
        }
      } catch (error) {
        metrics.errors++;
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errorDetails.push(`Classification service failed: ${errorMsg}`);
        execCtx.logger.warn('[cron-pipeline] Flight classification failed', {
          error: errorMsg,
          duration_ms: Date.now() - startTime,
        });
        // Continue to rescheduling with empty results
      }

      // Check timeout before rescheduling
      const elapsedBeforeRescheduling = Date.now() - startTime;
      if (elapsedBeforeRescheduling > WARN_THRESHOLD) {
        execCtx.logger.warn('[cron-pipeline] Approaching timeout, completing pipeline');
        throw new Error('Timeout threshold exceeded');
      }

      // Step 3: Auto-Rescheduling
      try {
        const reschedulingStartTime = Date.now();

        // Filter flights that need auto-rescheduling (status='auto-reschedule')
        const flightsToReschedule = classificationResults.filter(
          (r) => r.weatherStatus === 'auto-reschedule'
        );

        execCtx.logger.info('[cron-pipeline] Processing auto-reschedules', {
          flights_to_reschedule: flightsToReschedule.length,
        });

        for (const flight of flightsToReschedule) {
          try {
            // Generate candidate slots
            const candidateResult = await candidateSlotService.generateCandidateSlots(
              env,
              flight.flightId,
              execCtx
            );

            if (!candidateResult || !candidateResult.candidateSlots || candidateResult.candidateSlots.length === 0) {
              execCtx.logger.info('[cron-pipeline] No candidate slots available', {
                flightId: flight.flightId,
              });
              metrics.flights_skipped++;
              continue;
            }

            // Generate AI recommendations
            const aiRecommendations = await aiRescheduleService.generateRescheduleRecommendations(
              env,
              candidateResult,
              execCtx
            );

            if (!aiRecommendations || !aiRecommendations.recommendations || aiRecommendations.recommendations.length === 0) {
              execCtx.logger.info('[cron-pipeline] No AI recommendations available', {
                flightId: flight.flightId,
              });
              metrics.flights_skipped++;
              continue;
            }

            // Check top recommendation confidence
            const topRecommendation = aiRecommendations.recommendations[0];
            if (!topRecommendation) {
              execCtx.logger.info('[cron-pipeline] No top recommendation available', {
                flightId: flight.flightId,
              });
              metrics.flights_skipped++;
              continue;
            }

            if (topRecommendation.aiConfidence >= 80) {
              // Auto-accept: High confidence reschedule
              const actionResult = await rescheduleActionService.recordAutoRescheduleDecision(
                env,
                flight.flightId,
                topRecommendation,
                execCtx
              );

              metrics.flights_rescheduled++;
              execCtx.logger.info('[cron-pipeline] Auto-reschedule created', {
                flightId: flight.flightId,
                newFlightId: actionResult.newFlightId,
                confidence: topRecommendation.aiConfidence,
              });
            } else {
              // Low confidence: Requires manual review
              metrics.flights_pending_review++;
              execCtx.logger.info('[cron-pipeline] Auto-reschedule skipped (low confidence)', {
                flightId: flight.flightId,
                confidence: topRecommendation.aiConfidence,
              });
            }
          } catch (error) {
            execCtx.logger.error('[cron-pipeline] Failed to process flight reschedule', {
              flightId: flight.flightId,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
            metrics.flights_skipped++;
            // Continue processing other flights
          }
        }

        const reschedulingDuration = Date.now() - reschedulingStartTime;
        execCtx.logger.info('[cron-pipeline] Auto-reschedule processing completed', {
          flights_rescheduled: metrics.flights_rescheduled,
          flights_pending_review: metrics.flights_pending_review,
          rescheduling_service_duration_ms: reschedulingDuration,
        });
      } catch (error) {
        metrics.errors++;
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errorDetails.push(`Rescheduling service failed: ${errorMsg}`);
        execCtx.logger.warn('[cron-pipeline] Auto-reschedule processing failed', {
          error: errorMsg,
          duration_ms: Date.now() - startTime,
        });
      }
    } catch (error) {
      // Critical failure or timeout
      execCtx.logger.error('Cron scheduled execution error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        duration_ms: Date.now() - startTime,
      });
      metrics.errors++;
    } finally {
      // Calculate final metrics
      metrics.duration_ms = Date.now() - startTime;
      metrics.status = metrics.errors === 0 ? 'success' : metrics.errors >= 2 ? 'error' : 'partial';
      metrics.pipeline_status = metrics.status;

      // Log pipeline summary
      execCtx.logger.info('[cron-pipeline] Pipeline summary', {
        ...metrics,
      });

      // Log completion
      execCtx.logger.info('Cron scheduled execution completed', {
        duration_ms: metrics.duration_ms,
        status: metrics.status,
        weather_snapshots_created: metrics.weather_snapshots_created,
        flights_analyzed: metrics.flights_analyzed,
        weather_conflicts_found: metrics.weather_conflicts_found,
        flights_rescheduled: metrics.flights_rescheduled,
        flights_pending_review: metrics.flights_pending_review,
        flights_skipped: metrics.flights_skipped,
        errors: metrics.errors,
        pipeline_status: metrics.pipeline_status,
      });

      // Record cron run in database (non-blocking)
      // Story 5.3: AC7 - Call cronMonitoringService from Scheduled Handler
      try {
        await cronMonitoringService.recordCronRun(execCtx, {
          correlationId: execCtx.correlationId,
          status: metrics.status,
          startedAt: new Date(startTime).toISOString(),
          completedAt: new Date().toISOString(),
          metrics: {
            duration_ms: metrics.duration_ms,
            status: metrics.status,
            weather_snapshots_created: metrics.weather_snapshots_created,
            flights_analyzed: metrics.flights_analyzed,
            weather_conflicts_found: metrics.weather_conflicts_found,
            flights_rescheduled: metrics.flights_rescheduled,
            flights_pending_review: metrics.flights_pending_review,
            flights_skipped: metrics.flights_skipped,
            errors: metrics.errors,
          },
          errorDetails: errorDetails.length > 0 ? errorDetails : undefined,
        });
      } catch (error) {
        execCtx.logger.warn('[cron-monitoring] Failed to record cron run', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        // Don't block handler completion
      }

      // Warn if duration exceeded threshold
      if (metrics.duration_ms > 60000) {
        execCtx.logger.warn('[cron-pipeline] Execution duration exceeded 60 seconds', {
          duration_ms: metrics.duration_ms,
        });
      }
    }
  },
};
