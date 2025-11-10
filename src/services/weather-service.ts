/**
 * Weather Service
 * Handles weather polling, forecast retrieval, and snapshot persistence
 */

import { ExecutionContext } from '../lib/logger';
import { WeatherPollRequest, WeatherPollResponse } from '../rpc/schema';
import { createClient, prepareExec, prepareQuery, prepareQueryOne, Flight, WeatherSnapshot } from '../db/client';
import * as classificationService from './classification-service';

// ========================================
// Constants
// ========================================

const WEATHER_API_ENDPOINT = 'https://api.weatherapi.com/v1/forecast.json';
const REQUEST_TIMEOUT = 10000; // 10 seconds

const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 2000, // 2 seconds
  maxDelay: 8000, // 8 seconds
};

// ========================================
// Type Definitions
// ========================================

/**
 * WeatherAPI.com request parameters
 */
export interface WeatherApiRequest {
  location: string; // Airport ICAO code or lat,lon
  datetime: string; // ISO 8601 datetime
  fields?: string[]; // Optional fields filter
}

/**
 * WeatherAPI.com JSON response structure
 */
export interface WeatherApiResponse {
  location: {
    name: string;
    region: string;
    country: string;
    lat: number;
    lon: number;
  };
  forecast: {
    forecastday: Array<{
      date: string; // YYYY-MM-DD
      hour: Array<{
        time_epoch: number;
        time: string; // ISO 8601
        temp_f: number;
        condition: {
          text: string;
          code: number;
        };
        wind_mph: number;
        wind_kph: number;
        wind_degree: number;
        wind_dir: string;
        precip_in: number;
        humidity: number;
        cloud: number;
        vis_miles: number;
        gust_mph: number;
      }>;
    }>;
  };
}

/**
 * Parsed forecast data mapped to our schema
 */
export interface ForecastData {
  location: string;
  forecastTime: string; // ISO 8601
  windSpeed: number; // knots
  visibility: number; // statute miles
  ceiling: number | null; // feet AGL
  conditions: string;
  confidenceHorizon: number; // hours
  etag?: string | null; // ETag from API response for caching
}

/**
 * Weather data for a specific flight checkpoint
 */
export interface CheckpointWeather extends ForecastData {
  checkpointType: 'departure' | 'arrival' | 'corridor';
  flightId: number;
}

/**
 * Cached weather snapshot with staleness metadata
 */
export interface CachedWeatherData {
  data: WeatherSnapshot;
  cached: true;
  staleHours: number;
}

type CheckpointType = 'departure' | 'arrival' | 'corridor';

interface SyntheticCondition {
  windSpeed: number;
  visibility: number;
  ceiling: number | null;
  conditions: string;
  confidenceHorizon?: number;
}

const DEFAULT_SYNTHETIC_CONDITION: SyntheticCondition = {
  windSpeed: 12,
  visibility: 6,
  ceiling: 5500,
  conditions: 'VFR - Mostly clear skies',
  confidenceHorizon: 36,
};

const SYNTHETIC_WEATHER_PROFILES: Record<
  string,
  Partial<Record<CheckpointType, SyntheticCondition>>
