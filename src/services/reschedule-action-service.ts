/**
 * Reschedule Action Service
 * Handles decision persistence and audit trail for flight reschedule actions
 *
 * This service records all rescheduling actions (manual accepts/rejects and auto-reschedule decisions)
 * to the reschedule_actions table with complete audit trail. Maintains 100% auditability as required
 * by PRD FR5 (Data & Audit Trail).
 */

import { ExecutionContext } from '../lib/logger';
import {
  createClient,
  prepareQuery,
  prepareQueryOne,
  prepareExec,
  DbClient,
  Flight,
  WeatherSnapshot,
} from '../db/client';
import { RescheduleRecommendation } from './ai-reschedule-service';

// ========================================
// Type Definitions
// ========================================

/**
 * Request parameters for recording a reschedule action (manual decision)
 */
export interface RecordRescheduleActionParams {
  flightId: number;
  recommendedSlotIndex: number; // 0-2 for top 3 recommendations
  decision: 'accept' | 'reject';
  managerName: string;
  notes?: string;
  topRecommendations?: RescheduleRecommendation[];
}

/**
 * Result from recording a reschedule action
 */
export interface RescheduleActionResult {
  actionId: number;
  status: 'accepted' | 'rejected';
  message: string;
  newFlightId?: number; // Only present for accept decisions
  correlationId: string;
}

/**
 * Single audit trail entry for a reschedule action
 */
export interface RescheduleAuditEntry {
  actionId: number;
  originalFlightId: number;
  newFlightId: number | null;
  originalTime: string; // ISO 8601
  newTime: string | null; // ISO 8601 or null if rejected
  actionType: 'auto-accept' | 'manual-accept' | 'manual-reject';
  decisionSource: 'system' | 'manager';
  decisionBy: string; // Manager name or 'auto-reschedule'
  decidedAt: string; // ISO 8601
  aiConfidence: number | null;
  aiRationale: string | null;
  managerNotes: string | null;
  weatherSnapshot: {
    windSpeed: number;
    visibility: number;
    ceiling: number | null;
    conditions: string;
    confidenceHorizon: number;
  } | null;
  status: 'pending' | 'accepted' | 'rejected';
}

/**
 * Extended flight data with student and related information
 */
interface FlightWithDetails extends Flight {
  student_name: string;
  instructor_name: string;
  aircraft_registration: string;
}

/**
 * Extracted slot data from AI recommendation
 */
interface SlotData {
  instructorId: number;
  instructorName: string;
  aircraftId: number;
  aircraftRegistration: string;
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
}

// ========================================
// Helper Functions - Flight Management
// ========================================

/**
 * Retrieves original flight data with all required details
 * @param client - Database client
 * @param flightId - Flight ID to retrieve
 * @param ctx - Execution context
 * @returns Flight with details or null if not found
 */
async function getOriginalFlightData(
  client: DbClient,
  flightId: number,
  ctx: ExecutionContext
): Promise<FlightWithDetails | null> {
  ctx.logger.info('[reschedule-action] Fetching original flight', {
    correlationId: ctx.correlationId,
    flightId,
  });

  const flight = await prepareQueryOne<FlightWithDetails>(
    client,
    `SELECT f.*, s.name as student_name, i.name as instructor_name, a.registration as aircraft_registration
     FROM flights f
     JOIN students s ON f.student_id = s.id
     JOIN instructors i ON f.instructor_id = i.id
     JOIN aircraft a ON f.aircraft_id = a.id
     WHERE f.id = ?`,
    [flightId]
  );

  if (!flight) {
    ctx.logger.warn('[reschedule-action] Flight not found', {
      correlationId: ctx.correlationId,
      flightId,
    });
    return null;
  }

  ctx.logger.info('[reschedule-action] Original flight fetched', {
    correlationId: ctx.correlationId,
    flightId: flight.id,
    status: flight.status,
    departureTime: flight.departure_time,
  });

  return flight;
}

/**
 * Extracts slot data from AI recommendation
 * @param recommendation - AI recommendation containing candidate slot
 * @param ctx - Execution context
 * @returns Extracted slot data
 */
