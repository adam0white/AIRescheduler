/**
 * CheckpointWeatherCard Component
 * Displays detailed weather data for a flight checkpoint with severity color coding
 */

import { WeatherSnapshot } from '../../rpc/schema';
import {
  getWindSpeedSeverity,
  getVisibilitySeverity,
  getCeilingSeverity,
  formatDateTime,
  formatRelativeTime,
} from '../../lib/weather-utils';
import { ConfidenceHorizonBadge } from './ConfidenceHorizonBadge';
import { calculateStaleness } from '../../services/weather-service';

interface CheckpointWeatherCardProps {
  snapshot: WeatherSnapshot;
  thresholds?: {
    maxWind: number;
    minVisibility: number;
    minCeiling: number;
  };
  showTimeline?: boolean;
}

export function CheckpointWeatherCard({
  snapshot,
  thresholds,
  showTimeline = false,
}: CheckpointWeatherCardProps) {
  const staleness = snapshot.staleness || calculateStaleness(snapshot.created_at);

  // Calculate severity colors
  const windSeverity = thresholds
    ? getWindSpeedSeverity(snapshot.wind_speed, thresholds.maxWind)
    : { color: '#6b7280', level: 'safe' as const };

  const visibilitySeverity = thresholds
    ? getVisibilitySeverity(snapshot.visibility, thresholds.minVisibility)
    : { color: '#6b7280', level: 'safe' as const };

  const ceilingSeverity = thresholds
    ? getCeilingSeverity(snapshot.ceiling, thresholds.minCeiling)
    : { color: '#6b7280', level: 'safe' as const };

  // Format checkpoint type for display
  const checkpointLabel =
    snapshot.checkpoint_type.charAt(0).toUpperCase() + snapshot.checkpoint_type.slice(1);

  return (
    <div
      className="checkpoint-weather-card"
      style={{
        padding: '1rem',
        borderRadius: '0.5rem',
        border: '1px solid #e5e7eb',
        backgroundColor: '#ffffff',
        marginBottom: '0.75rem',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span
            className="checkpoint-badge"
            style={{
              padding: '0.25rem 0.5rem',
              borderRadius: '0.375rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              backgroundColor: '#3b82f6',
              color: '#ffffff',
            }}
          >
            {checkpointLabel}
          </span>
          <span
            className="location"
            style={{
              fontSize: '0.875rem',
              fontWeight: 500,
              color: '#1f2937',
            }}
          >
            {snapshot.location}
          </span>
        </div>

        {staleness.warning && (
          <span
            className="staleness-warning"
            style={{
              padding: '0.25rem 0.5rem',
              borderRadius: '0.375rem',
              fontSize: '0.75rem',
              fontWeight: 500,
              backgroundColor:
                staleness.level === 'very-stale' ? '#fef2f2' : '#fffbeb',
              color: staleness.level === 'very-stale' ? '#dc2626' : '#d97706',
              border: `1px solid ${staleness.level === 'very-stale' ? '#fecaca' : '#fde68a'}`,
            }}
          >
            {staleness.message}
          </span>
        )}
      </div>

      {/* Weather Conditions */}
      <div
        className="weather-conditions"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: '0.75rem',
          marginBottom: showTimeline ? '0.75rem' : '0',
        }}
      >
        {/* Wind Speed */}
        <div className="condition">
          <div
            style={{
              fontSize: '0.75rem',
              fontWeight: 500,
              color: '#6b7280',
              marginBottom: '0.25rem',
            }}
          >
            Wind
          </div>
          <div
            style={{
              fontSize: '1rem',
              fontWeight: 600,
              color: windSeverity.color,
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
            }}
          >
            {snapshot.wind_speed} kt
            {thresholds && windSeverity.level !== 'safe' && (
              <span style={{ fontSize: '0.875rem' }}>
                {windSeverity.level === 'breach' ? '!' : '⚠'}
              </span>
            )}
          </div>
        </div>

        {/* Visibility */}
        <div className="condition">
          <div
            style={{
              fontSize: '0.75rem',
              fontWeight: 500,
              color: '#6b7280',
              marginBottom: '0.25rem',
            }}
          >
            Visibility
          </div>
          <div
            style={{
              fontSize: '1rem',
              fontWeight: 600,
              color: visibilitySeverity.color,
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
            }}
          >
            {snapshot.visibility} mi
            {thresholds && visibilitySeverity.level !== 'safe' && (
              <span style={{ fontSize: '0.875rem' }}>
                {visibilitySeverity.level === 'breach' ? '!' : '⚠'}
              </span>
            )}
          </div>
        </div>

        {/* Ceiling */}
        <div className="condition">
          <div
            style={{
              fontSize: '0.75rem',
              fontWeight: 500,
              color: '#6b7280',
              marginBottom: '0.25rem',
            }}
          >
            Ceiling
          </div>
          <div
            style={{
              fontSize: '1rem',
              fontWeight: 600,
              color: ceilingSeverity.color,
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
            }}
          >
            {snapshot.ceiling !== null ? `${snapshot.ceiling} ft` : 'Unlimited'}
            {thresholds && ceilingSeverity.level !== 'safe' && (
              <span style={{ fontSize: '0.875rem' }}>
                {ceilingSeverity.level === 'breach' ? '!' : '⚠'}
              </span>
            )}
          </div>
        </div>

        {/* Conditions */}
        <div className="condition">
          <div
            style={{
              fontSize: '0.75rem',
              fontWeight: 500,
              color: '#6b7280',
              marginBottom: '0.25rem',
            }}
          >
            Conditions
          </div>
          <div
            style={{
              fontSize: '0.875rem',
              fontWeight: 500,
              color: '#1f2937',
            }}
          >
            {snapshot.conditions}
          </div>
        </div>
      </div>

      {/* Timeline Metadata */}
      {showTimeline && (
        <div
          className="timeline-metadata"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '0.75rem',
            borderTop: '1px solid #e5e7eb',
            fontSize: '0.75rem',
            color: '#6b7280',
          }}
        >
          <div>
            <span style={{ fontWeight: 500 }}>Forecast: </span>
            {formatDateTime(snapshot.forecast_time)}
            <span style={{ marginLeft: '0.5rem', opacity: 0.7 }}>
              ({formatRelativeTime(snapshot.created_at)})
            </span>
          </div>
          <ConfidenceHorizonBadge
            forecastTime={snapshot.forecast_time}
            confidenceHorizon={snapshot.confidence_horizon}
          />
        </div>
      )}
    </div>
  );
}