> = {
  'KPAO-KSQL': {
    departure: {
      windSpeed: 9,
      visibility: 7,
      ceiling: 6500,
      conditions: 'Light winds with thin clouds',
    },
    arrival: {
      windSpeed: 8,
      visibility: 7,
      ceiling: 6000,
      conditions: 'Calm with scattered clouds',
    },
    corridor: {
      windSpeed: 11,
      visibility: 6,
      ceiling: 5800,
      conditions: 'Bay breeze developing',
    },
  },
  'KPAO-KHAF': {
    departure: {
      windSpeed: 18,
      visibility: 5.5,
      ceiling: 4200,
      conditions: 'Gusty crosswinds over the peninsula',
    },
    arrival: {
      windSpeed: 20,
      visibility: 5,
      ceiling: 3500,
      conditions: 'Marine layer with gusts along the coast',
    },
    corridor: {
      windSpeed: 21,
      visibility: 5,
      ceiling: 3600,
      conditions: 'Coastal turbulence and low marine layer',
    },
  },
  'KMSY-KHOU': {
    departure: {
      windSpeed: 14,
      visibility: 2.5,
      ceiling: 2200,
      conditions: 'Humid morning haze with low visibilities',
    },
    arrival: {
      windSpeed: 12,
      visibility: 3,
      ceiling: 2600,
      conditions: 'Patchy coastal fog lifting slowly',
    },
    corridor: {
      windSpeed: 13,
      visibility: 2.8,
      ceiling: 2400,
      conditions: 'Low-level moisture along the gulf',
    },
  },
  'KDEN-KASE': {
    departure: {
      windSpeed: 28,
      visibility: 3,
      ceiling: 2200,
      conditions: 'Mountain wave turbulence with blowing snow',
    },
    arrival: {
      windSpeed: 26,
      visibility: 2.5,
      ceiling: 2000,
      conditions: 'Snow showers in valleys',
    },
    corridor: {
      windSpeed: 30,
      visibility: 2.8,
      ceiling: 2100,
      conditions: 'Mountain pass turbulence',
    },
  },
  'KSEA-KPDX': {
    departure: {
      windSpeed: 12,
      visibility: 4,
      ceiling: 1200,
      conditions: 'Low stratus deck with drizzle',
    },
    arrival: {
      windSpeed: 13,
      visibility: 3.5,
      ceiling: 1000,
      conditions: 'IFR conditions with light rain',
    },
    corridor: {
      windSpeed: 15,
      visibility: 3.8,
      ceiling: 1100,
      conditions: 'Columbia Gorge fog',
    },
  },
  'KORD-KGRB': {
    departure: {
      windSpeed: 24,
      visibility: 4.5,
      ceiling: 2800,
      conditions: 'Strong gusty winds off the lake',
    },
    arrival: {
      windSpeed: 20,
      visibility: 4,
      ceiling: 2600,
      conditions: 'Lake-effect clouds with gusty winds',
    },
    corridor: {
      windSpeed: 22,
      visibility: 4.2,
      ceiling: 2700,
      conditions: 'Wind shear along the corridor',
    },
  },
  'KBOS-KBTV': {
    departure: {
      windSpeed: 16,
      visibility: 2.8,
      ceiling: 1500,
      conditions: 'Low IFR with light snow',
    },
    arrival: {
      windSpeed: 14,
      visibility: 2.5,
      ceiling: 1400,
      conditions: 'Wintry mix and low clouds',
    },
    corridor: {
      windSpeed: 17,
      visibility: 2.6,
      ceiling: 1450,
      conditions: 'Snow bands through interior New England',
    },
  },
  'KPHX-KABQ': {
    departure: {
      windSpeed: 18,
      visibility: 6,
      ceiling: null,
      conditions: 'Hot, dry thermals with light turbulence',
    },
    arrival: {
      windSpeed: 16,
      visibility: 6,
      ceiling: null,
      conditions: 'Dry heat with light mountain turbulence',
    },
    corridor: {
      windSpeed: 19,
      visibility: 6,
      ceiling: null,
      conditions: 'Thermal activity along desert corridor',
    },
  },
  'PANC-PAJN': {
    departure: {
      windSpeed: 22,
      visibility: 2.2,
      ceiling: 1800,
      conditions: 'Freezing fog with light snow',
    },
    arrival: {
      windSpeed: 18,
      visibility: 2,
      ceiling: 1700,
      conditions: 'Coastal icing conditions',
    },
    corridor: {
      windSpeed: 21,
      visibility: 2.1,
      ceiling: 1750,
      conditions: 'Icing risk along the fjords',
    },
  },
  'KDTW-KCLE': {
    departure: {
      windSpeed: 15,
      visibility: 2.2,
      ceiling: 1900,
      conditions: 'Lake-effect snow reducing visibility',
    },
    arrival: {
      windSpeed: 14,
      visibility: 2.5,
      ceiling: 1700,
      conditions: 'Snow showers with low ceilings',
    },
    corridor: {
      windSpeed: 16,
      visibility: 2.3,
      ceiling: 1800,
      conditions: 'Snow squalls across Lake Erie',
    },
  },
};

// ========================================
// Retry Logic
// ========================================

/**
 * Calculates exponential backoff delay for retry attempts
 * @param attempt - Current retry attempt (0-indexed)
 * @returns Delay in milliseconds
 */
