/**
 * AIRescheduler Worker Entry Point
 * Handles both HTTP requests (dashboard + RPC) and scheduled tasks (cron)
 */

import { createClient, getAllTrainingThresholds } from './db/client';
import { handleRpc } from './rpc/handlers';
import { generateCorrelationId, createContext } from './lib/logger';
import * as weatherService from './services/weather-service';
import * as reschedulerService from './services/rescheduler';

export interface Env {
  AIRESCHEDULER_DB: D1Database;
  AI_MODEL: Ai;
  WEATHER_API_KEY: string;
}

export default {
  /**
   * Fetch handler - serves dashboard and handles RPC calls
   */
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
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

    // Placeholder: Dashboard route
    if (url.pathname === '/') {
      return new Response(
        `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AIRescheduler Dashboard</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .container {
      text-align: center;
      padding: 2rem;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 1rem;
      backdrop-filter: blur(10px);
    }
    h1 {
      margin: 0 0 1rem 0;
      font-size: 2.5rem;
    }
    p {
      margin: 0;
      opacity: 0.9;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>AIRescheduler Dashboard</h1>
    <p>Project scaffolding complete. Ready for development.</p>
  </div>
</body>
</html>`,
        {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
          },
        }
      );
    }

    // Placeholder: API routes will be implemented in future stories
    return new Response('Not Found', { status: 404 });
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
