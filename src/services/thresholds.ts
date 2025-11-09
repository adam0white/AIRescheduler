/**
 * Thresholds Service
 * Loads and manages training-level weather thresholds
 */

import { ExecutionContext } from '../lib/logger';
import { createClient, getAllTrainingThresholds, getThresholdByLevel, TrainingThreshold } from '../db/client';

export interface LoadThresholdsRequest {
  trainingLevel?: 'student' | 'private' | 'instrument';
}

export interface LoadThresholdsResponse {
  thresholds: TrainingThreshold[];
}

/**
 * Loads weather thresholds from the database
 * @param ctx - Execution context with correlation ID and logger
 * @param request - Threshold loading parameters
 * @returns Threshold loading response
 */
export async function loadThresholds(
  ctx: ExecutionContext,
  request: LoadThresholdsRequest
): Promise<LoadThresholdsResponse> {
  ctx.logger.info('Load thresholds started', { trainingLevel: request.trainingLevel });

  const client = createClient(ctx.env.AIRESCHEDULER_DB);

  try {
    let result: LoadThresholdsResponse;

    if (request.trainingLevel) {
      const threshold = await getThresholdByLevel(client, request.trainingLevel);
      result = {
        thresholds: threshold ? [threshold] : [],
      };
    } else {
      const thresholds = await getAllTrainingThresholds(client);
      result = {
        thresholds,
      };
    }

    ctx.logger.info('Load thresholds completed', { thresholdCount: result.thresholds.length });
    return result;
  } catch (error) {
    ctx.logger.error('Load thresholds failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw new Error(`Failed to load thresholds: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
