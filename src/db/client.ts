/**
 * D1 Database Client Helper Module
 * Provides TypeScript interfaces, query utilities, and prepared statement helpers
 * for the AIRescheduler D1 database
 */

// ========================================
// TypeScript Interfaces for Database Tables
// ========================================

export interface Student {
  id: number;
  name: string;
  training_level: 'student' | 'private' | 'instrument';
  email: string;
  created_at: string; // ISO 8601 datetime
}

export interface Instructor {
  id: number;
  name: string;
  certifications: string; // JSON array of cert types
  email: string;
  created_at: string; // ISO 8601 datetime
}

export interface Aircraft {
  id: number;
  registration: string;
  category: 'single-engine' | 'multi-engine' | 'complex';
  status: 'available' | 'maintenance' | 'reserved';
  created_at: string; // ISO 8601 datetime
}

export interface Flight {
  id: number;
  student_id: number;
  instructor_id: number;
  aircraft_id: number;
  departure_time: string; // ISO 8601 datetime
  arrival_time: string; // ISO 8601 datetime
  departure_airport: string;
  arrival_airport: string;
  status: 'scheduled' | 'rescheduled' | 'completed' | 'cancelled';
  weather_status: 'unknown' | 'clear' | 'advisory' | 'auto-reschedule';
  created_at: string; // ISO 8601 datetime
  updated_at: string; // ISO 8601 datetime
}

export interface WeatherSnapshot {
  id: number;
  flight_id: number;
  checkpoint_type: 'departure' | 'arrival' | 'corridor';
  location: string; // airport code or coordinates
  forecast_time: string; // ISO 8601 datetime
  wind_speed: number; // knots
  visibility: number; // statute miles
  ceiling: number | null; // feet AGL (NULL if unlimited)
  conditions: string; // weather description
  confidence_horizon: number; // hours
  correlation_id: string;
  created_at: string; // ISO 8601 datetime
}

export interface RescheduleAction {
  id: number;
  original_flight_id: number;
  new_flight_id: number | null; // NULL if manual review required
  reason: string;
  ai_rationale: string | null; // JSON with ranked options and reasoning
  status: 'pending' | 'accepted' | 'rejected' | 'manual-review';
  created_by: string;
  created_at: string; // ISO 8601 datetime
}

export interface TrainingThreshold {
  id: number;
  training_level: 'student' | 'private' | 'instrument';
  max_wind_speed: number; // knots
  min_visibility: number; // statute miles
  min_ceiling: number; // feet AGL
  description: string | null;
  created_at: string; // ISO 8601 datetime
}

export interface Notification {
  id: number;
  flight_id: number | null;
  type: 'auto-rescheduled' | 'advisory' | 'action-required' | 'error';
  message: string;
  status: 'unread' | 'read' | 'archived';
  created_at: string; // ISO 8601 datetime
  read_at: string | null; // ISO 8601 datetime
}

// ========================================
// Client Interface and Factory
// ========================================

export interface DbClient {
  db: D1Database;
}

/**
 * Creates a D1 database client wrapper
 * @param db - D1Database instance from Cloudflare Workers environment
 * @returns DbClient wrapper with helper methods
 */
export function createClient(db: D1Database): DbClient {
  return { db };
}

// ========================================
// Query Helper Functions
// ========================================

/**
 * Executes a parameterized query with type-safe results
 * @param client - DbClient instance
 * @param sql - SQL query string with ? placeholders
 * @param params - Array of parameter values to bind
 * @returns Promise resolving to array of typed results
 *
 * @example
 * const students = await prepareQuery<Student>(
 *   client,
 *   'SELECT * FROM students WHERE training_level = ?',
 *   ['student']
 * );
 */
export async function prepareQuery<T>(
  client: DbClient,
  sql: string,
  params: any[]
): Promise<T[]> {
  const stmt = client.db.prepare(sql).bind(...params);
  const result = await stmt.all();
  return result.results as T[];
}

