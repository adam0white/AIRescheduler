/**
 * AIRescheduler Worker Entry Point
 * Handles both HTTP requests (dashboard + RPC) and scheduled tasks (cron)
 */

import { createClient, getAllTrainingThresholds } from './db/client';
import { handleRpc } from './rpc/handlers';
import { generateCorrelationId, createContext } from './lib/logger';
import { getAssetFromKV } from '@cloudflare/kv-asset-handler';
import * as cronMonitoringService from './services/cron-monitoring-service';
import * as cronOrchestration from './services/cron-orchestration';

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

    // Timeout and threshold constants
    const WARN_THRESHOLD = 110000; // Warn at 110s to complete before limit (120s hard limit)
    const AI_CONFIDENCE_THRESHOLD = 80; // Minimum AI confidence for auto-rescheduling
    const PERFORMANCE_WARN_MS = 60000; // Warn if execution exceeds 60 seconds

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
      const weatherResult = await cronOrchestration.runWeatherPolling(execCtx, startTime);
      metrics.weather_snapshots_created = weatherResult.snapshotsCreated;
      if (weatherResult.error) {
        metrics.errors++;
        errorDetails.push(weatherResult.error);
      }

      // Check timeout before classification
      const elapsedBeforeClassification = Date.now() - startTime;
      if (elapsedBeforeClassification > WARN_THRESHOLD) {
        execCtx.logger.warn('[cron-pipeline] Approaching timeout, completing pipeline');
        throw new Error('Timeout threshold exceeded');
      }

      // Step 2: Flight Classification
      const classificationResult = await cronOrchestration.runFlightClassification(execCtx, startTime);
      metrics.flights_analyzed = classificationResult.flightsAnalyzed;
      metrics.weather_conflicts_found = classificationResult.weatherConflictsFound;
      if (classificationResult.error) {
        metrics.errors++;
        errorDetails.push(classificationResult.error);
      }

      // Check timeout before rescheduling
      const elapsedBeforeRescheduling = Date.now() - startTime;
      if (elapsedBeforeRescheduling > WARN_THRESHOLD) {
        execCtx.logger.warn('[cron-pipeline] Approaching timeout, completing pipeline');
        throw new Error('Timeout threshold exceeded');
      }

      // Step 3: Auto-Rescheduling
      const reschedulingResult = await cronOrchestration.runAutoRescheduling(
        env,
        execCtx,
        classificationResult.results,
        AI_CONFIDENCE_THRESHOLD,
        startTime
      );
      metrics.flights_rescheduled = reschedulingResult.flightsRescheduled;
      metrics.flights_pending_review = reschedulingResult.flightsPendingReview;
      metrics.flights_skipped = reschedulingResult.flightsSkipped;
      if (reschedulingResult.error) {
        metrics.errors++;
        errorDetails.push(reschedulingResult.error);
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
      if (metrics.duration_ms > PERFORMANCE_WARN_MS) {
        execCtx.logger.warn('[cron-pipeline] Execution duration exceeded 60 seconds', {
          duration_ms: metrics.duration_ms,
        });
      }
    }
  },
};