function extractSlotData(
  recommendation: RescheduleRecommendation,
  ctx: ExecutionContext
): SlotData {
  const candidate = recommendation.originalCandidate;

  ctx.logger.info('[reschedule-action] Extracting slot data', {
    correlationId: ctx.correlationId,
    candidateIndex: recommendation.candidateIndex,
    instructor: candidate.instructorName,
    aircraft: candidate.aircraftRegistration,
  });

  // Validate timestamps
  const departureDate = new Date(candidate.departureTime);
  const arrivalDate = new Date(candidate.arrivalTime);

  if (isNaN(departureDate.getTime()) || isNaN(arrivalDate.getTime())) {
    throw new Error('Invalid departure or arrival time in recommendation');
  }

  return {
    instructorId: candidate.instructorId,
    instructorName: candidate.instructorName,
    aircraftId: candidate.aircraftId,
    aircraftRegistration: candidate.aircraftRegistration,
    departureTime: candidate.departureTime,
    arrivalTime: candidate.arrivalTime,
    durationMinutes: candidate.durationMinutes,
  };
}

/**
 * Creates a new flight record for accepted reschedule
 * @param client - Database client
 * @param originalFlight - Original flight being rescheduled
 * @param slotData - Slot data from recommendation
 * @param ctx - Execution context
 * @returns Newly created flight ID
 */
async function createNewFlight(
  client: DbClient,
  originalFlight: FlightWithDetails,
  slotData: SlotData,
  ctx: ExecutionContext
): Promise<number> {
  ctx.logger.info('[reschedule-action] Creating new flight', {
    correlationId: ctx.correlationId,
    originalFlightId: originalFlight.id,
    departureTime: slotData.departureTime,
    instructor: slotData.instructorName,
    aircraft: slotData.aircraftRegistration,
  });

  const result = await prepareExec(
    client,
    `INSERT INTO flights (
      student_id, instructor_id, aircraft_id,
      departure_time, arrival_time,
      departure_airport, arrival_airport,
      status, weather_status,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', 'unknown', ?, ?)`,
    [
      originalFlight.student_id,
      slotData.instructorId,
      slotData.aircraftId,
      slotData.departureTime,
      slotData.arrivalTime,
      originalFlight.departure_airport,
      originalFlight.arrival_airport,
      new Date().toISOString(),
      new Date().toISOString(),
    ]
  );

  const newFlightId = result.meta.last_row_id;

  if (!newFlightId) {
    throw new Error('Failed to create new flight: no ID returned');
  }

  ctx.logger.info('[reschedule-action] New flight created', {
    correlationId: ctx.correlationId,
    newFlightId,
    originalFlightId: originalFlight.id,
  });

  return newFlightId;
}

/**
 * Marks original flight as rescheduled
 * @param client - Database client
 * @param flightId - Flight ID to update
 * @param ctx - Execution context
 */
async function markOriginalFlightRescheduled(
  client: DbClient,
  flightId: number,
  ctx: ExecutionContext
): Promise<void> {
  ctx.logger.info('[reschedule-action] Marking original flight as rescheduled', {
    correlationId: ctx.correlationId,
    flightId,
  });

  await prepareExec(
    client,
    `UPDATE flights
     SET status = 'rescheduled', updated_at = ?
     WHERE id = ?`,
    [new Date().toISOString(), flightId]
  );

  ctx.logger.info('[reschedule-action] Original flight marked as rescheduled', {
    correlationId: ctx.correlationId,
    flightId,
  });
}

// ========================================
// Helper Functions - Reschedule Action Recording
// ========================================

/**
 * Builds AI rationale JSON for audit trail
 * @param recommendations - Array of AI recommendations
 * @param selectedIndex - Index of selected recommendation
 * @param decision - Accept or reject
 * @param notes - Optional notes
 * @returns JSON string for storage
 */
