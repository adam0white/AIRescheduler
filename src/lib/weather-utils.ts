/**
 * Weather Utility Functions
 * Provides severity color coding and confidence horizon calculations
 */

// ========================================
// Color Severity Types
// ========================================

export interface SeverityColor {
  color: string;
  level: 'safe' | 'caution' | 'breach';
}

export interface ConfidenceStatus {
  remainingHours: number;
  status: 'valid' | 'expiring-soon' | 'expired';
  color: string;
  message: string;
}

// ========================================
// Severity Color Coding
// ========================================

/**
 * Calculates severity color for wind speed
 * @param windSpeed - Wind speed in knots
 * @param maxWindThreshold - Maximum wind threshold in knots
 * @returns Severity color metadata
 */
export function getWindSpeedSeverity(
  windSpeed: number,
  maxWindThreshold: number
): SeverityColor {
  const margin = ((maxWindThreshold - windSpeed) / maxWindThreshold) * 100;

  if (windSpeed > maxWindThreshold) {
    return { color: '#ef4444', level: 'breach' }; // Red - Exceeds limit
  } else if (margin <= 20) {
    return { color: '#f59e0b', level: 'caution' }; // Yellow - Close to limit
  } else {
    return { color: '#10b981', level: 'safe' }; // Green - Safe margin
  }
}

/**
 * Calculates severity color for visibility
 * @param visibility - Visibility in statute miles
 * @param minVisibilityThreshold - Minimum visibility threshold in statute miles
 * @returns Severity color metadata
 */
export function getVisibilitySeverity(
  visibility: number,
  minVisibilityThreshold: number
): SeverityColor {
  const margin = ((visibility - minVisibilityThreshold) / minVisibilityThreshold) * 100;

  if (visibility < minVisibilityThreshold) {
    return { color: '#ef4444', level: 'breach' }; // Red
  } else if (margin <= 20) {
    return { color: '#f59e0b', level: 'caution' }; // Yellow
  } else {
    return { color: '#10b981', level: 'safe' }; // Green
  }
}

/**
 * Calculates severity color for ceiling
 * @param ceiling - Ceiling in feet AGL (null if unlimited)
 * @param minCeilingThreshold - Minimum ceiling threshold in feet
 * @returns Severity color metadata
 */
export function getCeilingSeverity(
  ceiling: number | null,
  minCeilingThreshold: number
): SeverityColor {
  if (ceiling === null) {
    // Unlimited ceiling always passes
    return { color: '#10b981', level: 'safe' };
  }

  const margin = ((ceiling - minCeilingThreshold) / minCeilingThreshold) * 100;

  if (ceiling < minCeilingThreshold) {
    return { color: '#ef4444', level: 'breach' }; // Red
  } else if (margin <= 20) {
    return { color: '#f59e0b', level: 'caution' }; // Yellow
  } else {
    return { color: '#10b981', level: 'safe' }; // Green
  }
}

/**
 * Generic weather severity color calculator
 * @param value - Current weather value
 * @param threshold - Threshold value
 * @param isMinThreshold - True if threshold is minimum (like visibility), false if maximum (like wind)
 * @returns Severity color metadata
 */
export function getWeatherSeverityColor(
  value: number | null,
  threshold: number,
  isMinThreshold: boolean = false
): SeverityColor {
  // Handle null values (e.g., unlimited ceiling)
  if (value === null) {
    return { color: '#10b981', level: 'safe' };
  }

  if (isMinThreshold) {
    // For minimum thresholds (visibility, ceiling)
    const margin = ((value - threshold) / threshold) * 100;

    if (value < threshold) {
      return { color: '#ef4444', level: 'breach' };
    } else if (margin <= 20) {
      return { color: '#f59e0b', level: 'caution' };
    } else {
      return { color: '#10b981', level: 'safe' };
    }
  } else {
    // For maximum thresholds (wind speed)
    const margin = ((threshold - value) / threshold) * 100;

    if (value > threshold) {
      return { color: '#ef4444', level: 'breach' };
    } else if (margin <= 20) {
      return { color: '#f59e0b', level: 'caution' };
    } else {
      return { color: '#10b981', level: 'safe' };
    }
  }
}

// ========================================
// Confidence Horizon Calculations
// ========================================

/**
 * Calculates confidence status for a forecast
 * @param forecastTime - ISO 8601 forecast time
 * @param confidenceHorizon - Confidence horizon in hours
 * @returns Confidence status metadata
 */
export function calculateConfidenceStatus(
  forecastTime: string,
  confidenceHorizon: number
): ConfidenceStatus {
  const forecastDate = new Date(forecastTime);
  const expirationDate = new Date(forecastDate.getTime() + confidenceHorizon * 60 * 60 * 1000);
  const now = new Date();
  const remainingHours = (expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60);

  let status: ConfidenceStatus['status'];
  let color: string;
  let message: string;

  if (remainingHours > 12) {
    status = 'valid';
    color = '#10b981'; // green
    message = `Valid for ${Math.round(remainingHours)}h`;
  } else if (remainingHours > 0) {
    status = 'expiring-soon';
    color = '#f59e0b'; // yellow
    message = `Expires in ${Math.round(remainingHours)}h`;
  } else {
    status = 'expired';
    color = '#ef4444'; // red
    message = `Expired ${Math.abs(Math.round(remainingHours))}h ago`;
  }

  return { remainingHours, status, color, message };
}

// ========================================
// Date/Time Formatting
// ========================================

/**
 * Formats a date/time for display
 * @param isoString - ISO 8601 date string
 * @param includeDate - Include date in output
 * @returns Formatted date/time string
 */
export function formatDateTime(isoString: string, includeDate: boolean = true): string {
  const date = new Date(isoString);

  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  };

  const dateTimeOptions: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  };

  return date.toLocaleString('en-US', includeDate ? dateTimeOptions : timeOptions);
}

/**
 * Formats a relative time (e.g., "2 hours ago")
 * @param isoString - ISO 8601 date string
 * @returns Relative time string
 */
export function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return formatDateTime(isoString);
}
