/**
 * WeatherTimeline Component
 * Displays chronological weather snapshots for a flight organized by checkpoint type
 */

import { useState, useEffect } from 'react';
import { useRpc } from '../hooks/useRpc';
import { WeatherSnapshot } from '../../rpc/schema';
import { CheckpointWeatherCard } from './CheckpointWeatherCard';

interface WeatherTimelineProps {
  flightId: number;
  departureTime: string;
  arrivalTime: string;
  thresholds?: {
    maxWind: number;
    minVisibility: number;
    minCeiling: number;
  };
}

export function WeatherTimeline({
  flightId,
  thresholds,
}: WeatherTimelineProps) {
  const { call } = useRpc();
  const [snapshots, setSnapshots] = useState<WeatherSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSnapshots = async () => {
    setLoading(true);
    setError(null);
    try {
      const { result } = await call('getWeatherSnapshots', { flightId, limit: 15 });
      setSnapshots(result.snapshots || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load weather snapshots';
      setError(errorMessage);
      console.error('Failed to load weather snapshots:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSnapshots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flightId]);

  // Group snapshots by checkpoint type
  const groupedSnapshots = snapshots.reduce(
    (acc, snapshot) => {
      if (!acc[snapshot.checkpoint_type]) {
        acc[snapshot.checkpoint_type] = [];
      }
      acc[snapshot.checkpoint_type]!.push(snapshot);
      return acc;
    },
    {} as Record<string, WeatherSnapshot[]>
  );

  if (loading) {
    return (
      <div
        className="weather-timeline-loading"
        style={{
          padding: '2rem',
          textAlign: 'center',
          color: '#6b7280',
          fontSize: '0.875rem',
        }}
      >
        Loading weather timeline...
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="weather-timeline-error"
        style={{
          padding: '1rem',
          borderRadius: '0.5rem',
          backgroundColor: '#fef2f2',
          color: '#dc2626',
          fontSize: '0.875rem',
          border: '1px solid #fecaca',
        }}
      >
        Error: {error}
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <div
        className="weather-timeline-empty"
        style={{
          padding: '2rem',
          textAlign: 'center',
          color: '#6b7280',
          fontSize: '0.875rem',
          backgroundColor: '#f9fafb',
          borderRadius: '0.5rem',
          border: '1px solid #e5e7eb',
        }}
      >
        No weather snapshots available for this flight.
        <br />
        Click Poll Weather to fetch current conditions.
      </div>
    );
  }

  return (
    <div
      className="weather-timeline"
      style={{
        padding: '1rem',
        backgroundColor: '#f9fafb',
        borderRadius: '0.5rem',
        border: '1px solid #e5e7eb',
      }}
    >
      <div
        style={{
          marginBottom: '1rem',
          paddingBottom: '0.75rem',
          borderBottom: '2px solid #e5e7eb',
        }}
      >
        <h3
          style={{
            fontSize: '1rem',
            fontWeight: 600,
            color: '#1f2937',
            marginBottom: '0.25rem',
          }}
        >
          Weather Timeline
        </h3>
        <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>
          Showing {snapshots.length} snapshot{snapshots.length !== 1 ? 's' : ''} for this flight
        </p>
      </div>

      {(['departure', 'arrival', 'corridor'] as const).map((checkpointType) => {
        const checkpointSnapshots = groupedSnapshots[checkpointType];

        if (!checkpointSnapshots || checkpointSnapshots.length === 0) {
          return null;
        }

        const checkpointLabel =
          checkpointType.charAt(0).toUpperCase() + checkpointType.slice(1);

        return (
          <div key={checkpointType} className="checkpoint-section" style={{ marginBottom: '1.5rem' }}>
            <h4
              style={{
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#374151',
                marginBottom: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <span
                style={{
                  width: '0.5rem',
                  height: '0.5rem',
                  borderRadius: '50%',
                  backgroundColor: '#3b82f6',
                }}
              />
              {checkpointLabel} ({checkpointSnapshots.length})
            </h4>
            <div className="timeline-cards">
              {checkpointSnapshots.slice(0, 5).map((snapshot) => (
                <CheckpointWeatherCard
                  key={snapshot.id}
                  snapshot={snapshot}
                  thresholds={thresholds}
                  showTimeline={true}
                />
              ))}
              {checkpointSnapshots.length > 5 && (
                <div
                  style={{
                    padding: '0.5rem',
                    textAlign: 'center',
                    fontSize: '0.75rem',
                    color: '#6b7280',
                    fontStyle: 'italic',
                  }}
                >
                  + {checkpointSnapshots.length - 5} more snapshot{checkpointSnapshots.length - 5 !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
