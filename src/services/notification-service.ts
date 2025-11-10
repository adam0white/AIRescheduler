/**
 * Notification Service
 * Manages in-dashboard notifications for reschedule actions and advisories
 */

import { ExecutionContext } from '../lib/logger';
import { createClient, prepareExec, prepareQuery } from '../db/client';

export interface CreateNotificationRequest {
  flightId: number | null;
  type: 'auto-rescheduled' | 'advisory' | 'action-required' | 'error';
  message: string;
}

export interface CreateNotificationResponse {
  notificationId: number;
  success: boolean;
}

export interface Notification {
  id: number;
  type: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
  is_read: boolean;
  created_at: string;
  flight_id: number | null;
}

export interface GetRecentNotificationsResult {
  notifications: Notification[];
  totalCount: number;
}

/**
 * Creates a new notification in the database
 * @param ctx - Execution context with correlation ID and logger
 * @param request - Notification creation parameters
 * @returns Notification creation response
 */
export async function createNotification(
  ctx: ExecutionContext,
  request: CreateNotificationRequest
): Promise<CreateNotificationResponse> {
  ctx.logger.info('Create notification started', {
    flightId: request.flightId,
    type: request.type,
  });

  const client = createClient(ctx.env.AIRESCHEDULER_DB);

  try {
    const result = await prepareExec(
      client,
      `INSERT INTO notifications (flight_id, type, message, status, created_at)
       VALUES (?, ?, ?, 'unread', datetime('now'))`,
      [request.flightId, request.type, request.message]
    );

    const response = {
      notificationId: result.meta.last_row_id as number,
      success: true,
    };

    ctx.logger.info('Create notification completed', { notificationId: response.notificationId });
    return response;
  } catch (error) {
    ctx.logger.error('Create notification failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw new Error(`Failed to create notification: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Maps notification type to severity level
 * @param type - Notification type
 * @returns Severity level
 */
function getSeverityFromType(type: string): 'low' | 'medium' | 'high' {
  switch (type) {
    case 'cron-error':
    case 'action-required':
    case 'error':
      return 'high';
    case 'advisory':
      return 'medium';
    case 'auto-reschedule':
    case 'auto-rescheduled':
    case 'info':
    default:
      return 'low';
  }
}

/**
 * Retrieves recent notifications from the database
 * @param ctx - Execution context
 * @param limit - Maximum number of notifications to return (default 10, max 50)
 * @param type - Optional type filter
 * @returns Notifications and total unread count
 */
export async function getRecentNotifications(
  ctx: ExecutionContext,
  limit: number = 10,
  type?: string
): Promise<GetRecentNotificationsResult> {
  ctx.logger.info('Get recent notifications started', { limit, type });

  const client = createClient(ctx.env.AIRESCHEDULER_DB);

  try {
    // Enforce max limit
    const safeLimit = Math.min(limit, 50);

    // Build query with optional type filter and severity-based ordering
    const params: any[] = [];
    let query = `SELECT id, flight_id, type, message, status, created_at
                 FROM notifications`;

    if (type) {
      query += ' WHERE type = ?';
      params.push(type);
    }

    // Sort by severity (high to low) then by created_at (newest first)
    // Severity levels: cron-error/action-required/error = 3 (high)
    //                  advisory = 2 (medium)
    //                  auto-reschedule/info/others = 1 (low)
    query += ` ORDER BY
                 CASE
                   WHEN type IN ('cron-error', 'action-required', 'error') THEN 3
                   WHEN type = 'advisory' THEN 2
                   ELSE 1
                 END DESC,
                 created_at DESC
               LIMIT ?`;
    params.push(safeLimit);

    // Query notifications
    const rows = await prepareQuery<{
      id: number;
      flight_id: number | null;
      type: string;
      message: string;
      status: string;
      created_at: string;
    }>(client, query, params);

    // Map to notification format with severity
    const notifications: Notification[] = rows.map((row) => {
      const severity = getSeverityFromType(row.type);
      return {
        id: row.id,
        type: row.type,
        message: row.message,
        severity,
        is_read: row.status === 'read',
        created_at: row.created_at,
        flight_id: row.flight_id,
      };
    });

    // Query unread count
    const unreadResult = await prepareQuery<{ count: number }>(
      client,
      `SELECT COUNT(*) as count FROM notifications WHERE status = 'unread'`,
      []
    );
    const totalCount = unreadResult[0]?.count || 0;

    ctx.logger.info('Get recent notifications completed', {
      count: notifications.length,
      totalCount,
    });

    return {
      notifications,
      totalCount,
    };
  } catch (error) {
    ctx.logger.error('Get recent notifications failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    // Return empty result on error instead of throwing
    return {
      notifications: [],
      totalCount: 0,
    };
  }
}

/**
 * Updates notification status (read/unread/archived)
 * @param ctx - Execution context
 * @param notificationId - ID of notification to update
 * @param status - New status
 * @returns Success boolean
 */
export async function updateNotificationStatus(
  ctx: ExecutionContext,
  notificationId: number,
  status: 'read' | 'unread' | 'archived'
): Promise<boolean> {
  ctx.logger.info('Update notification status started', {
    notificationId,
    status,
  });

  const client = createClient(ctx.env.AIRESCHEDULER_DB);

  try {
    await prepareExec(
      client,
      `UPDATE notifications SET status = ? WHERE id = ?`,
      [status, notificationId]
    );

    ctx.logger.info('Update notification status completed', { notificationId, status });
    return true;
  } catch (error) {
    ctx.logger.error('Update notification status failed', {
      notificationId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return false;
  }
}
