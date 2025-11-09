/**
 * Classification Service
 * Handles flight classification based on weather thresholds and time horizons
 *
 * Classification Logic:
 * 1. Load training threshold based on student's training level
 * 2. Retrieve weather snapshots for all three checkpoints (departure, arrival, corridor)
 * 3. Evaluate each checkpoint against thresholds (wind, visibility, ceiling)
 * 4. Apply worst-case logic: ANY checkpoint breach fails the entire flight
 * 5. Calculate time horizon: <72h triggers auto-reschedule, ≥72h triggers advisory
 * 6. Update flight weather_status in database
 * 7. Return classification result with breach details
 */

import { ExecutionContext } from '../lib/logger';
import {
  createClient,
  prepareQuery,
  prepareQueryOne,
  prepareExec,
  Flight,
  WeatherSnapshot,
  TrainingThreshold,
} from '../db/client';

// ========================================
// Constants
// ========================================

/**
 * Time horizon threshold for automatic rescheduling (in hours)
 * Flights within this window trigger auto-reschedule, beyond it trigger advisory
 */
const RESCHEDULE_HORIZON = 72; // hours

// ========================================
// Type Definitions
// ========================================

/**
 * Request to classify flights by weather conditions
 */
export interface FlightClassificationRequest {
  flightIds?: number[]; // Optional: specific flight IDs, omit for all upcoming flights
}

/**
 * Individual checkpoint breach details
 */
export interface CheckpointBreach {
  checkpointType: 'departure' | 'arrival' | 'corridor';
  location: string;
  breaches: {
    wind?: boolean;
    visibility?: boolean;
    ceiling?: boolean;
  };
  conditions: {
    windSpeed: number;
    visibility: number;
    ceiling: number | null;
  };
  thresholds: {
    maxWind: number;
    minVisibility: number;
    minCeiling: number;
  };
}

/**
 * Classification result for a single flight
 */
export interface ClassificationResult {
  flightId: number;
  weatherStatus: 'clear' | 'advisory' | 'auto-reschedule' | 'unknown';
  reason: string;
  breachedCheckpoints: CheckpointBreach[];
  hoursUntilDeparture: number;
}

/**
 * Response containing classification results for all processed flights
 */
export interface FlightClassificationResponse {
  results: ClassificationResult[];
}

/**
 * Extended flight data with student information
 */
interface FlightWithStudent extends Flight {
  training_level: string;
}

// ========================================
// Training Threshold Lookup
// ========================================

/**
 * Retrieves training threshold for a given training level
 * @param ctx - Execution context
 * @param trainingLevel - Training level (student, private, instrument)
 * @returns Training threshold or null if not found
 */
async function getTrainingThreshold(
  ctx: ExecutionContext,
  trainingLevel: 'student' | 'private' | 'instrument'
): Promise<TrainingThreshold | null> {
  ctx.logger.info('Loading training threshold', { trainingLevel });

  const client = createClient(ctx.env.AIRESCHEDULER_DB);

  const threshold = await prepareQueryOne<TrainingThreshold>(
    client,
    `SELECT * FROM training_thresholds WHERE training_level = ?`,
    [trainingLevel]
  );

  if (threshold) {
    ctx.logger.info('Threshold loaded', {
      trainingLevel: threshold.training_level,
      maxWind: threshold.max_wind_speed,
      minVis: threshold.min_visibility,
      minCeiling: threshold.min_ceiling,
    });
  } else {
    ctx.logger.warn('Threshold not found', { trainingLevel });
  }

  return threshold;
}

// ========================================
// Weather Snapshot Retrieval
// ========================================

/**
 * Retrieves most recent weather snapshots for a flight
 * @param ctx - Execution context
 * @param flightId - Flight ID
 * @returns Array of weather snapshots (up to 3: departure, arrival, corridor)
 */
async function getFlightWeatherSnapshots(
  ctx: ExecutionContext,
  flightId: number
): Promise<WeatherSnapshot[]> {
  const client = createClient(ctx.env.AIRESCHEDULER_DB);

  // Get the most recent snapshot for each checkpoint type
  const snapshots = await prepareQuery<WeatherSnapshot>(
    client,
    `SELECT ws.*
     FROM weather_snapshots ws
     INNER JOIN (
       SELECT checkpoint_type, MAX(created_at) as max_created
       FROM weather_snapshots
       WHERE flight_id = ?
       GROUP BY checkpoint_type
     ) latest
     ON ws.checkpoint_type = latest.checkpoint_type
     AND ws.created_at = latest.max_created
     WHERE ws.flight_id = ?`,
    [flightId, flightId]
  );

  ctx.logger.info('Weather snapshots retrieved', {
    flightId,
    snapshotCount: snapshots.length,
    checkpoints: snapshots.map((s) => s.checkpoint_type),
  });

  return snapshots;
}

// ========================================
// Threshold Evaluation
// ========================================

/**
 * Evaluates weather conditions against training thresholds
 * @param snapshot - Weather snapshot to evaluate
 * @param threshold - Training threshold to compare against
 * @returns Object with pass/fail result and breach details
 */
