/**
 * Notification Service
 * Manages in-dashboard notifications for reschedule actions and advisories
 */

import { ExecutionContext } from '../lib/logger';
import { createClient, prepareExec } from '../db/client';

export interface CreateNotificationRequest {
  flightId: number | null;
  type: 'auto-rescheduled' | 'advisory' | 'action-required' | 'error';
  message: string;
}

export interface CreateNotificationResponse {
  notificationId: number;
  success: boolean;
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
