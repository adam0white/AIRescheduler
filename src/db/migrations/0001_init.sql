-- Migration 0001: Initial Schema
-- Creates all core tables for AIRescheduler application
-- Tables: students, instructors, aircraft, flights, weather_snapshots, reschedule_actions, training_thresholds, notifications

-- Enable foreign key constraints
PRAGMA foreign_keys = ON;

-- Students table
-- Stores student pilot information and training level
CREATE TABLE students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  training_level TEXT NOT NULL CHECK(training_level IN ('student', 'private', 'instrument')),
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Instructors table
-- Stores flight instructor information and certifications
CREATE TABLE instructors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  certifications TEXT NOT NULL, -- JSON array of cert types
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Aircraft table
-- Stores aircraft registration, category, and availability status
CREATE TABLE aircraft (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registration TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK(category IN ('single-engine', 'multi-engine', 'complex')),
  status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available', 'maintenance', 'reserved')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Flights table
-- Core flight scheduling table with student, instructor, aircraft assignments
CREATE TABLE flights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  instructor_id INTEGER NOT NULL,
  aircraft_id INTEGER NOT NULL,
  departure_time TEXT NOT NULL, -- ISO 8601 datetime
  arrival_time TEXT NOT NULL,   -- ISO 8601 datetime
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

-- Weather Snapshots table
-- Stores weather forecast data for flight checkpoints (departure, arrival, corridor)
CREATE TABLE weather_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  flight_id INTEGER NOT NULL,
  checkpoint_type TEXT NOT NULL CHECK(checkpoint_type IN ('departure', 'arrival', 'corridor')),
  location TEXT NOT NULL, -- airport code or coordinates
  forecast_time TEXT NOT NULL, -- ISO 8601 datetime
  wind_speed INTEGER NOT NULL, -- knots
  visibility REAL NOT NULL,    -- statute miles
  ceiling INTEGER,             -- feet AGL (NULL if unlimited)
  conditions TEXT NOT NULL,    -- weather description
  confidence_horizon INTEGER NOT NULL, -- hours
  correlation_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (flight_id) REFERENCES flights(id)
);

-- Reschedule Actions table
-- Audit log of all reschedule events (auto or manual) with AI rationale
CREATE TABLE reschedule_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  original_flight_id INTEGER NOT NULL,
  new_flight_id INTEGER,  -- NULL if manual review required
  reason TEXT NOT NULL,
  ai_rationale TEXT,      -- JSON with ranked options and reasoning
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected', 'manual-review')),
  created_by TEXT DEFAULT 'system',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (original_flight_id) REFERENCES flights(id),
  FOREIGN KEY (new_flight_id) REFERENCES flights(id)
);

-- Training Thresholds table
-- Defines weather minimums for each training level (student, private, instrument)
CREATE TABLE training_thresholds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  training_level TEXT NOT NULL UNIQUE CHECK(training_level IN ('student', 'private', 'instrument')),
  max_wind_speed INTEGER NOT NULL,  -- knots
  min_visibility REAL NOT NULL,     -- statute miles
  min_ceiling INTEGER NOT NULL,     -- feet AGL
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Notifications table
-- Stores user-facing alerts for flight changes, advisories, and errors
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  flight_id INTEGER,
  type TEXT NOT NULL CHECK(type IN ('auto-rescheduled', 'advisory', 'action-required', 'error')),
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unread' CHECK(status IN ('unread', 'read', 'archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  read_at TEXT,
  FOREIGN KEY (flight_id) REFERENCES flights(id)
);