function buildAiRationaleJson(
  recommendations: RescheduleRecommendation[],
  selectedIndex: number,
  decision: 'accept' | 'reject',
  notes?: string
): string {
  const topThree = recommendations.slice(0, 3);

  const rationaleData = {
    topRecommendations: topThree.map((rec) => ({
      rank: rec.aiRank,
      candidateIndex: rec.candidateIndex,
      instructor: rec.originalCandidate.instructorName,
      aircraft: rec.originalCandidate.aircraftRegistration,
      departureTime: rec.originalCandidate.departureTime,
      aiConfidence: rec.aiConfidence,
      rationale: rec.rationale,
    })),
    selectedIndex: decision === 'accept' ? selectedIndex : null,
    decision,
    notes: notes || null,
  };

  return JSON.stringify(rationaleData);
}

/**
 * Fetches weather snapshot context for a flight
 * @param client - Database client
 * @param flightId - Flight ID
 * @param ctx - Execution context
 * @returns Weather snapshot or null if not found
 */
async function getWeatherSnapshotContext(
  client: DbClient,
  flightId: number,
  ctx: ExecutionContext
): Promise<WeatherSnapshot | null> {
  ctx.logger.info('[reschedule-action] Fetching weather snapshot', {
    correlationId: ctx.correlationId,
    flightId,
  });

  const snapshot = await prepareQueryOne<WeatherSnapshot>(
    client,
    `SELECT * FROM weather_snapshots
     WHERE flight_id = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [flightId]
  );

  if (snapshot) {
    ctx.logger.info('[reschedule-action] Weather snapshot retrieved', {
      correlationId: ctx.correlationId,
      snapshotId: snapshot.id,
      checkpointType: snapshot.checkpoint_type,
    });
  } else {
    ctx.logger.warn('[reschedule-action] No weather snapshot found', {
      correlationId: ctx.correlationId,
      flightId,
    });
  }

  return snapshot;
}

/**
 * Records reschedule action to database
 * @param client - Database client
 * @param actionData - Action data to insert
 * @param ctx - Execution context
 * @returns Action ID
 */
async function insertRescheduleAction(
  client: DbClient,
  actionData: {
    originalFlightId: number;
    newFlightId: number | null;
    actionType: 'auto-accept' | 'manual-accept' | 'manual-reject';
    decisionSource: 'system' | 'manager';
    recommendedByAi: boolean;
    aiRationale: string | null;
    weatherSnapshotId: number | null;
    decidedAt: string;
    decidedBy: string;
    notes: string | null;
    status: 'pending' | 'accepted' | 'rejected';
  },
  ctx: ExecutionContext
): Promise<number> {
  ctx.logger.info('[reschedule-action] Recording reschedule action', {
    correlationId: ctx.correlationId,
    originalFlightId: actionData.originalFlightId,
    newFlightId: actionData.newFlightId,
    actionType: actionData.actionType,
    decisionSource: actionData.decisionSource,
  });

  const result = await prepareExec(
    client,
    `INSERT INTO reschedule_actions (
      original_flight_id, new_flight_id,
      action_type, decision_source,
      recommended_by_ai, ai_rationale,
      weather_snapshot_id, decided_at,
      decided_by, notes, status,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      actionData.originalFlightId,
      actionData.newFlightId,
      actionData.actionType,
      actionData.decisionSource,
      actionData.recommendedByAi ? 1 : 0,
      actionData.aiRationale,
      actionData.weatherSnapshotId,
      actionData.decidedAt,
      actionData.decidedBy,
      actionData.notes,
      actionData.status,
      new Date().toISOString(),
    ]
  );

  const actionId = result.meta.last_row_id;

  if (!actionId) {
    throw new Error('Failed to record reschedule action: no ID returned');
  }

  ctx.logger.info('[reschedule-action] Reschedule action recorded', {
    correlationId: ctx.correlationId,
    actionId,
  });

  return actionId;
}

/**
 * Creates notification for auto-rescheduled flights
 * @param client - Database client
 * @param flightId - Flight ID
 * @param actionId - Action ID
 * @param ctx - Execution context
 */
async function createAutoRescheduleNotification(
  client: DbClient,
  flightId: number,
  actionId: number,
  ctx: ExecutionContext
): Promise<void> {
  ctx.logger.info('[reschedule-action] Creating auto-reschedule notification', {
    correlationId: ctx.correlationId,
    flightId,
    actionId,
  });

  await prepareExec(
    client,
    `INSERT INTO notifications (
      flight_id, type, message, status, created_at
    ) VALUES (?, 'auto-rescheduled', ?, 'unread', ?)`,
    [
      flightId,
      `Flight automatically rescheduled. Review and confirm (Action ID: ${actionId})`,
      new Date().toISOString(),
    ]
  );

  ctx.logger.info('[reschedule-action] Notification created', {
    correlationId: ctx.correlationId,
    flightId,
    actionId,
  });
}

