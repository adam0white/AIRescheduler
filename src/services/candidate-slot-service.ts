/**
 * Candidate Slot Generation Service
 * Generates alternate time slots for rescheduling conflicted flights
 * Respects instructor availability, aircraft availability, certifications, and constraints
 */

import { ExecutionContext } from '../lib/logger';
import {
  createClient,
  prepareQuery,
  prepareQueryOne,
  Flight,
  Instructor,
  Aircraft,
} from '../db/client';

// ========================================
// Type Definitions
// ========================================

/**
 * Individual candidate slot with all metadata
 */
export interface CandidateSlot {
  slotIndex: number; // 0, 1, 2, ...
  instructorId: number;
  instructorName: string;
  aircraftId: number;
  aircraftRegistration: string;
  departureTime: string; // ISO 8601
  arrivalTime: string; // ISO 8601
  durationMinutes: number;
  confidence: number; // 0-100: how closely matches original slot constraints
  constraints: {
    instructorAvailable: boolean;
    aircraftAvailable: boolean;
    certificationValid: boolean;
    withinTimeWindow: boolean;
    minimumSpacingMet: boolean;
  };
  notes?: string; // e.g., "alternative aircraft category", warnings
}

/**
 * Result containing all candidate slots and metadata
 */
export interface CandidateSlotsResult {
  originalFlightId: number;
  originalDepartureTime: string;
  candidateSlots: CandidateSlot[];
  totalSlotsCandidates: number;
  searchWindowDays: number; // 7
  generatedAt: string; // ISO 8601
  correlationId: string;
  error?: string;
}

/**
 * Time slot representation for calculation
 */
interface TimeSlot {
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  durationMinutes: number;
}

/**
 * Lesson constraints extracted from original flight
 */
interface LessonConstraints {
  durationMinutes: number;
  departureAirport: string;
  arrivalAirport: string;
  operatingStart: number; // hour (e.g., 6 for 06:00)
  operatingEnd: number; // hour (e.g., 18 for 18:00)
}

/**
 * Extended flight with student training level
 */
interface FlightWithStudent extends Flight {
  training_level: string;
}

// ========================================
// Constants
// ========================================

const SEARCH_WINDOW_DAYS = 7;
const MINIMUM_SPACING_HOURS = 6;
const OPERATING_START_HOUR = 6; // 06:00
const OPERATING_END_HOUR = 18; // 18:00
const DURATION_TOLERANCE_MINUTES = 5;
const MAX_CANDIDATES = 15;

// ========================================
// Helper Functions - Instructor Availability
// ========================================

/**
 * Queries instructor's existing flight schedule within date range
 * @param ctx - Execution context
 * @param instructorId - Instructor ID
 * @param startDate - Start of search window (ISO 8601)
 * @param endDate - End of search window (ISO 8601)
 * @returns Array of flights
 */
async function queryInstructorFlights(
  ctx: ExecutionContext,
  instructorId: number,
  startDate: string,
  endDate: string
): Promise<Flight[]> {
  const client = createClient(ctx.env.AIRESCHEDULER_DB);

  const flights = await prepareQuery<Flight>(
    client,
    `SELECT * FROM flights
     WHERE instructor_id = ?
     AND status IN ('scheduled', 'rescheduled')
     AND departure_time >= ?
     AND departure_time <= ?
     ORDER BY departure_time ASC`,
    [instructorId, startDate, endDate]
  );

  return flights;
}

/**
 * Calculates free time slots for instructor
 * @param flights - Sorted array of instructor's flights
 * @param startDate - Search window start
 * @param endDate - Search window end
 * @param targetDuration - Desired lesson duration in minutes
 * @returns Array of free time slots
 */