function getRetryDelay(attempt: number): number {
  return Math.min(
    RETRY_CONFIG.baseDelay * Math.pow(2, attempt),
    RETRY_CONFIG.maxDelay
  );
}

/**
 * Determines if an error should be retried
 * @param statusCode - HTTP status code
 * @returns True if error is retryable
 */
function isRetryableError(statusCode: number): boolean {
  // Retry on 5xx errors and 429 Too Many Requests
  return statusCode >= 500 || statusCode === 429;
}

/**
 * Sleeps for specified milliseconds
 * @param ms - Milliseconds to sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ========================================
// WeatherAPI.com Client
// ========================================

/**
 * Retrieves cached ETag for a location and forecast time
 * @param ctx - Execution context
 * @param location - Location identifier
 * @param forecastTime - Forecast datetime
 * @returns ETag string or null
 */
async function getCachedETag(
  ctx: ExecutionContext,
  location: string,
  forecastTime: string
): Promise<string | null> {
  const client = createClient(ctx.env.AIRESCHEDULER_DB);

  const snapshot = await prepareQueryOne<WeatherSnapshot>(
    client,
    `SELECT etag FROM weather_snapshots
     WHERE location = ? AND forecast_time = ?
     ORDER BY created_at DESC LIMIT 1`,
    [location, forecastTime]
  );

  return snapshot?.etag || null;
}

/**
 * Fetches weather forecast data from WeatherAPI.com with retry logic and ETag support
 * @param ctx - Execution context
 * @param location - Airport ICAO code or coordinates
 * @param datetime - Forecast datetime (ISO 8601)
 * @returns Parsed forecast data
 */
async function fetchWeatherData(
  ctx: ExecutionContext,
  location: string,
  datetime: string
): Promise<ForecastData> {
  const forecastDate = new Date(datetime);
  const dateStr = forecastDate.toISOString().split('T')[0] || forecastDate.toISOString(); // YYYY-MM-DD
  const hour = forecastDate.getUTCHours();

  let lastError: Error | null = null;

  // Validate API key is present
  if (!ctx.env.WEATHER_API_KEY) {
    throw new Error('WEATHER_API_KEY environment variable is not configured');
  }

  const apiKey: string = ctx.env.WEATHER_API_KEY;

  // Get cached ETag if available
  const cachedETag = await getCachedETag(ctx, location, datetime);

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      ctx.logger.info('Weather API request started', {
        location,
        forecastTime: datetime,
        endpoint: WEATHER_API_ENDPOINT,
        attempt: attempt + 1,
        hasETag: !!cachedETag,
      });

      const url = new URL(WEATHER_API_ENDPOINT);
      url.searchParams.set('key', apiKey);
      url.searchParams.set('q', location);
      url.searchParams.set('dt', dateStr);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Add If-None-Match header if we have a cached ETag
      if (cachedETag) {
        headers['If-None-Match'] = cachedETag;
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });

      // Handle 304 Not Modified - return cached data
      if (response.status === 304) {
        ctx.logger.info('Weather API returned 304 Not Modified, using cached data', {
          location,
          forecastTime: datetime,
        });

        // Fetch and return cached data
        const client = createClient(ctx.env.AIRESCHEDULER_DB);
        const cached = await prepareQueryOne<WeatherSnapshot>(
          client,
          `SELECT * FROM weather_snapshots
           WHERE location = ? AND forecast_time = ?
           ORDER BY created_at DESC LIMIT 1`,
          [location, datetime]
        );

        if (!cached) {
          throw new Error('304 response received but no cached data found');
        }

        return {
          location: cached.location,
          forecastTime: cached.forecast_time,
          windSpeed: cached.wind_speed,
          visibility: cached.visibility,
          ceiling: cached.ceiling,
          conditions: cached.conditions,
          confidenceHorizon: cached.confidence_horizon,
        };
      }

      if (!response.ok) {
        if (attempt < RETRY_CONFIG.maxRetries && isRetryableError(response.status)) {
          const delay = getRetryDelay(attempt);
          ctx.logger.warn('Weather API request failed, retrying', {
            location,
            attempt: attempt + 1,
            statusCode: response.status,
            nextRetryDelay: delay,
          });
          await sleep(delay);
          continue;
        }

        throw new Error(`Weather API returned ${response.status}: ${response.statusText}`);
      }

      const data: WeatherApiResponse = await response.json();

      // Extract and store ETag from response headers
      const etag = response.headers.get('ETag');

      ctx.logger.info('Weather API request succeeded', {
        location,
        statusCode: response.status,
        hasETag: !!etag,
      });

      // Find the specific hour in the forecast
      const forecastDay = data.forecast.forecastday[0];
      if (!forecastDay) {
        throw new Error('No forecast data available for date');
      }

      const hourData = forecastDay.hour.find((h) => new Date(h.time).getUTCHours() === hour);
      if (!hourData) {
        throw new Error(`No forecast data for hour ${hour}`);
      }

      // Map API response to our schema and include ETag
      const forecastData = mapWeatherResponse(location, hourData);
      forecastData.etag = etag;
      return forecastData;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < RETRY_CONFIG.maxRetries && (error instanceof TypeError || (error as any).name === 'AbortError')) {
        const delay = getRetryDelay(attempt);
        ctx.logger.warn('Weather API request failed, retrying', {
          location,
          attempt: attempt + 1,
          nextRetryDelay: delay,
          error: lastError.message,
        });
        await sleep(delay);
        continue;
      }

      break;
    }
  }

  ctx.logger.error('Weather API request failed after retries', {
    location,
    attempts: RETRY_CONFIG.maxRetries + 1,
    error: lastError?.message,
    stack: lastError?.stack,
  });

  throw lastError || new Error('Weather API request failed');
}