function evaluateWeatherConditions(
  snapshot: WeatherSnapshot,
  threshold: TrainingThreshold
): {
  passed: boolean;
  breaches: { wind: boolean; visibility: boolean; ceiling: boolean };
} {
  const windBreach = snapshot.wind_speed > threshold.max_wind_speed;
  const visibilityBreach = snapshot.visibility < threshold.min_visibility;
  // NULL ceiling means unlimited (sky clear), which passes any ceiling threshold
  const ceilingBreach =
    snapshot.ceiling !== null && snapshot.ceiling < threshold.min_ceiling;

  const passed = !windBreach && !visibilityBreach && !ceilingBreach;

  return {
    passed,
    breaches: {
      wind: windBreach,
      visibility: visibilityBreach,
      ceiling: ceilingBreach,
    },
  };
}

// ========================================
// Time Horizon Calculation
// ========================================

/**
 * Calculates hours until departure and determines if within reschedule window
 * @param departureTime - ISO 8601 departure time string
 * @returns Object with hours until departure and reschedule window flag
 */
function calculateTimeHorizon(departureTime: string): {
  hoursUntilDeparture: number;
  isWithinRescheduleWindow: boolean;
} {
  const now = new Date();
  const departureDate = new Date(departureTime);
  const hoursUntilDeparture =
    (departureDate.getTime() - now.getTime()) / (1000 * 60 * 60);
  const isWithinRescheduleWindow = hoursUntilDeparture < RESCHEDULE_HORIZON;

  return { hoursUntilDeparture, isWithinRescheduleWindow };
}

// ========================================
// Flight Classification Orchestration
// ========================================

/**
 * Classifies a single flight based on weather conditions and time horizon
 * @param ctx - Execution context
 * @param flight - Flight with student training level
 * @returns Classification result
 */
async function classifyFlight(
  ctx: ExecutionContext,
  flight: FlightWithStudent
): Promise<ClassificationResult> {
  ctx.logger.info('Classifying flight', {
    flightId: flight.id,
    trainingLevel: flight.training_level,
    departureTime: flight.departure_time,
  });

  // Get training threshold
  const trainingLevel = flight.training_level as 'student' | 'private' | 'instrument';
  const threshold = await getTrainingThreshold(ctx, trainingLevel);

  if (!threshold) {
    ctx.logger.error('Training threshold not found', {
      flightId: flight.id,
      trainingLevel,
    });
    return {
      flightId: flight.id,
      weatherStatus: 'unknown',
      reason: `Training threshold not found for level: ${trainingLevel}`,
      breachedCheckpoints: [],
      hoursUntilDeparture: 0,
    };
  }

  // Get weather snapshots
  const snapshots = await getFlightWeatherSnapshots(ctx, flight.id);

  // Check if we have all three checkpoints
  const requiredCheckpoints = ['departure', 'arrival', 'corridor'];
  const availableCheckpoints = snapshots.map((s) => s.checkpoint_type);
  const missingCheckpoints = requiredCheckpoints.filter(
    (cp) => !availableCheckpoints.includes(cp as any)
  );

  if (missingCheckpoints.length > 0) {
    ctx.logger.warn('Missing weather snapshots', {
      flightId: flight.id,
      missingCheckpoints,
    });
    return {
      flightId: flight.id,
      weatherStatus: 'unknown',
      reason: `Missing weather data for checkpoints: ${missingCheckpoints.join(', ')}`,
      breachedCheckpoints: [],
      hoursUntilDeparture: 0,
    };
  }

  // Calculate time horizon
  const { hoursUntilDeparture, isWithinRescheduleWindow } = calculateTimeHorizon(
    flight.departure_time
  );

  ctx.logger.info('Time horizon calculated', {
    flightId: flight.id,
    hoursUntilDeparture: Math.round(hoursUntilDeparture),
    isWithinRescheduleWindow,
  });

  // Evaluate each checkpoint
  const breachedCheckpoints: CheckpointBreach[] = [];
  let allCheckpointsPassed = true;

  for (const snapshot of snapshots) {
    const evaluation = evaluateWeatherConditions(snapshot, threshold);

    ctx.logger.info('Evaluating checkpoint', {
      flightId: flight.id,
      checkpointType: snapshot.checkpoint_type,
      conditions: {
        wind: snapshot.wind_speed,
        visibility: snapshot.visibility,
        ceiling: snapshot.ceiling,
      },
      thresholds: {
        maxWind: threshold.max_wind_speed,
        minVis: threshold.min_visibility,
        minCeiling: threshold.min_ceiling,
      },
      passed: evaluation.passed,
    });

    if (!evaluation.passed) {
      allCheckpointsPassed = false;

      ctx.logger.warn('Checkpoint threshold breached', {
        flightId: flight.id,
        checkpointType: snapshot.checkpoint_type,
        breaches: evaluation.breaches,
      });

      breachedCheckpoints.push({
        checkpointType: snapshot.checkpoint_type,
        location: snapshot.location,
        breaches: evaluation.breaches,
        conditions: {
          windSpeed: snapshot.wind_speed,
          visibility: snapshot.visibility,
          ceiling: snapshot.ceiling,
        },
        thresholds: {
          maxWind: threshold.max_wind_speed,
          minVisibility: threshold.min_visibility,
          minCeiling: threshold.min_ceiling,
        },
      });
    }
  }

  // Determine weather status based on worst-case logic and time horizon
  let weatherStatus: 'clear' | 'advisory' | 'auto-reschedule';
  let reason: string;

  if (allCheckpointsPassed) {
    weatherStatus = 'clear';
    reason = 'All checkpoints pass weather thresholds';
  } else if (isWithinRescheduleWindow) {
    weatherStatus = 'auto-reschedule';
    const breachSummary = breachedCheckpoints
      .map((bc) => {
        const issues = [];
        if (bc.breaches.wind) issues.push('wind');
        if (bc.breaches.visibility) issues.push('visibility');
        if (bc.breaches.ceiling) issues.push('ceiling');
        return `${bc.checkpointType} (${issues.join(', ')})`;
      })
      .join('; ');
    reason = `Weather thresholds breached within 72h window: ${breachSummary}`;
  } else {
    weatherStatus = 'advisory';
    const breachSummary = breachedCheckpoints
      .map((bc) => {
        const issues = [];
        if (bc.breaches.wind) issues.push('wind');
        if (bc.breaches.visibility) issues.push('visibility');
        if (bc.breaches.ceiling) issues.push('ceiling');
        return `${bc.checkpointType} (${issues.join(', ')})`;
      })
      .join('; ');
    reason = `Weather thresholds breached beyond 72h window: ${breachSummary}`;
  }

  // Update database
  const client = createClient(ctx.env.AIRESCHEDULER_DB);
  await prepareExec(
    client,
    `UPDATE flights
     SET weather_status = ?, updated_at = ?
     WHERE id = ?`,
    [weatherStatus, new Date().toISOString(), flight.id]
  );

  ctx.logger.info('Flight classified', {
    flightId: flight.id,
    weatherStatus,
    hoursUntilDeparture: Math.round(hoursUntilDeparture),
    breachedCheckpoints: breachedCheckpoints.length,
  });

  return {
    flightId: flight.id,
    weatherStatus,
    reason,
    breachedCheckpoints,
    hoursUntilDeparture,
  };
}

