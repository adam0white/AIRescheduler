/**
 * RPC Handler Router
 * Dispatches RPC method calls to service layer with validation and error handling
 */

import { Env } from '../index';
import { RpcMethodMap, RpcMethod, RpcSuccessResponse, RpcErrorResponse } from './schema';
import * as weatherService from '../services/weather-service';
import * as reschedulerService from '../services/rescheduler';
import * as seedDataService from '../services/seed-data';
import * as flightListService from '../services/flight-list';
import * as classificationService from '../services/classification-service';
import * as candidateSlotService from '../services/candidate-slot-service';
import * as aiRescheduleService from '../services/ai-reschedule-service';
import * as rescheduleActionService from '../services/reschedule-action-service';
import * as cronMonitoringService from '../services/cron-monitoring-service';
import { generateCorrelationId, createContext } from '../lib/logger';

/**
 * Creates a JSON success response
 */
function jsonSuccess<T>(result: T, correlationId: string): Response {
  const response: RpcSuccessResponse<T> = { result, correlationId };
  return new Response(JSON.stringify(response), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Creates a JSON error response
 */
function jsonError(error: string, status: number, correlationId?: string): Response {
  const response: RpcErrorResponse = { error, correlationId };
  return new Response(JSON.stringify(response), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Main RPC request handler
 * Routes incoming RPC calls to appropriate service functions with validation
 */
export async function handleRpc(request: Request, env: Env): Promise<Response> {
  const correlationId = generateCorrelationId('rpc');
  const ctx = createContext(correlationId, env);

  ctx.logger.info('RPC request received');

  try {
    // Parse request body
    let body;
    try {
      body = await request.json();
    } catch (error) {
      ctx.logger.error('Failed to parse JSON', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return jsonError('Invalid JSON in request body', 400, correlationId);
    }

    const method = (body as any).method;
    const params = (body as any).params;

    // Validate method is provided
    if (!method || typeof method !== 'string') {
      ctx.logger.error('Missing or invalid method');
      return jsonError('Method is required and must be a string', 400, correlationId);
    }

    // Validate method exists in RPC method map
    if (!(method in RpcMethodMap)) {
      ctx.logger.error('Unknown method', { method });
      return jsonError(`Unknown method: ${method}`, 400, correlationId);
    }

    const rpcMethod = method as RpcMethod;
    const methodSchema = RpcMethodMap[rpcMethod];

    // Validate params against schema
    const validation = methodSchema.request.safeParse(params || {});
    if (!validation.success) {
      ctx.logger.error('Invalid parameters', {
        method,
        errors: validation.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
      return jsonError(
        `Invalid parameters: ${validation.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
        400,
        correlationId
      );
    }

    ctx.logger.info('RPC method invoked', { method, params: validation.data });

    // Route to appropriate service function
    let result;
    try {
      switch (rpcMethod) {
        case 'weatherPoll':
          result = await weatherService.pollWeather(ctx, validation.data as any);
          break;

        case 'autoReschedule':
          result = await reschedulerService.autoReschedule(ctx, validation.data as any);
          break;

        case 'seedDemoData':
          result = await seedDataService.seedDemoData(ctx, validation.data as any);
          break;

        case 'listFlights':
          result = await flightListService.listFlights(ctx, validation.data as any);
          break;

        case 'classifyFlights':
          result = await classificationService.classifyFlights(ctx, validation.data as any);
          break;

        case 'getWeatherSnapshots':
          result = await weatherService.getWeatherSnapshotsForFlight(ctx, validation.data as any);
          break;

        case 'generateCandidateSlots':
          result = await candidateSlotService.generateCandidateSlots(
            env,
            (validation.data as any).flightId,
            ctx
          );
          break;

        case 'generateRescheduleRecommendations':
          result = await aiRescheduleService.generateRescheduleRecommendations(
            env,
            (validation.data as any).candidateSlotsResult,
            ctx
          );
          break;

        case 'recordManagerDecision':
          result = await rescheduleActionService.recordRescheduleAction(
            env,
            validation.data as any,
            ctx
          );
          break;

        case 'getFlightRescheduleHistory':
          result = await rescheduleActionService.getFlightRescheduleHistory(
            env,
            (validation.data as any).flightId,
            ctx
          );
          break;

        case 'getCronRuns':
          const cronRuns = await cronMonitoringService.getRecentCronRuns(
            ctx,
            (validation.data as any).limit || 10,
            (validation.data as any).status
          );
          result = {
            runs: cronRuns,
            totalCount: cronRuns.length,
          };
          break;

        default:
          // TypeScript should prevent this, but handle defensively
          const exhaustiveCheck: never = rpcMethod;
          throw new Error(`Unhandled method: ${exhaustiveCheck}`);
      }
    } catch (error) {
      // Service execution error
      const errorMessage = error instanceof Error ? error.message : 'Unknown service error';
      ctx.logger.error('RPC service error', {
        method,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });

      return jsonError(errorMessage, 500, correlationId);
    }

    // Validate response against schema (optional but helpful for debugging)
    const responseValidation = methodSchema.response.safeParse(result);
    if (!responseValidation.success) {
      ctx.logger.error('Invalid response from service', {
        method,
        errors: responseValidation.error.issues,
      });
      // Still return the result, but log the validation error
      ctx.logger.warn('Response validation failed, returning anyway', { result });
    }

    ctx.logger.info('RPC request completed', { method, result });
    return jsonSuccess(result, correlationId);

  } catch (error) {
    // Top-level error handler for unexpected errors
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    ctx.logger.error('Unexpected RPC error', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    return jsonError(errorMessage, 500, correlationId);
  }
}
