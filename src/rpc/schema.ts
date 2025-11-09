/**
 * RPC Schema Definition
 * Defines Zod schemas for all RPC methods with request/response validation
 */

import { z } from 'zod';

// ========================================
// WeatherPoll Method
// ========================================

export const WeatherPollRequestSchema = z.object({
  flightIds: z.array(z.number()).optional(),
});

export const WeatherPollResponseSchema = z.object({
  snapshotsCreated: z.number(),
  flightsEvaluated: z.number(),
  classifications: z.array(z.object({
    flightId: z.number(),
    weatherStatus: z.enum(['clear', 'advisory', 'auto-reschedule', 'unknown']),
  })).optional(),
});

export type WeatherPollRequest = z.infer<typeof WeatherPollRequestSchema>;
export type WeatherPollResponse = z.infer<typeof WeatherPollResponseSchema>;

// ========================================
// AutoReschedule Method
// ========================================

export const AutoRescheduleRequestSchema = z.object({
  flightIds: z.array(z.number()).optional(),
  forceExecute: z.boolean().optional(),
});

export const AutoRescheduleResponseSchema = z.object({
  flightsProcessed: z.number(),
  reschedulesCreated: z.number(),
  advisoriesIssued: z.number(),
});

export type AutoRescheduleRequest = z.infer<typeof AutoRescheduleRequestSchema>;
export type AutoRescheduleResponse = z.infer<typeof AutoRescheduleResponseSchema>;

// ========================================
// SeedDemoData Method
// ========================================

export const SeedDemoDataRequestSchema = z.object({
  clearExisting: z.boolean().optional(),
});

export const SeedDemoDataResponseSchema = z.object({
  students: z.number(),
  instructors: z.number(),
  aircraft: z.number(),
  flights: z.number(),
});

export type SeedDemoDataRequest = z.infer<typeof SeedDemoDataRequestSchema>;
export type SeedDemoDataResponse = z.infer<typeof SeedDemoDataResponseSchema>;

// ========================================
// ListFlights Method
// ========================================

export const ListFlightsRequestSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.enum(['scheduled', 'rescheduled', 'completed', 'cancelled']).optional(),
  weatherStatus: z.enum(['unknown', 'clear', 'advisory', 'auto-reschedule']).optional(),
});

export const FlightDetailSchema = z.object({
  id: z.number(),
  studentName: z.string(),
  instructorName: z.string(),
  aircraftRegistration: z.string(),
  departureTime: z.string(),
  arrivalTime: z.string(),
  departureAirport: z.string(),
  arrivalAirport: z.string(),
  status: z.enum(['scheduled', 'rescheduled', 'completed', 'cancelled']),
  weatherStatus: z.enum(['unknown', 'clear', 'advisory', 'auto-reschedule']),
});

export const ListFlightsResponseSchema = z.object({
  flights: z.array(FlightDetailSchema),
  totalCount: z.number(),
});

export type ListFlightsRequest = z.infer<typeof ListFlightsRequestSchema>;
export type FlightDetail = z.infer<typeof FlightDetailSchema>;
export type ListFlightsResponse = z.infer<typeof ListFlightsResponseSchema>;

// ========================================
// ClassifyFlights Method
// ========================================

export const FlightClassificationRequestSchema = z.object({
  flightIds: z.array(z.number()).optional(),
});

export const FlightClassificationResponseSchema = z.object({
  results: z.array(z.object({
    flightId: z.number(),
    weatherStatus: z.enum(['clear', 'advisory', 'auto-reschedule', 'unknown']),
    reason: z.string(),
    breachedCheckpoints: z.array(z.object({
      checkpointType: z.enum(['departure', 'arrival', 'corridor']),
      location: z.string(),
      breaches: z.object({
        wind: z.boolean().optional(),
        visibility: z.boolean().optional(),
        ceiling: z.boolean().optional(),
      }),
      conditions: z.object({
        windSpeed: z.number(),
        visibility: z.number(),
        ceiling: z.number().nullable(),
      }),
      thresholds: z.object({
        maxWind: z.number(),
        minVisibility: z.number(),
        minCeiling: z.number(),
      }),
    })),
    hoursUntilDeparture: z.number(),
  })),
});

export type FlightClassificationRequest = z.infer<typeof FlightClassificationRequestSchema>;
export type FlightClassificationResponse = z.infer<typeof FlightClassificationResponseSchema>;

// ========================================
// GetWeatherSnapshots Method
// ========================================

export const GetWeatherSnapshotsRequestSchema = z.object({
  flightId: z.number(),
  checkpointType: z.enum(['departure', 'arrival', 'corridor']).optional(),
  startDate: z.string().optional(), // ISO 8601
  endDate: z.string().optional(), // ISO 8601
  limit: z.number().optional(), // Default: 50, Max: 500
});

export const StalenessMetadataSchema = z.object({
  hours: z.number(),
  level: z.enum(['fresh', 'acceptable', 'stale', 'very-stale']),
  warning: z.boolean(),
  message: z.string(),
});

