-- Migration 0005: Update reschedule_actions table for Story 3.3
-- Adds new columns for decision persistence and audit trail functionality
-- Adds indexes for performance

-- Add new columns to reschedule_actions table
ALTER TABLE reschedule_actions ADD COLUMN action_type TEXT CHECK(action_type IN ('auto-accept', 'manual-accept', 'manual-reject'));
ALTER TABLE reschedule_actions ADD COLUMN decision_source TEXT CHECK(decision_source IN ('system', 'manager'));
ALTER TABLE reschedule_actions ADD COLUMN recommended_by_ai INTEGER DEFAULT 0; -- Boolean: 0 = false, 1 = true
ALTER TABLE reschedule_actions ADD COLUMN weather_snapshot_id INTEGER;
ALTER TABLE reschedule_actions ADD COLUMN decided_at TEXT; -- ISO 8601 datetime
ALTER TABLE reschedule_actions ADD COLUMN decided_by TEXT; -- Manager name or 'auto-reschedule'
ALTER TABLE reschedule_actions ADD COLUMN notes TEXT; -- Optional notes from manager

-- Add foreign key for weather_snapshot_id (Note: SQLite doesn't support adding FK constraints after table creation in ALTER TABLE)
-- So we'll rely on application-level validation for weather_snapshot_id

-- Add indexes for query performance
CREATE INDEX IF NOT EXISTS idx_reschedule_actions_original_flight_id ON reschedule_actions(original_flight_id);
CREATE INDEX IF NOT EXISTS idx_reschedule_actions_decided_at ON reschedule_actions(decided_at);
CREATE INDEX IF NOT EXISTS idx_reschedule_actions_status ON reschedule_actions(status);
CREATE INDEX IF NOT EXISTS idx_reschedule_actions_decision_source ON reschedule_actions(decision_source);