/**
 * Maps WeatherAPI.com hour data to our ForecastData schema
 * @param location - Location identifier
 * @param hourData - Hour data from API response
 * @returns Parsed forecast data
 */
function mapWeatherResponse(
  location: string,
  hourData: WeatherApiResponse['forecast']['forecastday'][0]['hour'][0]
): ForecastData {
  // Convert wind speed from kph to knots
  const windSpeed = Math.round(hourData.wind_kph * 0.539957);

  // Estimate ceiling from cloud coverage
  // If cloud < 10%, assume unlimited ceiling (NULL)
  // Otherwise estimate: 10000 - (cloud * 100) feet AGL
  const ceiling = hourData.cloud < 10 ? null : Math.round(10000 - hourData.cloud * 100);

  // Calculate confidence horizon
  const confidenceHorizon = calculateConfidenceHorizon(hourData.time);

  return {
    location,
    forecastTime: hourData.time,
    windSpeed,
    visibility: hourData.vis_miles,
    ceiling,
    conditions: hourData.condition.text,
    confidenceHorizon,
  };
}

// ========================================
// Confidence Horizon Calculation
// ========================================

/**
 * Calculates confidence horizon based on forecast time
 * @param forecastTime - ISO 8601 forecast datetime
 * @returns Confidence horizon in hours
 */
function calculateConfidenceHorizon(forecastTime: string): number {
  const forecastDate = new Date(forecastTime);
  const now = new Date();
  const hoursUntilForecast = (forecastDate.getTime() - now.getTime()) / (1000 * 60 * 60);

  // Forecast confidence degrades over time
  // <24h: high confidence (24 hours)
  // 24-72h: medium confidence (48 hours)
  // >72h: low confidence (72 hours)
  if (hoursUntilForecast < 24) return 24;
  if (hoursUntilForecast < 72) return 48;
  return 72;
}

// ========================================
// Checkpoint Weather Retrieval
// ========================================

/**
 * Retrieves weather for all checkpoints of a flight
 * @param ctx - Execution context
 * @param flight - Flight record
 * @returns Array of checkpoint weather data
 */
async function getCheckpointWeather(
  ctx: ExecutionContext,
  flight: Flight
): Promise<CheckpointWeather[]> {
  const checkpoints: CheckpointWeather[] = [];

  const departure = await resolveCheckpointWeather(ctx, flight, 'departure', () =>
    fetchWeatherData(ctx, flight.departure_airport, flight.departure_time)
  );
  if (departure) {
    checkpoints.push(departure);
  }

  const arrival = await resolveCheckpointWeather(ctx, flight, 'arrival', () =>
    fetchWeatherData(ctx, flight.arrival_airport, flight.arrival_time)
  );
  if (arrival) {
    checkpoints.push(arrival);
  }

  const corridor = await resolveCheckpointWeather(ctx, flight, 'corridor', () =>
    fetchWeatherData(ctx, flight.departure_airport, flight.departure_time)
  );
  if (corridor) {
    checkpoints.push(corridor);
  }

  return checkpoints;
}

