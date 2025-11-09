/**
 * AIRescheduler Worker Entry Point
 * Handles both HTTP requests (dashboard + RPC) and scheduled tasks (cron)
 */

import { createClient, getAllTrainingThresholds } from './db/client';
import { handleRpc } from './rpc/handlers';
import { generateCorrelationId, createContext } from './lib/logger';
import * as weatherService from './services/weather-service';
import * as reschedulerService from './services/rescheduler';
import { getAssetFromKV } from '@cloudflare/kv-asset-handler';

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

    execCtx.logger.info('Cron triggered', {
      scheduledTime: new Date(event.scheduledTime).toISOString(),
      cron: event.cron,
    });

    try {
      // Orchestrate weather polling and auto-rescheduling pipeline
      const weatherResult = await weatherService.pollWeather(execCtx, {});
      const rescheduleResult = await reschedulerService.autoReschedule(execCtx, {});

      execCtx.logger.info('Cron completed', {
        weatherResult,
        rescheduleResult,
      });
    } catch (error) {
      execCtx.logger.error('Cron failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  },
};