// ========================================
// Main Service Functions
// ========================================

/**
 * Records a manager's reschedule decision (accept or reject)
 * Orchestrates flight creation (for accepts), action recording, and status updates
 *
 * @param env - Cloudflare environment
 * @param params - Decision parameters
 * @param executionContext - Execution context
 * @returns Action result with ID and status
 */
export async function recordRescheduleAction(
  env: any,
  params: RecordRescheduleActionParams,
  executionContext: ExecutionContext
): Promise<RescheduleActionResult> {
  const logger = executionContext.logger;
  const correlationId = executionContext.correlationId;

  logger.info('[reschedule-action] Recording decision', {
    correlationId,
    flightId: params.flightId,
    decision: params.decision,
    managerName: params.managerName,
  });

  try {
    // Input validation
    if (params.flightId <= 0) {
      throw new Error('Invalid flight ID');
    }

    if (!params.decision || !['accept', 'reject'].includes(params.decision)) {
      throw new Error('Decision must be "accept" or "reject"');
    }

    if (!params.managerName || params.managerName.trim() === '') {
      throw new Error('Manager name is required');
    }

    const client = createClient(env.AIRESCHEDULER_DB);

    // Fetch original flight
    const originalFlight = await getOriginalFlightData(client, params.flightId, executionContext);

    if (!originalFlight) {
      return {
        actionId: -1,
        status: params.decision === 'accept' ? 'accepted' : 'rejected',
        message: `Flight not found (ID: ${params.flightId})`,
        correlationId,
      };
    }

    // Get weather snapshot context
    const weatherSnapshot = await getWeatherSnapshotContext(
      client,
      params.flightId,
      executionContext
    );

    let newFlightId: number | undefined;
    let actionId: number;
    let status: 'accepted' | 'rejected';

    if (params.decision === 'accept') {
      // ACCEPT branch: Create new flight and record acceptance
      if (!params.topRecommendations || params.topRecommendations.length === 0) {
        throw new Error('Recommendations required for accept decision');
      }

      const selectedRecommendation = params.topRecommendations[params.recommendedSlotIndex];

      if (!selectedRecommendation) {
        throw new Error(`Invalid recommendation index: ${params.recommendedSlotIndex}`);
      }

      // Extract slot data
      const slotData = extractSlotData(selectedRecommendation, executionContext);

      // Create new flight
      newFlightId = await createNewFlight(client, originalFlight, slotData, executionContext);

      // Update original flight to 'rescheduled'
      await markOriginalFlightRescheduled(client, params.flightId, executionContext);

      // Build AI rationale
      const aiRationale = buildAiRationaleJson(
        params.topRecommendations,
        params.recommendedSlotIndex,
        'accept',
        params.notes
      );

      // Record reschedule action
      actionId = await insertRescheduleAction(
        client,
        {
          originalFlightId: params.flightId,
          newFlightId,
          actionType: 'manual-accept',
          decisionSource: 'manager',
          recommendedByAi: true,
          aiRationale,
          weatherSnapshotId: weatherSnapshot?.id || null,
          decidedAt: new Date().toISOString(),
          decidedBy: params.managerName,
          notes: params.notes || null,
          status: 'accepted',
        },
        executionContext
      );

      status = 'accepted';

      logger.info('[reschedule-action] Accept decision recorded', {
        correlationId,
        actionId,
        newFlightId,
      });
    } else {
      // REJECT branch: Record rejection only, no new flight
      const aiRationale = params.topRecommendations
        ? buildAiRationaleJson(
            params.topRecommendations,
            params.recommendedSlotIndex,
            'reject',
            params.notes
          )
        : null;

      actionId = await insertRescheduleAction(
        client,
        {
          originalFlightId: params.flightId,
          newFlightId: null,
          actionType: 'manual-reject',
          decisionSource: 'manager',
          recommendedByAi: !!params.topRecommendations,
          aiRationale,
          weatherSnapshotId: weatherSnapshot?.id || null,
          decidedAt: new Date().toISOString(),
          decidedBy: params.managerName,
          notes: params.notes || 'No reason provided',
          status: 'rejected',
        },
        executionContext
      );

      status = 'rejected';

      logger.info('[reschedule-action] Reject decision recorded', {
        correlationId,
        actionId,
      });
    }

    const message =
      params.decision === 'accept'
        ? `Flight rescheduled successfully. New flight ID: ${newFlightId}`
        : 'Reschedule rejected and recorded';

    return {
      actionId,
      status,
      message,
      newFlightId,
      correlationId,
    };
  } catch (error) {
    logger.error('[reschedule-action] Error recording decision', {
      correlationId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    throw error;
  }
}

/**
 * Retrieves complete reschedule history for a flight
 *
 * @param env - Cloudflare environment
 * @param flightId - Flight ID to get history for
 * @param executionContext - Execution context
 * @returns Array of audit entries, sorted chronologically (newest first)
 */
export async function getFlightRescheduleHistory(
  env: any,
  flightId: number,
  executionContext: ExecutionContext
): Promise<RescheduleAuditEntry[]> {
  const logger = executionContext.logger;
  const correlationId = executionContext.correlationId;

  logger.info('[reschedule-action] Fetching reschedule history', {
    correlationId,
    flightId,
  });

  try {
    // Input validation
    if (flightId <= 0) {
      throw new Error('Invalid flight ID');
    }

    const client = createClient(env.AIRESCHEDULER_DB);

    // Query reschedule actions with joined flight and weather data
    const actions = await prepareQuery<any>(
      client,
      `SELECT ra.*,
              f_orig.departure_time as original_departure_time,
              f_new.departure_time as new_departure_time,
              ws.wind_speed, ws.visibility, ws.ceiling, ws.conditions, ws.confidence_horizon
       FROM reschedule_actions ra
       JOIN flights f_orig ON ra.original_flight_id = f_orig.id
       LEFT JOIN flights f_new ON ra.new_flight_id = f_new.id
       LEFT JOIN weather_snapshots ws ON ra.weather_snapshot_id = ws.id
       WHERE ra.original_flight_id = ?
       ORDER BY ra.decided_at DESC`,
      [flightId]
    );

    logger.info('[reschedule-action] Reschedule history retrieved', {
      correlationId,
      flightId,
      actionCount: actions.length,
    });

    // Build audit entries
    const auditEntries: RescheduleAuditEntry[] = actions.map((action) => {
      // Parse AI rationale if present
      let aiConfidence: number | null = null;
      let aiRationale: string | null = null;

      if (action.ai_rationale) {
        try {
          const parsed = JSON.parse(action.ai_rationale);
          if (parsed.topRecommendations && parsed.topRecommendations.length > 0) {
            // Get confidence from selected or first recommendation
            const selectedRec = parsed.selectedIndex !== null
              ? parsed.topRecommendations[parsed.selectedIndex]
              : parsed.topRecommendations[0];
            aiConfidence = selectedRec?.aiConfidence || null;
            aiRationale = action.ai_rationale;
          }
        } catch (error) {
          logger.warn('[reschedule-action] Failed to parse AI rationale', {
            correlationId,
            actionId: action.id,
          });
        }
      }

      // Build weather snapshot object if data present
      let weatherSnapshot: RescheduleAuditEntry['weatherSnapshot'] = null;
      if (action.wind_speed !== null && action.wind_speed !== undefined) {
        weatherSnapshot = {
          windSpeed: action.wind_speed,
          visibility: action.visibility,
          ceiling: action.ceiling,
          conditions: action.conditions,
          confidenceHorizon: action.confidence_horizon,
        };
      }

      return {
        actionId: action.id,
        originalFlightId: action.original_flight_id,
        newFlightId: action.new_flight_id,
        originalTime: action.original_departure_time,
        newTime: action.new_departure_time || null,
        actionType: action.action_type,
        decisionSource: action.decision_source,
        decisionBy: action.decided_by,
        decidedAt: action.decided_at,
        aiConfidence,
        aiRationale,
        managerNotes: action.notes,
        weatherSnapshot,
        status: action.status,
      };
    });

    return auditEntries;
  } catch (error) {
    logger.error('[reschedule-action] Error fetching history', {
      correlationId,
      flightId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    throw error;
  }
}

/**
 * Records an auto-reschedule decision from the classification engine
 * Used when confidence ≥80% and flight is <72h out
 *
 * @param env - Cloudflare environment
 * @param flightId - Original flight ID
 * @param topRecommendation - Top AI recommendation to auto-accept
 * @param executionContext - Execution context
 * @returns Action result
 */
export async function recordAutoRescheduleDecision(
  env: any,
  flightId: number,
  topRecommendation: RescheduleRecommendation,
  executionContext: ExecutionContext
): Promise<RescheduleActionResult> {
  const logger = executionContext.logger;
  const correlationId = executionContext.correlationId;

  logger.info('[reschedule-action] Recording auto-reschedule decision', {
    correlationId,
    flightId,
    aiConfidence: topRecommendation.aiConfidence,
  });

  try {
    // Validate confidence threshold
    if (topRecommendation.aiConfidence < 80) {
      throw new Error(
        `Confidence ${topRecommendation.aiConfidence}% below threshold (80%) for auto-reschedule`
      );
    }

    const client = createClient(env.AIRESCHEDULER_DB);

    // Fetch original flight
    const originalFlight = await getOriginalFlightData(client, flightId, executionContext);

    if (!originalFlight) {
      return {
        actionId: -1,
        status: 'accepted',
        message: `Flight not found (ID: ${flightId})`,
        correlationId,
      };
    }

    // Extract slot data
    const slotData = extractSlotData(topRecommendation, executionContext);

    // Create new flight
    const newFlightId = await createNewFlight(client, originalFlight, slotData, executionContext);

    // Update original flight to 'rescheduled'
    await markOriginalFlightRescheduled(client, flightId, executionContext);

    // Get weather snapshot
    const weatherSnapshot = await getWeatherSnapshotContext(client, flightId, executionContext);

    // Build AI rationale
    const aiRationale = JSON.stringify({
      topRecommendations: [
        {
          rank: topRecommendation.aiRank,
          candidateIndex: topRecommendation.candidateIndex,
          instructor: topRecommendation.originalCandidate.instructorName,
          aircraft: topRecommendation.originalCandidate.aircraftRegistration,
          departureTime: topRecommendation.originalCandidate.departureTime,
          aiConfidence: topRecommendation.aiConfidence,
          rationale: topRecommendation.rationale,
        },
      ],
      selectedIndex: 0,
      decision: 'auto-accept',
      notes: `Auto-rescheduled due to weather conflict <72 hours. Confidence: ${topRecommendation.aiConfidence}%. Manager review pending.`,
    });

    // Record reschedule action with 'pending' status
    const actionId = await insertRescheduleAction(
      client,
      {
        originalFlightId: flightId,
        newFlightId,
        actionType: 'auto-accept',
        decisionSource: 'system',
        recommendedByAi: true,
        aiRationale,
        weatherSnapshotId: weatherSnapshot?.id || null,
        decidedAt: new Date().toISOString(),
        decidedBy: 'auto-reschedule',
        notes: `Auto-rescheduled due to weather conflict <72 hours. Confidence: ${topRecommendation.aiConfidence}%. Manager review pending.`,
        status: 'pending',
      },
      executionContext
    );

    // Create notification
    await createAutoRescheduleNotification(client, flightId, actionId, executionContext);

    logger.info('[reschedule-action] Auto-reschedule decision recorded', {
      correlationId,
      actionId,
      newFlightId,
      confidence: topRecommendation.aiConfidence,
    });

    return {
      actionId,
      status: 'accepted',
      message: `Flight auto-rescheduled successfully. New flight ID: ${newFlightId}. Manager review pending.`,
      newFlightId,
      correlationId,
    };
  } catch (error) {
    logger.error('[reschedule-action] Error recording auto-reschedule', {
      correlationId,
      flightId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    throw error;
  }
}
