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
