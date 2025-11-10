/**
 * Seed Data Service
 * Provides demo data seeding functionality for testing and demonstration
 */

import { ExecutionContext } from '../lib/logger';
import { SeedDemoDataRequest, SeedDemoDataResponse } from '../rpc/schema';
import { createClient, prepareQuery, prepareQueryOne } from '../db/client';

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
  ctx.logger.info('Seed demo data started', {
    clearExisting: request.clearExisting,
    mode: 'idempotent (INSERT OR IGNORE - safe to run multiple times)'
  });

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

    const now = new Date();

    // Expanded base datasets
    const studentSeeds = [
      { name: 'John Doe', trainingLevel: 'student' as const, email: 'john.doe@example.com' },
      { name: 'Sarah Smith', trainingLevel: 'private' as const, email: 'sarah.smith@example.com' },
      { name: 'Mike Johnson', trainingLevel: 'instrument' as const, email: 'mike.johnson@example.com' },
      { name: 'Bella Nguyen', trainingLevel: 'student' as const, email: 'bella.nguyen@example.com' },
      { name: 'David Lee', trainingLevel: 'instrument' as const, email: 'david.lee@example.com' },
      { name: 'Carla Fernandez', trainingLevel: 'private' as const, email: 'carla.fernandez@example.com' },
    ];

    const instructorSeeds = [
      { name: 'Alice Williams', certifications: ['CFI', 'CFII'], email: 'alice.williams@example.com' },
      { name: 'Bob Martinez', certifications: ['CFI', 'CFII', 'MEI'], email: 'bob.martinez@example.com' },
      { name: 'Chris Patel', certifications: ['CFI', 'MEI'], email: 'chris.patel@example.com' },
      { name: 'Laura Chen', certifications: ['CFII', 'ATP'], email: 'laura.chen@example.com' },
    ];

    const aircraftSeeds = [
      { registration: 'N12345', category: 'single-engine', status: 'available' },
      { registration: 'N67890', category: 'complex', status: 'available' },
      { registration: 'N24680', category: 'multi-engine', status: 'available' },
      { registration: 'N13579', category: 'single-engine', status: 'available' },
    ];

    // Seed base entities idempotently
    const baseStatements = [
      ...studentSeeds.map((student) =>
        client.db
          .prepare(
            `INSERT OR IGNORE INTO students (name, training_level, email, created_at) VALUES (?, ?, ?, datetime('now'))`
          )
          .bind(student.name, student.trainingLevel, student.email)
      ),
      ...instructorSeeds.map((instructor) =>
        client.db
          .prepare(
            `INSERT OR IGNORE INTO instructors (name, certifications, email, created_at) VALUES (?, ?, ?, datetime('now'))`
          )
          .bind(instructor.name, JSON.stringify(instructor.certifications), instructor.email)
      ),
      ...aircraftSeeds.map((aircraft) =>
        client.db
          .prepare(
            `INSERT OR IGNORE INTO aircraft (registration, category, status, created_at) VALUES (?, ?, ?, datetime('now'))`
          )
          .bind(aircraft.registration, aircraft.category, aircraft.status)
      ),
    ];

    await client.db.batch(baseStatements);

    // Helper to fetch entity IDs by unique keys
    const getIdMap = async (
      table: 'students' | 'instructors',
      keys: string[]
    ): Promise<Map<string, number>> => {
      if (keys.length === 0) return new Map();
      const placeholders = keys.map(() => '?').join(', ');
      const rows = await prepareQuery<{ id: number; email: string }>(
        client,
        `SELECT id, email FROM ${table} WHERE email IN (${placeholders})`,
        keys
      );
      return new Map(rows.map((row) => [row.email, row.id]));
    };

    const getAircraftMap = async (registrations: string[]): Promise<Map<string, number>> => {
      if (registrations.length === 0) return new Map();
      const placeholders = registrations.map(() => '?').join(', ');
      const rows = await prepareQuery<{ id: number; registration: string }>(
        client,
        `SELECT id, registration FROM aircraft WHERE registration IN (${placeholders})`,
        registrations
      );
      return new Map(rows.map((row) => [row.registration, row.id]));
    };

    const studentIdByEmail = await getIdMap('students', studentSeeds.map((s) => s.email));
    const instructorIdByEmail = await getIdMap('instructors', instructorSeeds.map((i) => i.email));
    const aircraftIdByRegistration = await getAircraftMap(aircraftSeeds.map((a) => a.registration));

    const studentTrainingByEmail = new Map(
      studentSeeds.map((student) => [student.email, student.trainingLevel])
    );

    const createTimedDeparture = (
      daysOffset: number,
      hour: number,
      minute: number = 0
    ): Date => {
      const target = new Date(now);
      target.setDate(target.getDate() + daysOffset);
      target.setHours(hour, minute, 0, 0);
      if (target <= now) {
        target.setDate(target.getDate() + 1);
      }
      return target;
    };

    type FlightSeed = {
      scenario: string;
      studentEmail: string;
      instructorEmail: string;
      aircraftRegistration: string;
      departureAirport: string;
      arrivalAirport: string;
      departure: {
        days?: number;
        hour?: number;
        minute?: number;
        offsetHours?: number;
      };
      durationMinutes: number;
    };

    const flightSeeds: FlightSeed[] = [
      {
        scenario: 'coastal-training-hop',
        studentEmail: 'john.doe@example.com',
        instructorEmail: 'alice.williams@example.com',
        aircraftRegistration: 'N12345',
        departureAirport: 'KPAO',
        arrivalAirport: 'KSQL',
        departure: { days: 1, hour: 9, minute: 30 },
        durationMinutes: 90,
      },
      {
        scenario: 'bay-afternoon-crosswind',
        studentEmail: 'sarah.smith@example.com',
        instructorEmail: 'bob.martinez@example.com',
        aircraftRegistration: 'N67890',
        departureAirport: 'KPAO',
        arrivalAirport: 'KHAF',
        departure: { days: 1, hour: 14, minute: 0 },
        durationMinutes: 110,
      },
      {
        scenario: 'gulf-morning-humidity',
        studentEmail: 'carla.fernandez@example.com',
        instructorEmail: 'bob.martinez@example.com',
        aircraftRegistration: 'N67890',
        departureAirport: 'KMSY',
        arrivalAirport: 'KHOU',
        departure: { offsetHours: 8 },
        durationMinutes: 135,
      },
      {
        scenario: 'mountain-pass-winds',
        studentEmail: 'mike.johnson@example.com',
        instructorEmail: 'chris.patel@example.com',
        aircraftRegistration: 'N24680',
        departureAirport: 'KDEN',
        arrivalAirport: 'KASE',
        departure: { days: 3, hour: 8, minute: 5 },
        durationMinutes: 160,
      },
      {
        scenario: 'northwest-low-ceiling',
        studentEmail: 'bella.nguyen@example.com',
        instructorEmail: 'laura.chen@example.com',
        aircraftRegistration: 'N24680',
        departureAirport: 'KSEA',
        arrivalAirport: 'KPDX',
        departure: { days: 2, hour: 7, minute: 20 },
        durationMinutes: 95,
      },
      {
        scenario: 'midwest-crosswind',
        studentEmail: 'david.lee@example.com',
        instructorEmail: 'chris.patel@example.com',
        aircraftRegistration: 'N13579',
        departureAirport: 'KORD',
        arrivalAirport: 'KGRB',
        departure: { days: 4, hour: 9, minute: 50 },
        durationMinutes: 120,
      },
      {
        scenario: 'northeast-watch',
        studentEmail: 'sarah.smith@example.com',
        instructorEmail: 'laura.chen@example.com',
        aircraftRegistration: 'N13579',
        departureAirport: 'KBOS',
        arrivalAirport: 'KBTV',
        departure: { days: 5, hour: 7, minute: 40 },
        durationMinutes: 100,
      },
      {
        scenario: 'desert-heat-turbulence',
        studentEmail: 'mike.johnson@example.com',
        instructorEmail: 'bob.martinez@example.com',
        aircraftRegistration: 'N12345',
        departureAirport: 'KPHX',
        arrivalAirport: 'KABQ',
        departure: { days: 2, hour: 15, minute: 30 },
        durationMinutes: 125,
      },
      {
        scenario: 'alaska-icing-risk',
        studentEmail: 'david.lee@example.com',
        instructorEmail: 'alice.williams@example.com',
        aircraftRegistration: 'N24680',
        departureAirport: 'PANC',
        arrivalAirport: 'PAJN',
        departure: { days: 6, hour: 11, minute: 45 },
        durationMinutes: 170,
      },
      {
        scenario: 'great-lakes-lake-effect',
        studentEmail: 'bella.nguyen@example.com',
        instructorEmail: 'chris.patel@example.com',
        aircraftRegistration: 'N13579',
        departureAirport: 'KDTW',
        arrivalAirport: 'KCLE',
        departure: { days: 3, hour: 12, minute: 15 },
        durationMinutes: 85,
      },
    ] as const;

    let flightsInserted = 0;
    let flightsSkipped = 0;

    for (const flight of flightSeeds) {
      const studentId = studentIdByEmail.get(flight.studentEmail);
      const instructorId = instructorIdByEmail.get(flight.instructorEmail);
      const aircraftId = aircraftIdByRegistration.get(flight.aircraftRegistration);

      if (!studentId || !instructorId || !aircraftId) {
        ctx.logger.error('Missing foreign key for flight seed', {
          scenario: flight.scenario,
          studentFound: !!studentId,
          instructorFound: !!instructorId,
          aircraftFound: !!aircraftId,
        });
        flightsSkipped++;
        continue;
      }

      let departureTime: Date;
      if (typeof flight.departure.offsetHours === 'number') {
        departureTime = new Date(now.getTime() + flight.departure.offsetHours * 60 * 60 * 1000);
        departureTime.setMinutes(flight.departure.minute ?? 0, 0, 0);
      } else {
        departureTime = createTimedDeparture(
          flight.departure.days ?? 0,
          flight.departure.hour ?? 9,
          flight.departure.minute ?? 0
        );
      }

      const arrivalTime = new Date(departureTime.getTime() + flight.durationMinutes * 60 * 1000);
      arrivalTime.setSeconds(0, 0);

      const existing = await prepareQueryOne<{ id: number }>(
        client,
        `SELECT id FROM flights WHERE student_id = ? AND instructor_id = ? AND aircraft_id = ? AND departure_time = ?`,
        [studentId, instructorId, aircraftId, departureTime.toISOString()]
      );

      if (existing) {
        flightsSkipped++;
        continue;
      }

      const insertResult = await client.db
        .prepare(
          `INSERT INTO flights (student_id, instructor_id, aircraft_id, departure_time, arrival_time, departure_airport, arrival_airport, status, weather_status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', 'unknown', datetime('now'), datetime('now'))`
        )
        .bind(
          studentId,
          instructorId,
          aircraftId,
          departureTime.toISOString(),
          arrivalTime.toISOString(),
          flight.departureAirport,
          flight.arrivalAirport
        )
        .run();

      flightsInserted++;

      ctx.logger.info('Demo flight seeded', {
        scenario: flight.scenario,
        flightId: insertResult.meta.last_row_id,
        trainingLevel: studentTrainingByEmail.get(flight.studentEmail),
        departureAirport: flight.departureAirport,
        arrivalAirport: flight.arrivalAirport,
        departureTime: departureTime.toISOString(),
        arrivalTime: arrivalTime.toISOString(),
      });
    }

    ctx.logger.info('Flight seeding summary', {
      totalScenarios: flightSeeds.length,
      flightsInserted,
      flightsSkipped,
    });

    const result = {
      students: studentSeeds.length,
      instructors: instructorSeeds.length,
      aircraft: aircraftSeeds.length,
      flights: flightSeeds.length,
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