/**
 * Maps cached snapshot to CheckpointWeather format
 */
function mapCachedToCheckpoint(
  cached: CachedWeatherData,
  flightId: number,
  checkpointType: 'departure' | 'arrival' | 'corridor'
): CheckpointWeather {
  return {
    location: cached.data.location,
    forecastTime: cached.data.forecast_time,
    windSpeed: cached.data.wind_speed,
    visibility: cached.data.visibility,
    ceiling: cached.data.ceiling,
    conditions: cached.data.conditions,
    confidenceHorizon: cached.data.confidence_horizon,
    checkpointType,
    flightId,
  };
}

function generateSyntheticForecast(
  ctx: ExecutionContext,
  flight: Flight,
  checkpointType: CheckpointType
): ForecastData | null {
  const profileKey = `${flight.departure_airport}-${flight.arrival_airport}`;
  const profile = SYNTHETIC_WEATHER_PROFILES[profileKey];
  const baseCondition =
    profile?.[checkpointType] ??
    (checkpointType !== 'departure' ? profile?.departure : undefined) ??
    DEFAULT_SYNTHETIC_CONDITION;

  if (!baseCondition) {
    return null;
  }

  const location =
    checkpointType === 'arrival' ? flight.arrival_airport : flight.departure_airport;
  const forecastTime =
    checkpointType === 'arrival' ? flight.arrival_time : flight.departure_time;

  ctx.logger.info('Using synthetic weather data', {
    flightId: flight.id,
    checkpointType,
    profileKey,
    location,
  });

  return {
    location,
    forecastTime,
    windSpeed: baseCondition.windSpeed,
    visibility: baseCondition.visibility,
    ceiling: baseCondition.ceiling,
    conditions: baseCondition.conditions,
    confidenceHorizon:
      baseCondition.confidenceHorizon ??
      calculateConfidenceHorizon(forecastTime),
  };
}

async function resolveCheckpointWeather(
  ctx: ExecutionContext,
  flight: Flight,
  checkpointType: CheckpointType,
  fetchRemote?: () => Promise<ForecastData>
): Promise<CheckpointWeather | null> {
  const syntheticMode = !ctx.env.WEATHER_API_KEY;
  let remoteError: Error | null = null;

  if (!syntheticMode && fetchRemote) {
    try {
      const weather = await fetchRemote();
      return {
        ...weather,
        checkpointType,
        flightId: flight.id,
      };
    } catch (error) {
      remoteError = error instanceof Error ? error : new Error(String(error));
      ctx.logger.warn('Failed to fetch weather data, attempting fallbacks', {
        flightId: flight.id,
        checkpointType,
        error: remoteError.message,
      });
    }
  } else if (syntheticMode) {
    ctx.logger.info('Skipping remote weather fetch (synthetic mode)', {
      flightId: flight.id,
      checkpointType,
    });
  }

  const cached = await getCachedWeatherSnapshot(ctx, flight.id, checkpointType);
  if (cached) {
    if (remoteError) {
      ctx.logger.info('Using cached weather snapshot after remote failure', {
        flightId: flight.id,
        checkpointType,
        cachedAgeHours: cached.staleHours,
      });
    }
    return mapCachedToCheckpoint(cached, flight.id, checkpointType);
  }

  const synthetic = generateSyntheticForecast(ctx, flight, checkpointType);
  if (synthetic) {
    return {
      ...synthetic,
      checkpointType,
      flightId: flight.id,
    };
  }

  if (remoteError) {
    ctx.logger.error('No weather data available after remote failure', {
      flightId: flight.id,
      checkpointType,
      error: remoteError.message,
    });
  }

  return null;
}

// ========================================
// Weather Snapshot Persistence
// ========================================

/**
 * Persists weather snapshot to D1 database
 * @param ctx - Execution context
 * @param checkpoint - Checkpoint weather data
 */