export const WeatherSnapshotSchema = z.object({
  id: z.number(),
  flight_id: z.number(),
  checkpoint_type: z.enum(['departure', 'arrival', 'corridor']),
  location: z.string(),
  forecast_time: z.string(), // ISO 8601
  wind_speed: z.number(), // knots
  visibility: z.number(), // statute miles
  ceiling: z.number().nullable(), // feet AGL or NULL
  conditions: z.string(),
  confidence_horizon: z.number(), // hours
  correlation_id: z.string(),
  created_at: z.string(), // ISO 8601
  etag: z.string().nullable(),
  // Computed fields
  staleness: StalenessMetadataSchema.optional(),
});

export const GetWeatherSnapshotsResponseSchema = z.object({
  snapshots: z.array(WeatherSnapshotSchema),
  totalCount: z.number(),
  flightContext: z
    .object({
      flightId: z.number(),
      departureTime: z.string(),
      arrivalTime: z.string(),
      departureAirport: z.string(),
      arrivalAirport: z.string(),
    })
    .optional(),
});

export type GetWeatherSnapshotsRequest = z.infer<typeof GetWeatherSnapshotsRequestSchema>;
export type StalenessMetadata = z.infer<typeof StalenessMetadataSchema>;
export type WeatherSnapshot = z.infer<typeof WeatherSnapshotSchema>;
export type GetWeatherSnapshotsResponse = z.infer<typeof GetWeatherSnapshotsResponseSchema>;

// ========================================
// GenerateCandidateSlots Method
// ========================================

export const GenerateCandidateSlotsRequestSchema = z.object({
  flightId: z.number(),
});

export const GenerateCandidateSlotsResponseSchema = z.object({
  originalFlightId: z.number(),
  originalDepartureTime: z.string(),
  candidateSlots: z.array(z.any()), // Using any for simplicity, could be CandidateSlotSchema
  totalSlotsCandidates: z.number(),
  searchWindowDays: z.number(),
  generatedAt: z.string(),
  correlationId: z.string(),
  error: z.string().optional(),
});

export type GenerateCandidateSlotsRequest = z.infer<typeof GenerateCandidateSlotsRequestSchema>;
export type GenerateCandidateSlotsResponse = z.infer<typeof GenerateCandidateSlotsResponseSchema>;

// ========================================
// GenerateRescheduleRecommendations Method
// ========================================

const CandidateSlotConstraintsSchema = z.object({
  instructorAvailable: z.boolean(),
  aircraftAvailable: z.boolean(),
  certificationValid: z.boolean(),
  withinTimeWindow: z.boolean(),
  minimumSpacingMet: z.boolean(),
});

const CandidateSlotSchema = z.object({
  slotIndex: z.number().int().min(0),
  instructorId: z.number(),
  instructorName: z.string(),
  aircraftId: z.number(),
  aircraftRegistration: z.string(),
  departureTime: z.string(),
  arrivalTime: z.string(),
  durationMinutes: z.number(),
  confidence: z.number().min(0).max(100),
  constraints: CandidateSlotConstraintsSchema,
  notes: z.string().optional(),
});

const CandidateSlotsResultSchema = z.object({
  originalFlightId: z.number(),
  originalDepartureTime: z.string(),
  candidateSlots: z.array(CandidateSlotSchema),
  totalSlotsCandidates: z.number(),
  searchWindowDays: z.number(),
  generatedAt: z.string(),
  correlationId: z.string(),
  error: z.string().optional(),
});

const RescheduleRecommendationSchema = z.object({
  candidateIndex: z.number().int().min(0),
  aiRank: z.number().int().min(1).max(3),
  aiConfidence: z.number().min(0).max(100),
  rationale: z.string().min(1),
  originalCandidate: CandidateSlotSchema,
});

export const GenerateRescheduleRecommendationsRequestSchema = z.object({
  candidateSlotsResult: CandidateSlotsResultSchema,
});

export const GenerateRescheduleRecommendationsResponseSchema = z.object({
  recommendations: z.array(RescheduleRecommendationSchema),
  aiUnavailable: z.boolean().optional(),
  fallbackReason: z.string().optional(),
  error: z.string().optional(),
  correlationId: z.string(),
});

export type GenerateRescheduleRecommendationsRequest = z.infer<typeof GenerateRescheduleRecommendationsRequestSchema>;
export type GenerateRescheduleRecommendationsResponse = z.infer<typeof GenerateRescheduleRecommendationsResponseSchema>;

// ========================================
// RecordManagerDecision Method
// ========================================

export const RecordManagerDecisionRequestSchema = z.object({
  flightId: z.number().int().positive(),
  recommendedSlotIndex: z.number().int().min(0).max(2),
  decision: z.enum(['accept', 'reject']),
  managerName: z.string().min(1),
  notes: z.string().optional(),
  topRecommendations: z.array(RescheduleRecommendationSchema).optional(),
});

export const RecordManagerDecisionResponseSchema = z.object({
  actionId: z.number().int(),
  status: z.enum(['accepted', 'rejected']),
  message: z.string(),
  newFlightId: z.number().int().optional(),
  correlationId: z.string(),
});

