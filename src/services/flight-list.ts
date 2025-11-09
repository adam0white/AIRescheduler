/**
 * Flight List Service
 * Provides flight listing functionality with filtering and enrichment
 */

import { ExecutionContext } from '../lib/logger';
import { ListFlightsRequest, ListFlightsResponse, FlightDetail } from '../rpc/schema';
import { createClient, prepareQuery } from '../db/client';

/**
 * Lists flights with detailed information including student, instructor, and aircraft names
 * @param ctx - Execution context with correlation ID and logger
 * @param request - Flight list request parameters
 * @returns Flight list response with enriched flight details
 */
export async function listFlights(
  ctx: ExecutionContext,
  request: ListFlightsRequest
): Promise<ListFlightsResponse> {
  ctx.logger.info('List flights started', {
    startDate: request.startDate,
    endDate: request.endDate,
    status: request.status,
    weatherStatus: request.weatherStatus,
  });

  const client = createClient(ctx.env.AIRESCHEDULER_DB);

  try {
    // Build SQL query with optional filters
    let sql = `
      SELECT
        f.id,
        f.departure_time,
        f.arrival_time,
        f.departure_airport,
        f.arrival_airport,
        f.status,
        f.weather_status,
        s.name as student_name,
        i.name as instructor_name,
        a.registration as aircraft_registration
      FROM flights f
      JOIN students s ON f.student_id = s.id
      JOIN instructors i ON f.instructor_id = i.id
      JOIN aircraft a ON f.aircraft_id = a.id
      WHERE 1=1
    `;

    const params: any[] = [];

    if (request.startDate) {
      sql += ' AND f.departure_time >= ?';
      params.push(request.startDate);
    }

    if (request.endDate) {
      sql += ' AND f.departure_time <= ?';
      params.push(request.endDate);
    }

    if (request.status) {
      sql += ' AND f.status = ?';
      params.push(request.status);
    }

    if (request.weatherStatus) {
      sql += ' AND f.weather_status = ?';
      params.push(request.weatherStatus);
    }

    sql += ' ORDER BY f.departure_time ASC';

    // Execute query
    const results = await prepareQuery<any>(client, sql, params);

    // Transform results to FlightDetail format
    const flights: FlightDetail[] = results.map((row) => ({
      id: row.id,
      studentName: row.student_name,
      instructorName: row.instructor_name,
      aircraftRegistration: row.aircraft_registration,
      departureTime: row.departure_time,
      arrivalTime: row.arrival_time,
      departureAirport: row.departure_airport,
      arrivalAirport: row.arrival_airport,
      status: row.status,
      weatherStatus: row.weather_status,
    }));

    const result = {
      flights,
      totalCount: flights.length,
    };

    ctx.logger.info('List flights completed', { flightCount: flights.length });
    return result;
  } catch (error) {
    ctx.logger.error('List flights failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw new Error(`Failed to list flights: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