async function persistWeatherSnapshot(
  ctx: ExecutionContext,
  checkpoint: CheckpointWeather
): Promise<void> {
  const client = createClient(ctx.env.AIRESCHEDULER_DB);

  await prepareExec(
    client,
    `INSERT INTO weather_snapshots
     (flight_id, checkpoint_type, location, forecast_time, wind_speed,
      visibility, ceiling, conditions, confidence_horizon, correlation_id, etag, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      checkpoint.flightId,
      checkpoint.checkpointType,
      checkpoint.location,
      checkpoint.forecastTime,
      checkpoint.windSpeed,
      checkpoint.visibility,
      checkpoint.ceiling,
      checkpoint.conditions,
      checkpoint.confidenceHorizon,
      ctx.correlationId,
      checkpoint.etag || null,
      new Date().toISOString(),
    ]
  );

  ctx.logger.info('Weather snapshot persisted', {
    flightId: checkpoint.flightId,
    checkpointType: checkpoint.checkpointType,
    location: checkpoint.location,
    hasETag: !!checkpoint.etag,
  });
}

// ========================================
// Cache Fallback Logic
// ========================================

/**
 * Retrieves cached weather snapshot from D1
 * @param ctx - Execution context
 * @param flightId - Flight ID
 * @param checkpointType - Checkpoint type
 * @returns Cached weather data with staleness metadata, or null
 */
async function getCachedWeatherSnapshot(
  ctx: ExecutionContext,
  flightId: number,
  checkpointType: 'departure' | 'arrival' | 'corridor'
): Promise<CachedWeatherData | null> {
  const client = createClient(ctx.env.AIRESCHEDULER_DB);

  const snapshot = await prepareQueryOne<WeatherSnapshot>(
    client,
    `SELECT * FROM weather_snapshots
     WHERE flight_id = ? AND checkpoint_type = ?
     ORDER BY created_at DESC LIMIT 1`,
    [flightId, checkpointType]
  );

  if (!snapshot) {
    return null;
  }

  // Calculate staleness
  const now = new Date();
  const createdAt = new Date(snapshot.created_at);
  const staleHours = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

  // Log staleness warning
  if (staleHours > 24) {
    ctx.logger.error('Using very stale cached weather data', {
      flightId,
      checkpointType,
      staleHours: Math.round(staleHours),
    });
  } else if (staleHours > 6) {
    ctx.logger.warn('Using stale cached weather data', {
      flightId,
      checkpointType,
      staleHours: Math.round(staleHours),
    });
  } else if (staleHours > 1) {
    ctx.logger.info('Using cached weather data', {
      flightId,
      checkpointType,
      staleHours: Math.round(staleHours),
    });
  }

  return {
    data: snapshot,
    cached: true,
    staleHours,
  };
}

// ========================================
// Staleness Detection
// ========================================

/**
 * Staleness metadata for weather snapshots
 */
export interface StalenessMetadata {
  hours: number;
  level: 'fresh' | 'acceptable' | 'stale' | 'very-stale';
  warning: boolean;
  message: string;
}

/**
 * Calculates staleness metadata for a weather snapshot
 * @param createdAt - ISO 8601 timestamp when snapshot was created
 * @returns Staleness metadata
 */
export function calculateStaleness(createdAt: string): StalenessMetadata {
  const snapshotDate = new Date(createdAt);
  const now = new Date();
  const hours = (now.getTime() - snapshotDate.getTime()) / (1000 * 60 * 60);

  let level: StalenessMetadata['level'];
  let warning = false;
  let message = '';

  if (hours < 1) {
    level = 'fresh';
    message = 'Fresh data';
  } else if (hours < 6) {
    level = 'acceptable';
    message = `${Math.round(hours)}h old - Recent`;
  } else if (hours < 24) {
    level = 'stale';
    warning = true;
    message = `${Math.round(hours)}h old - STALE`;
  } else {
    level = 'very-stale';
    warning = true;
    message = `${Math.round(hours)}h old - VERY STALE`;
  }

  return { hours, level, warning, message };
}

// ========================================
// Weather Snapshot Retrieval
// ========================================

/**
 * Weather snapshot with staleness metadata
 */
export interface WeatherSnapshotWithStaleness extends WeatherSnapshot {
  staleness?: StalenessMetadata;
}

/**
 * Request parameters for retrieving weather snapshots
 */
export interface GetWeatherSnapshotsRequest {
  flightId: number;
  checkpointType?: 'departure' | 'arrival' | 'corridor';
  startDate?: string; // ISO 8601
  endDate?: string; // ISO 8601
  limit?: number;
}

/**
 * Response containing weather snapshots and metadata
 */
export interface GetWeatherSnapshotsResponse {
  snapshots: WeatherSnapshotWithStaleness[];
  totalCount: number;
  flightContext?: {
    flightId: number;
    departureTime: string;
    arrivalTime: string;
    departureAirport: string;
    arrivalAirport: string;
  };
}

/**
 * Retrieves weather snapshots for a flight
 * @param ctx - Execution context
 * @param request - Request parameters
 * @returns Weather snapshots with staleness metadata
 */
export async function getWeatherSnapshotsForFlight(
  ctx: ExecutionContext,
  request: GetWeatherSnapshotsRequest
): Promise<GetWeatherSnapshotsResponse> {
  ctx.logger.info('Retrieving weather snapshots', {
    flightId: request.flightId,
    checkpointType: request.checkpointType,
    startDate: request.startDate,
    endDate: request.endDate,
    limit: request.limit,
  });

  try {
    const client = createClient(ctx.env.AIRESCHEDULER_DB);

    // Build query with optional filters
    let query = `SELECT ws.* FROM weather_snapshots ws WHERE ws.flight_id = ?`;
    const params: any[] = [request.flightId];

    if (request.checkpointType) {
      query += ` AND ws.checkpoint_type = ?`;
      params.push(request.checkpointType);
    }

    if (request.startDate && request.endDate) {
      query += ` AND ws.created_at BETWEEN ? AND ?`;
      params.push(request.startDate, request.endDate);
    }

    query += ` ORDER BY ws.created_at DESC`;

    const limit = request.limit || 50;
    const maxLimit = 500;
    const safeLimit = Math.min(limit, maxLimit);
    query += ` LIMIT ?`;
    params.push(safeLimit);

    const snapshots = await prepareQuery<WeatherSnapshot>(client, query, params);

    // Compute staleness for each snapshot
    const snapshotsWithStaleness: WeatherSnapshotWithStaleness[] = snapshots.map((snapshot) => ({
      ...snapshot,
      staleness: calculateStaleness(snapshot.created_at),
    }));

    // Get flight context
    const flight = await prepareQueryOne<Flight>(
      client,
      `SELECT id, departure_time, arrival_time, departure_airport, arrival_airport
       FROM flights WHERE id = ?`,
      [request.flightId]
    );

    const staleCount = snapshotsWithStaleness.filter((s) => s.staleness?.warning).length;

    ctx.logger.info('Weather snapshots retrieved', {
      flightId: request.flightId,
      count: snapshots.length,
      staleCount,
    });

    // Log staleness warnings if present
    if (staleCount > 0) {
      ctx.logger.warn('Stale weather snapshots detected', {
        flightId: request.flightId,
        staleCount,
        snapshots: snapshotsWithStaleness
          .filter((s) => s.staleness?.warning)
          .map((s) => ({
            id: s.id,
            checkpointType: s.checkpoint_type,
            staleHours: s.staleness?.hours,
            level: s.staleness?.level,
          })),
      });
    }

    return {
      snapshots: snapshotsWithStaleness,
      totalCount: snapshots.length,
      flightContext: flight
        ? {
            flightId: flight.id,
            departureTime: flight.departure_time,
            arrivalTime: flight.arrival_time,
            departureAirport: flight.departure_airport,
            arrivalAirport: flight.arrival_airport,
          }
        : undefined,
    };
  } catch (error) {
    ctx.logger.error('Failed to retrieve weather snapshots', {
      flightId: request.flightId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

/**
 * Retrieves historical weather snapshots across multiple flights
 * @param ctx - Execution context
 * @param startDate - Start date (ISO 8601)
 * @param endDate - End date (ISO 8601)
 * @param limit - Maximum snapshots to return
 * @returns Weather snapshots with flight context
 */
export async function getHistoricalSnapshots(
  ctx: ExecutionContext,
  startDate: string,
  endDate: string,
  limit: number = 100
): Promise<WeatherSnapshotWithStaleness[]> {
  ctx.logger.info('Retrieving historical weather snapshots', {
    startDate,
    endDate,
    limit,
  });

  try {
    const client = createClient(ctx.env.AIRESCHEDULER_DB);

    const maxLimit = 500;
    const safeLimit = Math.min(limit, maxLimit);

    const snapshots = await prepareQuery<WeatherSnapshot>(
      client,
      `SELECT ws.*
       FROM weather_snapshots ws
       WHERE ws.created_at BETWEEN ? AND ?
       ORDER BY ws.created_at DESC
       LIMIT ?`,
      [startDate, endDate, safeLimit]
    );

    // Compute staleness for each snapshot
    const snapshotsWithStaleness: WeatherSnapshotWithStaleness[] = snapshots.map((snapshot) => ({
      ...snapshot,
      staleness: calculateStaleness(snapshot.created_at),
    }));

    ctx.logger.info('Historical weather snapshots retrieved', {
      count: snapshots.length,
      startDate,
      endDate,
    });

    return snapshotsWithStaleness;
  } catch (error) {
    ctx.logger.error('Failed to retrieve historical weather snapshots', {
      startDate,
      endDate,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

// ========================================
// Main Service Function
// ========================================

/**
 * Polls weather data for flights and evaluates weather conditions
 * @param ctx - Execution context with correlation ID and logger
 * @param request - Weather poll request parameters
 * @returns Weather poll response with statistics
 */
export async function pollWeather(
  ctx: ExecutionContext,
  request: WeatherPollRequest
): Promise<WeatherPollResponse> {
  ctx.logger.info('Weather poll started', { flightIds: request.flightIds });

  try {
    const client = createClient(ctx.env.AIRESCHEDULER_DB);

    // Query flights within 7-day horizon
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    let flights: Flight[];
    if (request.flightIds && request.flightIds.length > 0) {
      // Query specific flights
      const placeholders = request.flightIds.map(() => '?').join(',');
      flights = await prepareQuery<Flight>(
        client,
        `SELECT * FROM flights
         WHERE id IN (${placeholders})
         AND status = 'scheduled'
         ORDER BY departure_time`,
        request.flightIds
      );
    } else {
      // Query all flights in 7-day horizon
      flights = await prepareQuery<Flight>(
        client,
        `SELECT * FROM flights
         WHERE departure_time >= ? AND departure_time <= ?
         AND status = 'scheduled'
         ORDER BY departure_time`,
        [now.toISOString(), sevenDaysFromNow.toISOString()]
      );
    }

    ctx.logger.info('Flights retrieved for weather polling', {
      count: flights.length,
    });

    let snapshotsCreated = 0;

    // Process each flight
    for (const flight of flights) {
      try {
        ctx.logger.info('Processing flight weather', {
          flightId: flight.id,
          departureAirport: flight.departure_airport,
          arrivalAirport: flight.arrival_airport,
          departureTime: flight.departure_time,
        });

        // Get weather for all checkpoints
        const checkpoints = await getCheckpointWeather(ctx, flight);

        // Persist weather snapshots
        for (const checkpoint of checkpoints) {
          await persistWeatherSnapshot(ctx, checkpoint);
          snapshotsCreated++;
        }

        ctx.logger.info('Flight weather processing completed', {
          flightId: flight.id,
          checkpointsProcessed: checkpoints.length,
        });
      } catch (error) {
        ctx.logger.error('Failed to process flight weather', {
          flightId: flight.id,
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        });
        // Continue processing other flights
      }
    }

    // Trigger classification after snapshot creation
    let classificationResults: classificationService.ClassificationResult[] = [];
    if (snapshotsCreated > 0) {
      ctx.logger.info('Triggering flight classification after snapshot creation');
      try {
        const classificationResponse = await classificationService.classifyFlights(ctx, {
          flightIds: flights.map((f) => f.id),
        });
        classificationResults = classificationResponse.results;
        ctx.logger.info('Classification completed', {
          classificationsCompleted: classificationResults.length,
        });
      } catch (error) {
        ctx.logger.error('Classification failed during weather poll', {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        });
        // Continue even if classification fails
      }
    }

    const result = {
      snapshotsCreated,
      flightsEvaluated: flights.length,
      classifications: classificationResults.map((r) => ({
        flightId: r.flightId,
        weatherStatus: r.weatherStatus,
      })),
    };

    ctx.logger.info('Weather poll completed', result);
    return result;
  } catch (error) {
    ctx.logger.error('Weather poll failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}
