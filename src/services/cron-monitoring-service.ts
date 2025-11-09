/**
 * Cron Monitoring Service
 * Tracks cron execution history and creates notifications for failures
 * Story 5.3: Cron Error Handling & Alerting
 */

import { ExecutionContext } from '../lib/logger';
import { createClient, prepareExec, prepareQuery } from '../db/client';

// ========================================
// Type Definitions
// ========================================

/**
 * Metrics collected during cron pipeline execution
 */
export interface CronRunMetrics {
  duration_ms: number;
  status: 'success' | 'partial' | 'error';
  weather_snapshots_created: number;
  flights_analyzed: number;
  weather_conflicts_found: number;
  flights_rescheduled: number;
  flights_pending_review: number;
  flights_skipped: number;
  errors: number;
}

/**
 * Request to record a cron run
 */
export interface CronRunRequest {
  correlationId: string;
  status: 'success' | 'partial' | 'error';
  startedAt: string; // ISO 8601
  completedAt: string; // ISO 8601
  metrics: CronRunMetrics;
  errorDetails?: string[]; // error messages if any
}

/**
 * Cron run record from database
 */
export interface CronRun {
  id: number;
  correlationId: string;
  status: 'success' | 'partial' | 'error';
  startedAt: string;
  completedAt: string;
  durationMs: number;
  errorCount: number;
  weatherSnapshotsCreated: number;
  flightsAnalyzed: number;
  weatherConflictsFound: number;
  flightsRescheduled: number;
  flightsPendingReview: number;
  flightsSkipped: number;
  errorDetails: string[];
}

/**
 * Response from recording a cron run
 */
export interface RecordCronRunResponse {
  cronRunId: number;
  recorded: boolean;
}

// ========================================
// Helper Functions
// ========================================

/**
 * Generates notification message based on cron failure type
 * AC9: Cron-Specific Alert Messaging
 */
function generateNotificationMessage(
  status: 'success' | 'partial' | 'error',
  metrics: CronRunMetrics,
  errorDetails?: string[]
): string {
  // No notification for successful runs
  if (status === 'success') {
    return '';
  }

  const errors = errorDetails || [];
  const hasWeatherError = errors.some((e) => e.toLowerCase().includes('weather'));
  const hasClassificationError = errors.some((e) => e.toLowerCase().includes('classification'));
  const hasRescheduleError = errors.some((e) => e.toLowerCase().includes('reschedule'));

  // Partial failure (1 service failed)
  if (status === 'partial') {
    if (hasWeatherError) {
      return `Cron: Weather service failed - API may be unreachable. ${metrics.flights_analyzed} flights analyzed, ${metrics.flights_rescheduled} rescheduled. Monitor next cron run for recovery.`;
    }
    if (hasClassificationError) {
      return `Cron: Flight classification failed - ${errors[0] || 'Unknown error'}. ${metrics.weather_snapshots_created} weather snapshots created. Monitor next cron run for recovery.`;
    }
    if (hasRescheduleError) {
      return `Cron: Auto-rescheduling failed - ${errors[0] || 'Unknown error'}. ${metrics.flights_analyzed} flights analyzed. Monitor next cron run for recovery.`;
    }
    return `Cron: Partial execution - 1 service failed but others succeeded. ${metrics.flights_analyzed} flights analyzed, ${metrics.flights_rescheduled} rescheduled. Monitor next cron run for recovery.`;
  }

  // All failures (2+ services failed)
  if (status === 'error') {
    return `Cron: Pipeline failure - ${metrics.errors} services failed. Autonomous operation degraded. Manual action may be required. Review cron logs and verify system dependencies.`;
  }

  return 'Cron execution encountered unexpected errors';
}

/**
 * Creates a notification for cron failure
 * AC3: Cron Failure Notification Creation
 */
