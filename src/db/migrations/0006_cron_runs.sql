-- Migration 0006: Cron Runs Table for Story 5.3
-- Creates cron_runs table for monitoring cron execution history
-- Stores metrics, status, and error details for each cron pipeline execution

-- Cron Runs table
-- Tracks each cron execution with comprehensive metrics for dashboard monitoring
CREATE TABLE cron_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  correlation_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('success', 'partial', 'error')),
  started_at TEXT NOT NULL, -- ISO 8601 datetime
  completed_at TEXT NOT NULL, -- ISO 8601 datetime
  duration_ms INTEGER NOT NULL,
  error_count INTEGER NOT NULL DEFAULT 0,
  weather_snapshots_created INTEGER DEFAULT 0,
  flights_analyzed INTEGER DEFAULT 0,
  weather_conflicts_found INTEGER DEFAULT 0,
  flights_rescheduled INTEGER DEFAULT 0,
  flights_pending_review INTEGER DEFAULT 0,
  flights_skipped INTEGER DEFAULT 0,
  error_details TEXT, -- JSON array of error messages
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_cron_runs_correlation_id ON cron_runs(correlation_id);
CREATE INDEX IF NOT EXISTS idx_cron_runs_status ON cron_runs(status);
CREATE INDEX IF NOT EXISTS idx_cron_runs_created_at ON cron_runs(created_at);

-- Update notifications table to support cron-error type
-- Note: SQLite doesn't support ALTER TABLE CHECK constraint modifications
-- We'll handle 'cron-error' type at the application level for backward compatibility