function calculateInstructorFreeSlots(
  flights: Flight[],
  startDate: string,
  endDate: string,
  targetDuration: number
): TimeSlot[] {
  const freeSlots: TimeSlot[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Iterate day by day
  let currentDay = new Date(start);
  while (currentDay <= end) {
    // Start at operating hours
    let slotStart = new Date(currentDay);
    slotStart.setUTCHours(OPERATING_START_HOUR, 0, 0, 0);

    const dayEnd = new Date(currentDay);
    dayEnd.setUTCHours(OPERATING_END_HOUR, 0, 0, 0);

    // Get flights for this day
    const dayFlights = flights.filter((f) => {
      const flightDate = new Date(f.departure_time);
      return flightDate.toDateString() === currentDay.toDateString();
    });

    // If no flights, entire day is free
    if (dayFlights.length === 0) {
      // Generate slots throughout the day
      while (slotStart < dayEnd) {
        const slotEnd = new Date(slotStart.getTime() + targetDuration * 60000);
        if (slotEnd <= dayEnd) {
          freeSlots.push({
            startTime: slotStart.toISOString(),
            endTime: slotEnd.toISOString(),
            durationMinutes: targetDuration,
          });
        }
        // Advance by lesson duration for next slot
        slotStart = new Date(slotStart.getTime() + targetDuration * 60000);
      }
    } else {
      // Find gaps between flights
      for (let i = 0; i <= dayFlights.length; i++) {
        let gapStart: Date;
        let gapEnd: Date;

        if (i === 0) {
          // Before first flight
          const firstFlight = dayFlights[0];
          if (!firstFlight) continue;
          gapStart = new Date(currentDay);
          gapStart.setUTCHours(OPERATING_START_HOUR, 0, 0, 0);
          gapEnd = new Date(firstFlight.departure_time);
        } else if (i === dayFlights.length) {
          // After last flight
          const lastFlight = dayFlights[i - 1];
          if (!lastFlight) continue;
          gapStart = new Date(lastFlight.arrival_time);
          gapEnd = new Date(currentDay);
          gapEnd.setUTCHours(OPERATING_END_HOUR, 0, 0, 0);
        } else {
          // Between flights
          const prevFlight = dayFlights[i - 1];
          const nextFlight = dayFlights[i];
          if (!prevFlight || !nextFlight) continue;
          gapStart = new Date(prevFlight.arrival_time);
          gapEnd = new Date(nextFlight.departure_time);
        }

        // Generate slots in this gap
        let slotTime = new Date(gapStart);
        while (slotTime < gapEnd) {
          const slotEndTime = new Date(slotTime.getTime() + targetDuration * 60000);
          if (slotEndTime <= gapEnd && slotEndTime <= dayEnd) {
            freeSlots.push({
              startTime: slotTime.toISOString(),
              endTime: slotEndTime.toISOString(),
              durationMinutes: targetDuration,
            });
          }
          // Advance by lesson duration
          slotTime = new Date(slotTime.getTime() + targetDuration * 60000);
        }
      }
    }

    // Move to next day
    currentDay = new Date(currentDay.getTime() + 24 * 60 * 60 * 1000);
  }

  return freeSlots;
}

/**
 * Filters out slots within minimum spacing window of original time
 * @param freeSlots - Array of free time slots
 * @param originalTime - Original flight departure time
 * @param minGapHours - Minimum gap in hours (default 6)
 * @returns Filtered array
 */
function filterMinimumSpacing(
  freeSlots: TimeSlot[],
  originalTime: string,
  minGapHours: number = MINIMUM_SPACING_HOURS
): TimeSlot[] {
  const originalDate = new Date(originalTime);
  const minGapMs = minGapHours * 60 * 60 * 1000;

  return freeSlots.filter((slot) => {
    const slotDate = new Date(slot.startTime);
    const timeDiff = Math.abs(slotDate.getTime() - originalDate.getTime());
    return timeDiff >= minGapMs;
  });
}

// ========================================
// Helper Functions - Aircraft Availability
// ========================================

/**
 * Checks aircraft conflicts during candidate time windows
 * @param ctx - Execution context
 * @param aircraftId - Aircraft ID
 * @param startDate - Start of search window
 * @param endDate - End of search window
 * @returns Array of conflicting flights
 */
async function checkAircraftConflicts(
  ctx: ExecutionContext,
  aircraftId: number,
  startDate: string,
  endDate: string
): Promise<Flight[]> {
  const client = createClient(ctx.env.AIRESCHEDULER_DB);

  const conflicts = await prepareQuery<Flight>(
    client,
    `SELECT * FROM flights
     WHERE aircraft_id = ?
     AND status IN ('scheduled', 'rescheduled')
     AND departure_time >= ?
     AND departure_time <= ?
     ORDER BY departure_time ASC`,
    [aircraftId, startDate, endDate]
  );

  return conflicts;
}

/**
 * Validates aircraft is available at candidate time
 * @param candidateSlot - Proposed time slot
 * @param conflicts - Array of existing flights
 * @returns True if no conflicts, false if overlap
 */
function validateAircraftAvailable(candidateSlot: TimeSlot, conflicts: Flight[]): boolean {
  const candidateStart = new Date(candidateSlot.startTime);
  const candidateEnd = new Date(candidateSlot.endTime);

  for (const conflict of conflicts) {
    const flightStart = new Date(conflict.departure_time);
    const flightEnd = new Date(conflict.arrival_time);

    // Check for overlap
    if (candidateStart < flightEnd && candidateEnd > flightStart) {
      return false; // Overlap detected
    }
  }

  return true; // No conflicts
}

// ========================================
// Helper Functions - Certification Validation
// ========================================

/**
 * Parses instructor certifications from database JSON
 * @param instructor - Instructor record
 * @returns Array of certification strings
 */
function parseInstructorCertifications(instructor: Instructor): string[] {
  try {
    const certs = JSON.parse(instructor.certifications);
    if (Array.isArray(certs)) {
      return certs;
    }
    return [];
  } catch (error) {
    return [];
  }
}

/**
 * Determines required instructor certification level
 * @param studentTrainingLevel - Student's training level
 * @returns Required certification string
 */
function getRequiredCertification(studentTrainingLevel: string): string | null {
  if (studentTrainingLevel === 'student') {
    return null; // Any instructor can teach student level
  }
  if (studentTrainingLevel === 'private') {
    return 'private';
  }
  if (studentTrainingLevel === 'instrument') {
    return 'instrument';
  }
  return null;
}

/**
 * Validates instructor-student certification compatibility
 * @param studentLevel - Student training level
 * @param instructorCerts - Array of instructor certifications
 * @returns True if compatible, false otherwise
 */
function isCertificationValid(studentLevel: string, instructorCerts: string[]): boolean {
  const required = getRequiredCertification(studentLevel);

  // Student level: any instructor is valid
  if (!required) {
    return true;
  }

  // Check if instructor has required certification
  return instructorCerts.includes(required);
}

// ========================================
// Helper Functions - Lesson Constraints
// ========================================

/**
 * Extracts lesson constraints from original flight
 * @param flight - Original flight record
 * @returns Lesson constraints
 */
function extractLessonConstraints(flight: Flight): LessonConstraints {
  const departureTime = new Date(flight.departure_time);
  const arrivalTime = new Date(flight.arrival_time);
  const durationMinutes = Math.round((arrivalTime.getTime() - departureTime.getTime()) / 60000);

  return {
    durationMinutes,
    departureAirport: flight.departure_airport,
    arrivalAirport: flight.arrival_airport,
    operatingStart: OPERATING_START_HOUR,
    operatingEnd: OPERATING_END_HOUR,
  };
}

/**
 * Validates candidate slot matches lesson constraints
 * @param slot - Candidate time slot
 * @param constraints - Lesson constraints
 * @returns True if all constraints satisfied, false otherwise
 */
function validateSlotConstraints(slot: TimeSlot, constraints: LessonConstraints): boolean {
  // Duration match (±5 minutes tolerance)
  const durationDiff = Math.abs(slot.durationMinutes - constraints.durationMinutes);
  if (durationDiff > DURATION_TOLERANCE_MINUTES) {
    return false;
  }

  // Operating hours check
  const slotStart = new Date(slot.startTime);
  const slotEnd = new Date(slot.endTime);
  const startHour = slotStart.getUTCHours();
  const endHour = slotEnd.getUTCHours();

  if (startHour < constraints.operatingStart || endHour > constraints.operatingEnd) {
    return false;
  }

  return true;
}

/**
 * Calculates confidence score based on constraint alignment
 * @param slot - Candidate time slot
 * @param constraints - Lesson constraints
 * @param originalTime - Original flight departure time
 * @returns Confidence score 0-100
 */
function calculateSlotConfidence(
  slot: TimeSlot,
  constraints: LessonConstraints,
  originalTime: string
): number {
  const slotDate = new Date(slot.startTime);
  const originalDate = new Date(originalTime);

  // Calculate time differences
  const daysDiff = Math.abs(
    Math.floor((slotDate.getTime() - originalDate.getTime()) / (24 * 60 * 60 * 1000))
  );
  const hoursDiff = Math.abs(
    Math.floor((slotDate.getTime() - originalDate.getTime()) / (60 * 60 * 1000)) % 24
  );
  const durationDiff = Math.abs(slot.durationMinutes - constraints.durationMinutes);

  // Same day of week check
  const sameDayOfWeek = slotDate.getUTCDay() === originalDate.getUTCDay();

  // Calculate base score
  let score = 100;

  // Penalize for days difference
  if (daysDiff === 0) {
    score = 100; // Same day
  } else if (daysDiff === 1) {
    score = 80; // Adjacent day
  } else if (daysDiff <= 3) {
    score = 60; // Within 3 days
  } else if (daysDiff <= 5) {
    score = 40; // Within 5 days
  } else {
    score = 20; // 6-7 days
  }

  // Adjust for time of day alignment
  if (hoursDiff <= 2) {
    // Within 2 hours of original time
    score = Math.min(score, 100);
  } else if (hoursDiff <= 4) {
    score = Math.max(score - 10, 0);
  } else {
    score = Math.max(score - 20, 0);
  }

  // Adjust for duration match
  if (durationDiff === 0) {
    // Exact match
    score = Math.min(score + 5, 100);
  } else if (durationDiff <= DURATION_TOLERANCE_MINUTES) {
    // Within tolerance
    score = score; // No penalty
  } else {
    score = Math.max(score - 10, 0);
  }

  // Bonus for same day of week
  if (sameDayOfWeek && daysDiff !== 0) {
    score = Math.min(score + 5, 100);
  }

  return Math.max(0, Math.min(100, score));
}

// ========================================
// Main Service Function
// ========================================

/**
 * Generates candidate slots for rescheduling a flight
 * @param env - Cloudflare Workers environment
 * @param flightId - Flight ID to generate candidates for
 * @param executionContext - Execution context with correlation ID and logger
 * @returns Candidate slots result
 */
export async function generateCandidateSlots(
  env: any,
  flightId: number,
  executionContext: ExecutionContext
): Promise<CandidateSlotsResult> {
  const ctx = executionContext;

  ctx.logger.info('[candidateSlots] Generating candidates for flight', {
    flightId,
    searchWindowDays: SEARCH_WINDOW_DAYS,
    correlationId: ctx.correlationId,
  });

  try {
    // Input validation
    if (flightId <= 0) {
      return {
        originalFlightId: flightId,
        originalDepartureTime: '',
        candidateSlots: [],
        totalSlotsCandidates: 0,
        searchWindowDays: SEARCH_WINDOW_DAYS,
        generatedAt: new Date().toISOString(),
        correlationId: ctx.correlationId,
        error: 'Invalid flight ID',
      };
    }

    // Fetch original flight with student training level
    const client = createClient(env.AIRESCHEDULER_DB);
    const flight = await prepareQueryOne<FlightWithStudent>(
      client,
      `SELECT f.*, s.training_level
       FROM flights f
       JOIN students s ON f.student_id = s.id
       WHERE f.id = ?`,
      [flightId]
    );

    if (!flight) {
      ctx.logger.warn('[candidateSlots] Flight not found', { flightId });
      return {
        originalFlightId: flightId,
        originalDepartureTime: '',
        candidateSlots: [],
        totalSlotsCandidates: 0,
        searchWindowDays: SEARCH_WINDOW_DAYS,
        generatedAt: new Date().toISOString(),
        correlationId: ctx.correlationId,
        error: 'Flight not found',
      };
    }

    // Calculate search window (±7 days)
    const originalDeparture = new Date(flight.departure_time);
    const searchStart = new Date(originalDeparture.getTime() - SEARCH_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const searchEnd = new Date(originalDeparture.getTime() + SEARCH_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    ctx.logger.info('[candidateSlots] Search window calculated', {
      originalDeparture: flight.departure_time,
      searchStart: searchStart.toISOString(),
      searchEnd: searchEnd.toISOString(),
    });

    // Extract lesson constraints
    const constraints = extractLessonConstraints(flight);

    // Get all instructors (for MVP, consider all instructors)
    const instructors = await prepareQuery<Instructor>(
      client,
      `SELECT * FROM instructors`,
      []
    );

    ctx.logger.info('[candidateSlots] Instructors retrieved', {
      count: instructors.length,
    });

    // Get all available aircraft
    const availableAircraft = await prepareQuery<Aircraft>(
      client,
      `SELECT * FROM aircraft WHERE status = 'available'`,
      []
    );

    ctx.logger.info('[candidateSlots] Available aircraft retrieved', {
      count: availableAircraft.length,
    });

    const candidates: CandidateSlot[] = [];

    // Generate candidates for each instructor-aircraft combination
    for (const instructor of instructors) {
      // Check certification compatibility
      const instructorCerts = parseInstructorCertifications(instructor);
      const certValid = isCertificationValid(flight.training_level, instructorCerts);

      if (!certValid) {
        ctx.logger.info('[candidateSlots] Instructor certification mismatch', {
          instructorId: instructor.id,
          studentLevel: flight.training_level,
          instructorCerts,
        });
        continue; // Skip this instructor
      }

      // Get instructor's flight schedule
      const instructorFlights = await queryInstructorFlights(
        ctx,
        instructor.id,
        searchStart.toISOString(),
        searchEnd.toISOString()
      );

      // Calculate free slots
      const freeSlots = calculateInstructorFreeSlots(
        instructorFlights,
        searchStart.toISOString(),
        searchEnd.toISOString(),
        constraints.durationMinutes
      );

      // Filter out slots within minimum spacing
      const spacedSlots = filterMinimumSpacing(freeSlots, flight.departure_time);

      ctx.logger.info('[candidateSlots] Instructor free slots calculated', {
        instructorId: instructor.id,
        freeSlots: freeSlots.length,
        afterSpacing: spacedSlots.length,
      });

      // For each free slot, check aircraft availability
      for (const slot of spacedSlots) {
        // Validate slot constraints
        if (!validateSlotConstraints(slot, constraints)) {
          continue; // Skip invalid slots
        }

        for (const aircraft of availableAircraft) {
          // Check aircraft conflicts
          const aircraftConflicts = await checkAircraftConflicts(
            ctx,
            aircraft.id,
            searchStart.toISOString(),
            searchEnd.toISOString()
          );

          const aircraftAvailable = validateAircraftAvailable(slot, aircraftConflicts);

          if (!aircraftAvailable) {
            continue; // Skip this aircraft
          }

          // Calculate confidence score
          const confidence = calculateSlotConfidence(slot, constraints, flight.departure_time);

          // Check if within time window (±7 days)
          const slotDate = new Date(slot.startTime);
          const withinWindow =
            slotDate >= searchStart && slotDate <= searchEnd;

          // Minimum spacing already checked above
          const minimumSpacingMet = true;

          // Add to candidates
          const candidate: CandidateSlot = {
            slotIndex: candidates.length,
            instructorId: instructor.id,
            instructorName: instructor.name,
            aircraftId: aircraft.id,
            aircraftRegistration: aircraft.registration,
            departureTime: slot.startTime,
            arrivalTime: slot.endTime,
            durationMinutes: slot.durationMinutes,
            confidence,
            constraints: {
              instructorAvailable: true,
              aircraftAvailable: true,
              certificationValid: certValid,
              withinTimeWindow: withinWindow,
              minimumSpacingMet,
            },
            notes:
              aircraft.category !== flight.departure_airport // Note: This is a simplified check
                ? `Alternative aircraft category: ${aircraft.category}`
                : undefined,
          };

          candidates.push(candidate);

          ctx.logger.info('[candidateSlots] Added candidate slot', {
            slotIndex: candidate.slotIndex,
            instructorId: instructor.id,
            aircraftId: aircraft.id,
            departureTime: slot.startTime,
            confidence,
          });

          // Limit to MAX_CANDIDATES
          if (candidates.length >= MAX_CANDIDATES) {
            break;
          }
        }

        if (candidates.length >= MAX_CANDIDATES) {
          break;
        }
      }

      if (candidates.length >= MAX_CANDIDATES) {
        break;
      }
    }

    // Sort by confidence (descending), then chronologically
    candidates.sort((a, b) => {
      if (b.confidence !== a.confidence) {
        return b.confidence - a.confidence;
      }
      return new Date(a.departureTime).getTime() - new Date(b.departureTime).getTime();
    });

    // Reassign slot indices after sorting
    candidates.forEach((c, idx) => {
      c.slotIndex = idx;
    });

    ctx.logger.info('[candidateSlots] Candidate generation completed', {
      flightId,
      totalCandidates: candidates.length,
      topConfidence: candidates.length > 0 ? candidates[0]?.confidence ?? 0 : 0,
    });

    return {
      originalFlightId: flightId,
      originalDepartureTime: flight.departure_time,
      candidateSlots: candidates,
      totalSlotsCandidates: candidates.length,
      searchWindowDays: SEARCH_WINDOW_DAYS,
      generatedAt: new Date().toISOString(),
      correlationId: ctx.correlationId,
    };
  } catch (error) {
    ctx.logger.error('[candidateSlots] Error generating candidates', {
      flightId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      correlationId: ctx.correlationId,
    });

    return {
      originalFlightId: flightId,
      originalDepartureTime: '',
      candidateSlots: [],
      totalSlotsCandidates: 0,
      searchWindowDays: SEARCH_WINDOW_DAYS,
      generatedAt: new Date().toISOString(),
      correlationId: ctx.correlationId,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
