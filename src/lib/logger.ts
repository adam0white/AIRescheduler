/**
 * Logger Module
 * Provides structured JSON logging with correlation IDs for request tracking
 */

import { Env } from '../index';

/**
 * Log severity levels
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * Structured log entry format
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  correlationId: string;
  message: string;
  metadata?: Record<string, any>;
}

/**
 * Execution context passed to all service functions
 * Contains correlation ID, environment bindings, and logger instance
 */
export interface ExecutionContext {
  correlationId: string;
  env: Env;
  logger: ReturnType<typeof createLogger>;
}

/**
 * Generates a correlation ID for request tracking
 * @param prefix - Prefix identifying the source (rpc or cron)
 * @returns Correlation ID in format: {prefix}-{timestamp}-{uuid}
 */
export function generateCorrelationId(prefix: 'rpc' | 'cron'): string {
  const timestamp = Date.now();
  const uuid = crypto.randomUUID();
  return `${prefix}-${timestamp}-${uuid}`;
}

/**
 * Logs a structured JSON entry to console
 * @param level - Log severity level
 * @param correlationId - Request correlation ID
 * @param message - Log message
 * @param metadata - Optional metadata object
 */
export function log(
  level: LogLevel,
  correlationId: string,
  message: string,
  metadata?: Record<string, any>
): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    correlationId,
    message,
    metadata,
  };
  console.log(JSON.stringify(entry));
}

/**
 * Creates a logger instance bound to a correlation ID
 * @param correlationId - Correlation ID for this execution context
 * @returns Logger instance with debug, info, warn, error methods
 */
export function createLogger(correlationId: string) {
  return {
    debug: (message: string, metadata?: Record<string, any>) =>
      log(LogLevel.DEBUG, correlationId, message, metadata),
    info: (message: string, metadata?: Record<string, any>) =>
      log(LogLevel.INFO, correlationId, message, metadata),
    warn: (message: string, metadata?: Record<string, any>) =>
      log(LogLevel.WARN, correlationId, message, metadata),
    error: (message: string, metadata?: Record<string, any>) =>
      log(LogLevel.ERROR, correlationId, message, metadata),
  };
}

/**
 * Creates an execution context for a request or cron job
 * @param correlationId - Correlation ID for this execution
 * @param env - Worker environment bindings
 * @returns Execution context with correlation ID, env, and logger
 */
export function createContext(correlationId: string, env: Env): ExecutionContext {
  return {
    correlationId,
    env,
    logger: createLogger(correlationId),
  };
}