async function createCronNotification(
  ctx: ExecutionContext,
  status: 'partial' | 'error',
  metrics: CronRunMetrics,
  errorDetails?: string[]
): Promise<void> {
  const client = createClient(ctx.env.AIRESCHEDULER_DB);

  try {
    const message = generateNotificationMessage(status, metrics, errorDetails);

    if (!message) {
      return; // No notification needed
    }

    // Note: The notifications table CHECK constraint doesn't include 'cron-error'
    // We'll use 'error' type for now, as SQLite doesn't support modifying CHECK constraints
    // Application-level handling for cron-specific errors
    const notificationType = 'error';

    await prepareExec(
      client,
      `INSERT INTO notifications (flight_id, type, message, status, created_at)
       VALUES (?, ?, ?, 'unread', datetime('now'))`,
      [null, notificationType, message]
    );

    ctx.logger.info('[cron-monitoring] Notification created for cron failure', {
      status,
      type: notificationType,
    });
  } catch (error) {
    ctx.logger.warn('[cron-monitoring] Failed to create notification', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    // Non-blocking: don't throw, just log warning
  }
}

// ========================================
// Public API
// ========================================

/**
 * Records a cron run in the database
 * AC2: Cron Run Persistence Service
 * AC7: Call cronMonitoringService from Scheduled Handler
 *
 * @param ctx - Execution context with correlation ID and logger
 * @param request - Cron run details and metrics
 * @returns Response with cron_run_id
 */
export async function recordCronRun(
  ctx: ExecutionContext,
  request: CronRunRequest
): Promise<RecordCronRunResponse> {
  ctx.logger.info('[cron-monitoring] Recording cron run started', {
    correlationId: request.correlationId,
    status: request.status,
  });

  const client = createClient(ctx.env.AIRESCHEDULER_DB);

  try {
    // Insert cron run record
    const result = await prepareExec(
      client,
      `INSERT INTO cron_runs (
        correlation_id,
        status,
        started_at,
        completed_at,
        duration_ms,
        error_count,
        weather_snapshots_created,
        flights_analyzed,
        weather_conflicts_found,
        flights_rescheduled,
        flights_pending_review,
        flights_skipped,
        error_details,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        request.correlationId,
        request.status,
        request.startedAt,
        request.completedAt,
        request.metrics.duration_ms,
        request.metrics.errors,
        request.metrics.weather_snapshots_created,
        request.metrics.flights_analyzed,
        request.metrics.weather_conflicts_found,
        request.metrics.flights_rescheduled,
        request.metrics.flights_pending_review,
        request.metrics.flights_skipped,
        request.errorDetails ? JSON.stringify(request.errorDetails) : null,
      ]
    );

    const cronRunId = result.meta.last_row_id as number;

    // Create notification if cron run failed
    if (request.status !== 'success') {
      await createCronNotification(
        ctx,
        request.status as 'partial' | 'error',
        request.metrics,
        request.errorDetails
      );
    }

    ctx.logger.info('[cron-monitoring] Cron run recorded', {
      cronRunId,
      correlationId: request.correlationId,
      status: request.status,
    });

    return {
      cronRunId,
      recorded: true,
    };
  } catch (error) {
    ctx.logger.warn('[cron-monitoring] Failed to record cron run', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Non-blocking: return failure response but don't throw
    return {
      cronRunId: -1,
      recorded: false,
    };
  }
}

/**
 * Retrieves recent cron runs from the database
 * AC4: RPC Method to Query Recent Cron Runs
 *
 * @param ctx - Execution context with correlation ID and logger
 * @param limit - Maximum number of runs to return (default 10, max 50)
 * @param status - Optional filter by status
 * @returns Array of recent cron runs
 */
export async function getRecentCronRuns(
  ctx: ExecutionContext,
  limit: number = 10,
  status?: 'success' | 'partial' | 'error'
): Promise<CronRun[]> {
  ctx.logger.info('[cron-monitoring] Fetching recent cron runs', {
    limit,
    status,
  });

  const client = createClient(ctx.env.AIRESCHEDULER_DB);

  try {
    // Enforce max limit
    const effectiveLimit = Math.min(limit, 50);

    let query: string;
    let params: (string | number)[];

    if (status) {
      query = `
        SELECT
          id,
          correlation_id,
          status,
          started_at,
          completed_at,
          duration_ms,
          error_count,
          weather_snapshots_created,
          flights_analyzed,
          weather_conflicts_found,
          flights_rescheduled,
          flights_pending_review,
          flights_skipped,
          error_details
        FROM cron_runs
        WHERE status = ?
        ORDER BY created_at DESC
        LIMIT ?
      `;
      params = [status, effectiveLimit];
    } else {
      query = `
        SELECT
          id,
          correlation_id,
          status,
          started_at,
          completed_at,
          duration_ms,
          error_count,
          weather_snapshots_created,
          flights_analyzed,
          weather_conflicts_found,
          flights_rescheduled,
          flights_pending_review,
          flights_skipped,
          error_details
        FROM cron_runs
        ORDER BY created_at DESC
        LIMIT ?
      `;
      params = [effectiveLimit];
    }

    const rows = await prepareQuery(client, query, params);

    const cronRuns: CronRun[] = rows.map((row: any) => {
      let errorDetailsArray: string[] = [];
      if (row.error_details) {
        try {
          errorDetailsArray = JSON.parse(row.error_details);
          // Ensure it's an array of strings
          if (!Array.isArray(errorDetailsArray)) {
            errorDetailsArray = [];
          }
        } catch (parseError) {
          ctx.logger.warn('[cron-monitoring] Failed to parse error_details JSON', {
            correlationId: row.correlation_id,
            error: parseError instanceof Error ? parseError.message : 'Unknown parse error',
          });
          errorDetailsArray = [];
        }
      }
      return {
        id: row.id,
        correlationId: row.correlation_id,
        status: row.status,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        durationMs: row.duration_ms,
        errorCount: row.error_count,
        weatherSnapshotsCreated: row.weather_snapshots_created || 0,
        flightsAnalyzed: row.flights_analyzed || 0,
        weatherConflictsFound: row.weather_conflicts_found || 0,
        flightsRescheduled: row.flights_rescheduled || 0,
        flightsPendingReview: row.flights_pending_review || 0,
        flightsSkipped: row.flights_skipped || 0,
        errorDetails: errorDetailsArray,
      };
    });

    ctx.logger.info('[cron-monitoring] Recent cron runs fetched', {
      count: cronRuns.length,
    });

    return cronRuns;
  } catch (error) {
    ctx.logger.error('[cron-monitoring] Failed to fetch recent cron runs', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Return empty array on error (AC8: graceful handling)
    return [];
  }
}
