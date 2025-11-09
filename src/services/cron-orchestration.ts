/**
 * Cron Orchestration Helpers
 * Extracted helper functions for the scheduled cron pipeline
 * Improves readability and maintainability of the main scheduled handler
 */

import { ExecutionContext } from '../lib/logger';
import { Env } from '../index';
import * as weatherService from './weather-service';
import * as classificationService from './classification-service';
import * as candidateSlotService from './candidate-slot-service';
import * as aiRescheduleService from './ai-reschedule-service';
import * as rescheduleActionService from './reschedule-action-service';

/**
 * Weather polling step
 * Polls weather data for upcoming flights
 */
export async function runWeatherPolling(
  execCtx: ExecutionContext,
  startTime: number
): Promise<{
  snapshotsCreated: number;
  error?: string;
}> {
  try {
    const weatherStartTime = Date.now();
    const weatherResult = await weatherService.pollWeather(execCtx, {});
    const weatherDuration = Date.now() - weatherStartTime;

    const snapshotsCreated = weatherResult?.snapshotsCreated || 0;
    execCtx.logger.info('[cron-pipeline] Weather polling completed', {
      snapshots_created: snapshotsCreated,
      weather_service_duration_ms: weatherDuration,
    });

    return { snapshotsCreated };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    execCtx.logger.warn('[cron-pipeline] Weather polling failed', {
      error: errorMsg,
      duration_ms: Date.now() - startTime,
    });
    return { snapshotsCreated: 0, error: `Weather service failed: ${errorMsg}` };
  }
}

/**
 * Flight classification step
 * Classifies flights based on weather conditions
 */
export async function runFlightClassification(
  execCtx: ExecutionContext,
  startTime: number
): Promise<{
  results: classificationService.ClassificationResult[];
  flightsAnalyzed: number;
  weatherConflictsFound: number;
  error?: string;
}> {
  try {
    const classificationStartTime = Date.now();
    const classificationResult = await classificationService.classifyFlights(execCtx, {});
    const classificationDuration = Date.now() - classificationStartTime;

    const results = classificationResult?.results || [];
    const flightsAnalyzed = results.length;
    const weatherConflictsFound = results.filter(
      (r) => r.weatherStatus === 'auto-reschedule' || r.weatherStatus === 'advisory'
    ).length;

    execCtx.logger.info('[cron-pipeline] Flight classification completed', {
      flights_analyzed: flightsAnalyzed,
      conflicts_found: weatherConflictsFound,
      classification_service_duration_ms: classificationDuration,
    });

    return { results, flightsAnalyzed, weatherConflictsFound };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    execCtx.logger.warn('[cron-pipeline] Flight classification failed', {
      error: errorMsg,
      duration_ms: Date.now() - startTime,
    });
    return {
      results: [],
      flightsAnalyzed: 0,
      weatherConflictsFound: 0,
      error: `Classification service failed: ${errorMsg}`,
    };
  }
}

/**
 * Auto-rescheduling step
 * Processes flights that need auto-rescheduling based on AI recommendations
 */
export async function runAutoRescheduling(
  env: Env,
  execCtx: ExecutionContext,
  classificationResults: classificationService.ClassificationResult[],
  aiConfidenceThreshold: number,
  startTime: number
): Promise<{
  flightsRescheduled: number;
  flightsPendingReview: number;
  flightsSkipped: number;
  error?: string;
}> {
  let flightsRescheduled = 0;
  let flightsPendingReview = 0;
  let flightsSkipped = 0;

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
          flightsSkipped++;
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
          flightsSkipped++;
          continue;
        }

        // Check top recommendation confidence
        const topRecommendation = aiRecommendations.recommendations[0];
        if (!topRecommendation) {
          execCtx.logger.info('[cron-pipeline] No top recommendation available', {
            flightId: flight.flightId,
          });
          flightsSkipped++;
          continue;
        }

        if (topRecommendation.aiConfidence >= aiConfidenceThreshold) {
          // Auto-accept: High confidence reschedule
          const actionResult = await rescheduleActionService.recordAutoRescheduleDecision(
            env,
            flight.flightId,
            topRecommendation,
            execCtx
          );

          flightsRescheduled++;
          execCtx.logger.info('[cron-pipeline] Auto-reschedule created', {
            flightId: flight.flightId,
            newFlightId: actionResult.newFlightId,
            confidence: topRecommendation.aiConfidence,
          });
        } else {
          // Low confidence: Requires manual review
          flightsPendingReview++;
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
        flightsSkipped++;
        // Continue processing other flights
      }
    }

    const reschedulingDuration = Date.now() - reschedulingStartTime;
    execCtx.logger.info('[cron-pipeline] Auto-reschedule processing completed', {
      flights_rescheduled: flightsRescheduled,
      flights_pending_review: flightsPendingReview,
      rescheduling_service_duration_ms: reschedulingDuration,
    });

    return { flightsRescheduled, flightsPendingReview, flightsSkipped };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    execCtx.logger.warn('[cron-pipeline] Auto-reschedule processing failed', {
      error: errorMsg,
      duration_ms: Date.now() - startTime,
    });
    return {
      flightsRescheduled,
      flightsPendingReview,
      flightsSkipped,
      error: `Rescheduling service failed: ${errorMsg}`,
    };
  }
}