/**
 * Executes a single-row query with type-safe result
 * @param client - DbClient instance
 * @param sql - SQL query string with ? placeholders
 * @param params - Array of parameter values to bind
 * @returns Promise resolving to single typed result or null
 *
 * @example
 * const threshold = await prepareQueryOne<TrainingThreshold>(
 *   client,
 *   'SELECT * FROM training_thresholds WHERE training_level = ?',
 *   ['student']
 * );
 */
export async function prepareQueryOne<T>(
  client: DbClient,
  sql: string,
  params: any[]
): Promise<T | null> {
  const stmt = client.db.prepare(sql).bind(...params);
  const result = await stmt.first();
  return result as T | null;
}

/**
 * Executes a write operation (INSERT, UPDATE, DELETE)
 * @param client - DbClient instance
 * @param sql - SQL command string with ? placeholders
 * @param params - Array of parameter values to bind
 * @returns Promise resolving to D1Result with metadata
 *
 * @example
 * const result = await prepareExec(
 *   client,
 *   'INSERT INTO students (name, training_level, email) VALUES (?, ?, ?)',
 *   ['John Doe', 'student', 'john@example.com']
 * );
 * console.log('Inserted ID:', result.meta.last_row_id);
 */
export async function prepareExec(
  client: DbClient,
  sql: string,
  params: any[]
): Promise<D1Result> {
  const stmt = client.db.prepare(sql).bind(...params);
  return await stmt.run();
}

/**
 * Executes multiple statements atomically using D1's batch API
 * IMPORTANT: D1 does not support traditional BEGIN/COMMIT transactions
 * Use db.batch() to execute multiple statements atomically
 *
 * @param client - DbClient instance
 * @param statements - Array of prepared D1PreparedStatements
 * @returns Promise resolving to array of D1Results
 *
 * @example
 * const stmt1 = client.db.prepare('INSERT INTO students ...').bind(...);
 * const stmt2 = client.db.prepare('INSERT INTO flights ...').bind(...);
 * const results = await transaction(client, [stmt1, stmt2]);
 */
export async function transaction(
  client: DbClient,
  statements: D1PreparedStatement[]
): Promise<D1Result[]> {
  return await client.db.batch(statements);
}

// ========================================
// Common Query Builders
// ========================================

/**
 * Retrieves all training thresholds
 * @param client - DbClient instance
 * @returns Promise resolving to array of TrainingThreshold records
 */
export async function getAllTrainingThresholds(
  client: DbClient
): Promise<TrainingThreshold[]> {
  return prepareQuery<TrainingThreshold>(
    client,
    'SELECT * FROM training_thresholds ORDER BY max_wind_speed',
    []
  );
}

/**
 * Retrieves threshold for a specific training level
 * @param client - DbClient instance
 * @param level - Training level (student, private, instrument)
 * @returns Promise resolving to TrainingThreshold or null
 */
export async function getThresholdByLevel(
  client: DbClient,
  level: 'student' | 'private' | 'instrument'
): Promise<TrainingThreshold | null> {
  return prepareQueryOne<TrainingThreshold>(
    client,
    'SELECT * FROM training_thresholds WHERE training_level = ?',
    [level]
  );
}

/**
 * Retrieves all scheduled flights within a time range
 * @param client - DbClient instance
 * @param startTime - ISO 8601 datetime string
 * @param endTime - ISO 8601 datetime string
 * @returns Promise resolving to array of Flight records
 */
export async function getFlightsByTimeRange(
  client: DbClient,
  startTime: string,
  endTime: string
): Promise<Flight[]> {
  return prepareQuery<Flight>(
    client,
    `SELECT * FROM flights
     WHERE departure_time >= ? AND departure_time <= ?
     AND status = 'scheduled'
     ORDER BY departure_time`,
    [startTime, endTime]
  );
}

/**
 * Retrieves student by ID with type safety
 * @param client - DbClient instance
 * @param studentId - Student ID
 * @returns Promise resolving to Student or null
 */
export async function getStudentById(
  client: DbClient,
  studentId: number
): Promise<Student | null> {
  return prepareQueryOne<Student>(
    client,
    'SELECT * FROM students WHERE id = ?',
    [studentId]
  );
}