// ========================================
// Batch Classification Service
// ========================================

/**
 * Classifies multiple flights based on weather conditions
 * @param ctx - Execution context
 * @param request - Classification request with optional flight IDs
 * @returns Classification response with results for all processed flights
 */
export async function classifyFlights(
  ctx: ExecutionContext,
  request: FlightClassificationRequest
): Promise<FlightClassificationResponse> {
  ctx.logger.info('Flight classification started', {
    flightCount: request.flightIds?.length || 'all',
  });

  try {
    const client = createClient(ctx.env.AIRESCHEDULER_DB);

    // Query flights with student training level
    let flights: FlightWithStudent[];
    if (request.flightIds && request.flightIds.length > 0) {
      // Query specific flights
      const placeholders = request.flightIds.map(() => '?').join(',');
      flights = await prepareQuery<FlightWithStudent>(
        client,
        `SELECT f.*, s.training_level
         FROM flights f
         INNER JOIN students s ON f.student_id = s.id
         WHERE f.id IN (${placeholders})
         AND f.status = 'scheduled'
         ORDER BY f.departure_time`,
        request.flightIds
      );
    } else {
      // Query all scheduled flights within 7-day horizon
      const now = new Date();
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      flights = await prepareQuery<FlightWithStudent>(
        client,
        `SELECT f.*, s.training_level
         FROM flights f
         INNER JOIN students s ON f.student_id = s.id
         WHERE f.departure_time >= ? AND f.departure_time <= ?
         AND f.status = 'scheduled'
         ORDER BY f.departure_time`,
        [now.toISOString(), sevenDaysFromNow.toISOString()]
      );
    }

    ctx.logger.info('Flights retrieved for classification', {
      count: flights.length,
    });

    // Classify each flight
    const results: ClassificationResult[] = [];
    for (const flight of flights) {
      try {
        const result = await classifyFlight(ctx, flight);
        results.push(result);
      } catch (error) {
        ctx.logger.error('Failed to classify flight', {
          flightId: flight.id,
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        });

        // Add error result
        results.push({
          flightId: flight.id,
          weatherStatus: 'unknown',
          reason: `Classification error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          breachedCheckpoints: [],
          hoursUntilDeparture: 0,
        });
      }
    }

    // Log summary
    const summary = {
      total: results.length,
      clear: results.filter((r) => r.weatherStatus === 'clear').length,
      advisory: results.filter((r) => r.weatherStatus === 'advisory').length,
      autoReschedule: results.filter((r) => r.weatherStatus === 'auto-reschedule')
        .length,
      unknown: results.filter((r) => r.weatherStatus === 'unknown').length,
    };

    ctx.logger.info('Flight classification completed', summary);

    return { results };
  } catch (error) {
    ctx.logger.error('Flight classification failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}