export type RecordManagerDecisionRequest = z.infer<typeof RecordManagerDecisionRequestSchema>;
export type RecordManagerDecisionResponse = z.infer<typeof RecordManagerDecisionResponseSchema>;

// ========================================
// GetCronRuns Method
// ========================================

export const GetCronRunsRequestSchema = z.object({
  limit: z.number().int().min(1).max(50).optional(), // Default: 10, Max: 50
  status: z.enum(['success', 'partial', 'error']).optional(),
});

export const CronRunSchema = z.object({
  id: z.number(),
  correlationId: z.string(),
  status: z.enum(['success', 'partial', 'error']),
  startedAt: z.string(), // ISO 8601
  completedAt: z.string(), // ISO 8601
  durationMs: z.number(),
  errorCount: z.number(),
  weatherSnapshotsCreated: z.number(),
  flightsAnalyzed: z.number(),
  weatherConflictsFound: z.number(),
  flightsRescheduled: z.number(),
  flightsPendingReview: z.number(),
  flightsSkipped: z.number(),
  errorDetails: z.array(z.string()),
});

export const GetCronRunsResponseSchema = z.object({
  runs: z.array(CronRunSchema),
  totalCount: z.number(),
});

export type GetCronRunsRequest = z.infer<typeof GetCronRunsRequestSchema>;
export type CronRun = z.infer<typeof CronRunSchema>;
export type GetCronRunsResponse = z.infer<typeof GetCronRunsResponseSchema>;

// ========================================
// GetFlightRescheduleHistory Method
// ========================================

export const GetFlightRescheduleHistoryRequestSchema = z.object({
  flightId: z.number().int().positive(),
});

export const RescheduleAuditEntrySchema = z.object({
  actionId: z.number().int(),
  originalFlightId: z.number().int(),
  newFlightId: z.number().int().nullable(),
  originalTime: z.string(),
  newTime: z.string().nullable(),
  actionType: z.enum(['auto-accept', 'manual-accept', 'manual-reject']),
  decisionSource: z.enum(['system', 'manager']),
  decisionBy: z.string(),
  decidedAt: z.string(),
  aiConfidence: z.number().nullable(),
  aiRationale: z.string().nullable(),
  managerNotes: z.string().nullable(),
  weatherSnapshot: z.object({
    windSpeed: z.number(),
    visibility: z.number(),
    ceiling: z.number().nullable(),
    conditions: z.string(),
    confidenceHorizon: z.number(),
  }).nullable(),
  status: z.enum(['pending', 'accepted', 'rejected']),
});

export const GetFlightRescheduleHistoryResponseSchema = z.array(RescheduleAuditEntrySchema);

export type GetFlightRescheduleHistoryRequest = z.infer<typeof GetFlightRescheduleHistoryRequestSchema>;
export type RescheduleAuditEntry = z.infer<typeof RescheduleAuditEntrySchema>;
export type GetFlightRescheduleHistoryResponse = z.infer<typeof GetFlightRescheduleHistoryResponseSchema>;

// ========================================
// RPC Method Map
// ========================================

export const RpcMethodMap = {
  weatherPoll: {
    request: WeatherPollRequestSchema,
    response: WeatherPollResponseSchema,
  },
  autoReschedule: {
    request: AutoRescheduleRequestSchema,
    response: AutoRescheduleResponseSchema,
  },
  seedDemoData: {
    request: SeedDemoDataRequestSchema,
    response: SeedDemoDataResponseSchema,
  },
  listFlights: {
    request: ListFlightsRequestSchema,
    response: ListFlightsResponseSchema,
  },
  classifyFlights: {
    request: FlightClassificationRequestSchema,
    response: FlightClassificationResponseSchema,
  },
  getWeatherSnapshots: {
    request: GetWeatherSnapshotsRequestSchema,
    response: GetWeatherSnapshotsResponseSchema,
  },
  generateCandidateSlots: {
    request: GenerateCandidateSlotsRequestSchema,
    response: GenerateCandidateSlotsResponseSchema,
  },
  generateRescheduleRecommendations: {
    request: GenerateRescheduleRecommendationsRequestSchema,
    response: GenerateRescheduleRecommendationsResponseSchema,
  },
  recordManagerDecision: {
    request: RecordManagerDecisionRequestSchema,
    response: RecordManagerDecisionResponseSchema,
  },
  getFlightRescheduleHistory: {
    request: GetFlightRescheduleHistoryRequestSchema,
    response: GetFlightRescheduleHistoryResponseSchema,
  },
  getCronRuns: {
    request: GetCronRunsRequestSchema,
    response: GetCronRunsResponseSchema,
  },
} as const;

export type RpcMethod = keyof typeof RpcMethodMap;

// ========================================
// RPC Envelope Types
// ========================================

export interface RpcRequest {
  method: string;
  params: any;
}

export interface RpcSuccessResponse<T = any> {
  result: T;
  correlationId: string;
  error?: never;
}

export interface RpcErrorResponse {
  result?: never;
  error: string;
  correlationId?: string;
}

export type RpcResponse<T = any> = RpcSuccessResponse<T> | RpcErrorResponse;
