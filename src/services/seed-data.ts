/**
 * Seed Data Service
 * Provides demo data seeding functionality for testing and demonstration
 */

import { ExecutionContext } from '../lib/logger';
import { SeedDemoDataRequest, SeedDemoDataResponse } from '../rpc/schema';
import { createClient } from '../db/client';

/**
 * Seeds the database with demo data for testing
 * Creates sample students, instructors, aircraft, and flights
 * @param ctx - Execution context with correlation ID and logger
 * @param request - Seed data request parameters
 * @returns Seed data response with counts
 */
export async function seedDemoData(
  ctx: ExecutionContext,
  request: SeedDemoDataRequest
): Promise<SeedDemoDataResponse> {
  ctx.logger.info('Seed demo data started', { clearExisting: request.clearExisting });

  const client = createClient(ctx.env.AIRESCHEDULER_DB);

  try {
    // Optionally clear existing data
    // Must delete in reverse dependency order due to foreign keys
    if (request.clearExisting) {
      ctx.logger.info('Clearing existing data');

      // First delete dependent tables (those with foreign keys)
      await client.db.batch([
        client.db.prepare('DELETE FROM reschedule_actions'),
        client.db.prepare('DELETE FROM weather_snapshots'),
        client.db.prepare('DELETE FROM notifications'),
        client.db.prepare('DELETE FROM flights'),
      ]);

      // Then delete base tables (no dependencies)
      await client.db.batch([
        client.db.prepare('DELETE FROM aircraft'),
        client.db.prepare('DELETE FROM instructors'),
        client.db.prepare('DELETE FROM students'),
      ]);

      ctx.logger.info('Existing data cleared successfully');
    }

    // Calculate dates for flights
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);

    const day3 = new Date(now);
    day3.setDate(day3.getDate() + 3);
    day3.setHours(9, 0, 0, 0);

    const day5 = new Date(now);
    day5.setDate(day5.getDate() + 5);
    day5.setHours(11, 0, 0, 0);

    const day7 = new Date(now);
    day7.setDate(day7.getDate() + 7);
    day7.setHours(13, 0, 0, 0);

    const tomorrow2pm = new Date(tomorrow);
    tomorrow2pm.setHours(14, 0, 0, 0);

    // Helper to add hours to a date
    const addHours = (date: Date, hours: number): Date => {
      const result = new Date(date);
      result.setHours(result.getHours() + hours);
      return result;
    };

    // Insert base entities first (students, instructors, aircraft)
    // These have no foreign key dependencies
    const baseEntities = [
      // Insert 3 students
      client.db
        .prepare(`INSERT INTO students (name, training_level, email, created_at) VALUES (?, ?, ?, datetime('now'))`)
        .bind('John Doe', 'student', 'john.doe@example.com'),
      client.db
        .prepare(`INSERT INTO students (name, training_level, email, created_at) VALUES (?, ?, ?, datetime('now'))`)
        .bind('Sarah Smith', 'private', 'sarah.smith@example.com'),
      client.db
        .prepare(`INSERT INTO students (name, training_level, email, created_at) VALUES (?, ?, ?, datetime('now'))`)
        .bind('Mike Johnson', 'instrument', 'mike.johnson@example.com'),

      // Insert 2 instructors
      client.db
        .prepare(`INSERT INTO instructors (name, certifications, email, created_at) VALUES (?, ?, ?, datetime('now'))`)
        .bind('Alice Williams', JSON.stringify(['CFI', 'CFII']), 'alice.williams@example.com'),
      client.db
        .prepare(`INSERT INTO instructors (name, certifications, email, created_at) VALUES (?, ?, ?, datetime('now'))`)
        .bind('Bob Martinez', JSON.stringify(['CFI', 'CFII', 'MEI']), 'bob.martinez@example.com'),

      // Insert 2 aircraft
      client.db
        .prepare(`INSERT INTO aircraft (registration, category, status, created_at) VALUES (?, ?, ?, datetime('now'))`)
        .bind('N12345', 'single-engine', 'available'),
      client.db
        .prepare(`INSERT INTO aircraft (registration, category, status, created_at) VALUES (?, ?, ?, datetime('now'))`)
        .bind('N67890', 'complex', 'available'),
    ];

    // Execute base entities batch first
    await client.db.batch(baseEntities);

    // Now insert flights (which have foreign keys to students, instructors, aircraft)
    const flightStatements = [
      // Insert 5 flights
      // Flight 1: Tomorrow 10am, John (student #1) + Alice (instructor #1) + N12345 (aircraft #1)
      client.db
        .prepare(`INSERT INTO flights (student_id, instructor_id, aircraft_id, departure_time, arrival_time, departure_airport, arrival_airport, status, weather_status, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', 'unknown', datetime('now'), datetime('now'))`)
        .bind(
          1, // John (first student)
          1, // Alice (first instructor)
          1, // N12345 (first aircraft)
          tomorrow.toISOString(),
          addHours(tomorrow, 2).toISOString(),
          'KPAO',
          'KSQL'
        ),

      // Flight 2: Tomorrow 2pm, Sarah (student #2) + Bob (instructor #2) + N67890 (aircraft #2)
      client.db
        .prepare(`INSERT INTO flights (student_id, instructor_id, aircraft_id, departure_time, arrival_time, departure_airport, arrival_airport, status, weather_status, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', 'unknown', datetime('now'), datetime('now'))`)
        .bind(
          2, // Sarah
          2, // Bob
          2, // N67890
          tomorrow2pm.toISOString(),
          addHours(tomorrow2pm, 2).toISOString(),
          'KPAO',
          'KHAF'
        ),

      // Flight 3: In 3 days 9am, Mike (student #3) + Bob (instructor #2) + N67890 (aircraft #2)
      client.db
        .prepare(`INSERT INTO flights (student_id, instructor_id, aircraft_id, departure_time, arrival_time, departure_airport, arrival_airport, status, weather_status, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', 'unknown', datetime('now'), datetime('now'))`)
        .bind(
          3, // Mike
          2, // Bob
          2, // N67890
          day3.toISOString(),
          addHours(day3, 2).toISOString(),
          'KPAO',
          'KSFO'
        ),

      // Flight 4: In 5 days 11am, John (student #1) + Alice (instructor #1) + N12345 (aircraft #1)
      client.db
        .prepare(`INSERT INTO flights (student_id, instructor_id, aircraft_id, departure_time, arrival_time, departure_airport, arrival_airport, status, weather_status, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', 'unknown', datetime('now'), datetime('now'))`)
        .bind(
          1, // John
          1, // Alice
          1, // N12345
          day5.toISOString(),
          addHours(day5, 2).toISOString(),
          'KPAO',
          'KSQL'
        ),

      // Flight 5: In 7 days 1pm, Sarah (student #2) + Alice (instructor #1) + N12345 (aircraft #1)
      client.db
        .prepare(`INSERT INTO flights (student_id, instructor_id, aircraft_id, departure_time, arrival_time, departure_airport, arrival_airport, status, weather_status, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', 'unknown', datetime('now'), datetime('now'))`)
        .bind(
          2, // Sarah
          1, // Alice
          1, // N12345
          day7.toISOString(),
          addHours(day7, 2).toISOString(),
          'KPAO',
          'KHAF'
        ),
    ];

    // Execute flights batch
    await client.db.batch(flightStatements);

    const result = {
      students: 3,
      instructors: 2,
      aircraft: 2,
      flights: 5,
    };

    ctx.logger.info('Seed demo data completed', result);
    return result;
  } catch (error) {
    ctx.logger.error('Seed demo data failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw new Error(`Failed to seed demo data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
