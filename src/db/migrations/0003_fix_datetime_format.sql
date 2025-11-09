-- Migration 0003: Fix ISO 8601 Datetime Format
-- Updates all datetime DEFAULT clauses to use ISO 8601 format (YYYY-MM-DDTHH:MM:SS.sssZ)
-- Affects: students, instructors, aircraft, flights, weather_snapshots, reschedule_actions, training_thresholds, notifications
-- Reason: AC #5 requires ISO 8601 format for all datetime columns

-- Strategy: SQLite doesn't support ALTER COLUMN DEFAULT, so we need to:
-- 1. Create new tables with correct DEFAULT clauses
-- 2. Copy existing data
-- 3. Drop old tables
-- 4. Rename new tables
-- 5. Re-create indexes and foreign keys

-- Disable foreign key constraints temporarily for table recreation
PRAGMA foreign_keys = OFF;

-- ============================================================================
-- STUDENTS TABLE
-- ============================================================================
CREATE TABLE students_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  training_level TEXT NOT NULL CHECK(training_level IN ('student', 'private', 'instrument')),
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO students_new (id, name, training_level, email, created_at)
SELECT id, name, training_level, email, strftime('%Y-%m-%dT%H:%M:%fZ', created_at) FROM students;

DROP TABLE students;
ALTER TABLE students_new RENAME TO students;

-- ============================================================================
-- INSTRUCTORS TABLE
-- ============================================================================
CREATE TABLE instructors_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  certifications TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO instructors_new (id, name, certifications, email, created_at)
SELECT id, name, certifications, email, strftime('%Y-%m-%dT%H:%M:%fZ', created_at) FROM instructors;

DROP TABLE instructors;
ALTER TABLE instructors_new RENAME TO instructors;

-- ============================================================================
-- AIRCRAFT TABLE
-- ============================================================================
CREATE TABLE aircraft_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registration TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK(category IN ('single-engine', 'multi-engine', 'complex')),
  status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available', 'maintenance', 'reserved')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO aircraft_new (id, registration, category, status, created_at)
SELECT id, registration, category, status, strftime('%Y-%m-%dT%H:%M:%fZ', created_at) FROM aircraft;

DROP TABLE aircraft;
ALTER TABLE aircraft_new RENAME TO aircraft;

-- ============================================================================
-- FLIGHTS TABLE
-- ============================================================================
CREATE TABLE flights_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  instructor_id INTEGER NOT NULL,
  aircraft_id INTEGER NOT NULL,
  departure_time TEXT NOT NULL,
  arrival_time TEXT NOT NULL,
  departure_airport TEXT NOT NULL,
  arrival_airport TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled', 'rescheduled', 'completed', 'cancelled')),
  weather_status TEXT DEFAULT 'unknown' CHECK(weather_status IN ('unknown', 'clear', 'advisory', 'auto-reschedule')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (instructor_id) REFERENCES instructors(id),
  FOREIGN KEY (aircraft_id) REFERENCES aircraft(id)
);

INSERT INTO flights_new (id, student_id, instructor_id, aircraft_id, departure_time, arrival_time, departure_airport, arrival_airport, status, weather_status, created_at, updated_at)
SELECT id, student_id, instructor_id, aircraft_id, departure_time, arrival_time, departure_airport, arrival_airport, status, weather_status, strftime('%Y-%m-%dT%H:%M:%fZ', created_at), strftime('%Y-%m-%dT%H:%M:%fZ', updated_at) FROM flights;

DROP TABLE flights;
ALTER TABLE flights_new RENAME TO flights;

-- ============================================================================
-- WEATHER_SNAPSHOTS TABLE
-- ============================================================================
CREATE TABLE weather_snapshots_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  flight_id INTEGER NOT NULL,
  checkpoint_type TEXT NOT NULL CHECK(checkpoint_type IN ('departure', 'arrival', 'corridor')),
  location TEXT NOT NULL,
  forecast_time TEXT NOT NULL,
  wind_speed INTEGER NOT NULL,
  visibility REAL NOT NULL,
  ceiling INTEGER,
  conditions TEXT NOT NULL,
  confidence_horizon INTEGER NOT NULL,
  correlation_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (flight_id) REFERENCES flights(id)
);

INSERT INTO weather_snapshots_new (id, flight_id, checkpoint_type, location, forecast_time, wind_speed, visibility, ceiling, conditions, confidence_horizon, correlation_id, created_at)
SELECT id, flight_id, checkpoint_type, location, forecast_time, wind_speed, visibility, ceiling, conditions, confidence_horizon, correlation_id, strftime('%Y-%m-%dT%H:%M:%fZ', created_at) FROM weather_snapshots;

DROP TABLE weather_snapshots;
ALTER TABLE weather_snapshots_new RENAME TO weather_snapshots;

-- ============================================================================
-- RESCHEDULE_ACTIONS TABLE
-- ============================================================================
CREATE TABLE reschedule_actions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  original_flight_id INTEGER NOT NULL,
  new_flight_id INTEGER,
  reason TEXT NOT NULL,
  ai_rationale TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected', 'manual-review')),
  created_by TEXT DEFAULT 'system',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (original_flight_id) REFERENCES flights(id),
  FOREIGN KEY (new_flight_id) REFERENCES flights(id)
);

INSERT INTO reschedule_actions_new (id, original_flight_id, new_flight_id, reason, ai_rationale, status, created_by, created_at)
SELECT id, original_flight_id, new_flight_id, reason, ai_rationale, status, created_by, strftime('%Y-%m-%dT%H:%M:%fZ', created_at) FROM reschedule_actions;

DROP TABLE reschedule_actions;
ALTER TABLE reschedule_actions_new RENAME TO reschedule_actions;

-- ============================================================================
-- TRAINING_THRESHOLDS TABLE (includes re-seeding with ISO 8601 format)
-- ============================================================================
CREATE TABLE training_thresholds_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  training_level TEXT NOT NULL UNIQUE CHECK(training_level IN ('student', 'private', 'instrument')),
  max_wind_speed INTEGER NOT NULL,
  min_visibility REAL NOT NULL,
  min_ceiling INTEGER NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Re-seed with correct ISO 8601 format
INSERT INTO training_thresholds_new (training_level, max_wind_speed, min_visibility, min_ceiling, description)
VALUES
  ('student', 10, 5.0, 3000, 'Student pilot VFR requirements'),
  ('private', 15, 3.0, 1500, 'Private pilot VFR minimums'),
  ('instrument', 20, 1.0, 500, 'Instrument approach minimums');

DROP TABLE training_thresholds;
ALTER TABLE training_thresholds_new RENAME TO training_thresholds;

-- ============================================================================
-- NOTIFICATIONS TABLE
-- ============================================================================
CREATE TABLE notifications_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  flight_id INTEGER,
  type TEXT NOT NULL CHECK(type IN ('auto-rescheduled', 'advisory', 'action-required', 'error')),
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unread' CHECK(status IN ('unread', 'read', 'archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  read_at TEXT,
  FOREIGN KEY (flight_id) REFERENCES flights(id)
);

INSERT INTO notifications_new (id, flight_id, type, message, status, created_at, read_at)
SELECT id, flight_id, type, message, status, strftime('%Y-%m-%dT%H:%M:%fZ', created_at),
  CASE WHEN read_at IS NOT NULL THEN strftime('%Y-%m-%dT%H:%M:%fZ', read_at) ELSE NULL END
FROM notifications;

DROP TABLE notifications;
ALTER TABLE notifications_new RENAME TO notifications;

-- Re-enable foreign key constraints
PRAGMA foreign_keys = ON;
