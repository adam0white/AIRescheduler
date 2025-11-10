/**
 * HistoricalWeatherView Component
 * Displays historical weather snapshots with date range filtering
 */

import { useState } from 'react';
import { useRpc } from '../hooks/useRpc';
import { WeatherSnapshot } from '../../rpc/schema';
import { formatRelativeTime } from '../../lib/weather-utils';

export function HistoricalWeatherView() {
  const { call } = useRpc();
  const [snapshots, setSnapshots] = useState<WeatherSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default to last 7 days
  const defaultEndDate = new Date();
  const defaultStartDate = new Date(defaultEndDate.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [startDate, setStartDate] = useState(defaultStartDate.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(defaultEndDate.toISOString().split('T')[0]);
  const [flightId, setFlightId] = useState<string>('');

  const handleQuery = async () => {
    if (!flightId) {
      setError('Please enter a Flight ID');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { result } = await call('getWeatherSnapshots', {
        flightId: parseInt(flightId, 10),
        startDate: `${startDate}T00:00:00Z`,
        endDate: `${endDate}T23:59:59Z`,
        limit: 100,
      });
      setSnapshots(result.snapshots || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to query historical snapshots';
      setError(errorMessage);
      console.error('Failed to query historical snapshots:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    const csv = [
      'ID,Flight ID,Checkpoint,Location,Forecast Time,Wind (kt),Visibility (mi),Ceiling (ft),Conditions,Confidence Horizon (h),Created At,Correlation ID',
      ...snapshots.map((s) =>
        [
          s.id,
          s.flight_id,
          s.checkpoint_type,
          s.location,
          s.forecast_time,
          s.wind_speed,
          s.visibility,
          s.ceiling !== null ? s.ceiling : 'Unlimited',
          `"${s.conditions}"`,
          s.confidence_horizon,
          s.created_at,
          s.correlation_id,
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `weather-history-${startDate}-to-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="historical-weather-view"
      style={{
        padding: '1.5rem',
        backgroundColor: '#ffffff',
        borderRadius: '0.5rem',
        border: '1px solid #e5e7eb',
        color: '#1f2937',
        boxShadow: '0 25px 55px -40px rgba(30, 64, 175, 0.35)',
      }}
    >
      <h2
        style={{
          fontSize: '1.25rem',
          fontWeight: 600,
          color: '#1f2937',
          marginBottom: '1rem',
        }}
      >
        Historical Weather Query
      </h2>

      {/* Query Form */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '1rem',
          padding: '1rem',
          backgroundColor: '#f9fafb',
          borderRadius: '0.5rem',
        }}
      >
        <div>
          <label
            htmlFor="flightId"
            style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: '#374151',
              marginBottom: '0.25rem',
            }}
          >
            Flight ID
          </label>
          <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.75rem', color: '#6b7280' }}>
            Provide a specific flight to scope the query (required).
          </p>
          <input
            id="flightId"
            type="number"
            value={flightId}
            onChange={(e) => setFlightId(e.target.value)}
            placeholder="Enter flight ID"
            style={{
              width: '100%',
              padding: '0.5rem',
              borderRadius: '0.375rem',
              border: '1px solid #d1d5db',
              fontSize: '0.875rem',
            }}
          />
        </div>

        <div>
          <label
            htmlFor="startDate"
            style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: '#374151',
              marginBottom: '0.25rem',
            }}
          >
            Start Date
          </label>
          <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.75rem', color: '#6b7280' }}>
            Defaults to 7 days ago. Use the picker for precise ranges.
          </p>
          <input
            id="startDate"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem',
              borderRadius: '0.375rem',
              border: '1px solid #d1d5db',
              fontSize: '0.875rem',
            }}
          />
        </div>

        <div>
          <label
            htmlFor="endDate"
            style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: '#374151',
              marginBottom: '0.25rem',
            }}
          >
            End Date
          </label>
          <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.75rem', color: '#6b7280' }}>
            Must be after the start date; capped to the end of the selected day.
          </p>
          <input
            id="endDate"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem',
              borderRadius: '0.375rem',
              border: '1px solid #d1d5db',
              fontSize: '0.875rem',
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem' }}>
          <button
            onClick={handleQuery}
            disabled={loading}
            style={{
              flex: 1,
              padding: '0.5rem 1rem',
              borderRadius: '0.375rem',
              backgroundColor: '#3b82f6',
              color: '#ffffff',
              fontWeight: 500,
              fontSize: '0.875rem',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Querying...' : 'Query'}
          </button>
          {snapshots.length > 0 && (
            <button
              onClick={handleExport}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '0.375rem',
                backgroundColor: '#10b981',
                color: '#ffffff',
                fontWeight: 500,
                fontSize: '0.875rem',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div
          style={{
            padding: '0.75rem',
            borderRadius: '0.375rem',
            backgroundColor: '#fef2f2',
            color: '#dc2626',
            fontSize: '0.875rem',
            marginBottom: '1rem',
            border: '1px solid #fecaca',
          }}
        >
          {error}
        </div>
      )}

      {/* Results Table */}
      {snapshots.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              fontSize: '0.875rem',
              borderCollapse: 'collapse',
            }}
          >
            <thead>
              <tr style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 600 }}>ID</th>
                <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 600 }}>Checkpoint</th>
                <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 600 }}>Location</th>
                <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 600 }}>Wind</th>
                <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 600 }}>Visibility</th>
                <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 600 }}>Ceiling</th>
                <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 600 }}>Conditions</th>
                <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 600 }}>Created</th>
                <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 600 }}>Correlation ID</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((snapshot, idx) => (
                <tr
                  key={snapshot.id}
                  style={{
                    borderBottom: '1px solid #e5e7eb',
                    backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f9fafb',
                  }}
                >
                  <td style={{ padding: '0.75rem' }}>{snapshot.id}</td>
                  <td style={{ padding: '0.75rem' }}>
                    <span
                      style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '0.25rem',
                        backgroundColor: '#dbeafe',
                        color: '#1e40af',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                      }}
                    >
                      {snapshot.checkpoint_type}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem' }}>{snapshot.location}</td>
                  <td style={{ padding: '0.75rem' }}>{snapshot.wind_speed} kt</td>
                  <td style={{ padding: '0.75rem' }}>{snapshot.visibility} mi</td>
                  <td style={{ padding: '0.75rem' }}>
                    {snapshot.ceiling !== null ? `${snapshot.ceiling} ft` : 'Unlimited'}
                  </td>
                  <td style={{ padding: '0.75rem', color: '#1f2937' }}>{snapshot.conditions}</td>
                  <td style={{ padding: '0.75rem', fontSize: '0.75rem', color: '#6b7280' }}>
                    {formatRelativeTime(snapshot.created_at)}
                  </td>
                  <td
                    style={{
                      padding: '0.75rem',
                      fontSize: '0.75rem',
                      fontFamily: 'monospace',
                      color: '#6b7280',
                    }}
                    title={snapshot.correlation_id}
                  >
                    {snapshot.correlation_id.slice(0, 12)}...
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && snapshots.length === 0 && flightId && (
        <div
          style={{
            padding: '2rem',
            textAlign: 'center',
            color: '#6b7280',
            fontSize: '0.875rem',
            backgroundColor: '#f9fafb',
            borderRadius: '0.5rem',
          }}
        >
          No weather snapshots found for the specified criteria.
        </div>
      )}
    </div>
  );
}
