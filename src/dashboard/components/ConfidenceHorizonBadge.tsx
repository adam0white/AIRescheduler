/**
 * ConfidenceHorizonBadge Component
 * Displays forecast validity countdown with color-coded status
 */

import { calculateConfidenceStatus } from '../../lib/weather-utils';

interface ConfidenceHorizonBadgeProps {
  forecastTime: string; // ISO 8601
  confidenceHorizon: number; // hours
}

export function ConfidenceHorizonBadge({
  forecastTime,
  confidenceHorizon,
}: ConfidenceHorizonBadgeProps) {
  const confidenceStatus = calculateConfidenceStatus(forecastTime, confidenceHorizon);

  const forecastDate = new Date(forecastTime);
  const expirationDate = new Date(
    forecastDate.getTime() + confidenceHorizon * 60 * 60 * 1000
  );

  const tooltipText = `Forecast: ${forecastDate.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })}\nExpires: ${expirationDate.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })}`;

  return (
    <span
      className="confidence-horizon-badge"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        padding: '0.25rem 0.5rem',
        borderRadius: '0.375rem',
        fontSize: '0.75rem',
        fontWeight: 500,
        backgroundColor: `${confidenceStatus.color}20`,
        color: confidenceStatus.color,
        border: `1px solid ${confidenceStatus.color}`,
      }}
      title={tooltipText}
    >
      <span
        style={{
          width: '0.5rem',
          height: '0.5rem',
          borderRadius: '50%',
          backgroundColor: confidenceStatus.color,
        }}
      />
      {confidenceStatus.message}
    </span>
  );
}
