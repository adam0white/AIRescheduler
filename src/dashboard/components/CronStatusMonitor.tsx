/**
 * CronStatusMonitor Component
 * Displays cron execution status, metrics, and error alerts
 * Story 5.3: AC5 - Dashboard Component for Cron Status Monitoring
 */

import { useState, useEffect } from 'react';
import { useRpc } from '../hooks/useRpc';

interface CronRun {
  id: number;
  correlationId: string;
  status: 'success' | 'partial' | 'error';
  startedAt: string;
  completedAt: string;
  durationMs: number;
  errorCount: number;
  weatherSnapshotsCreated: number;
  flightsAnalyzed: number;
  weatherConflictsFound: number;
  flightsRescheduled: number;
  flightsPendingReview: number;
  flightsSkipped: number;
  errorDetails: string[];
}

export function CronStatusMonitor() {
  const { call } = useRpc();
  const [cronRuns, setCronRuns] = useState<CronRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<number | null>(null);

  const loadCronRuns = async () => {
    setLoading(true);
    setError(null);
    try {
      const { result } = await call('getCronRuns', { limit: 10 });
      setCronRuns(result.runs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cron runs');
      console.error('Failed to load cron runs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCronRuns();
    // Auto-refresh every 60 seconds
    const interval = setInterval(loadCronRuns, 60000);
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: 'success' | 'partial' | 'error') => {
    switch (status) {
      case 'success':
        return { bg: '#10b981', text: '#ffffff', label: 'Success' };
      case 'partial':
        return { bg: '#f59e0b', text: '#ffffff', label: 'Partial' };
      case 'error':
        return { bg: '#ef4444', text: '#ffffff', label: 'Error' };
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) {
      return `${ms}ms`;
    }
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatRelativeTime = (isoDate: string) => {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSeconds < 60) {
      return `${diffSeconds} seconds ago`;
    } else if (diffMinutes < 60) {
      return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    } else {
      return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    }
  };

  const lastRun = cronRuns.length > 0 ? cronRuns[0] : null;

  return (
    <div
      style={{
        padding: '2rem',
        maxWidth: '1200px',
        margin: '0 auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
        }}
      >
        <h2
          style={{
            fontSize: '1.5rem',
            fontWeight: 'bold',
            margin: 0,
            color: '#f1f5f9',
          }}
        >
          Cron Status Monitor
        </h2>
        <button
          onClick={loadCronRuns}
          disabled={loading}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '0.375rem',
            backgroundColor: loading ? '#374151' : '#3b82f6',
            color: '#ffffff',
            border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: '1rem',
            borderRadius: '0.5rem',
            backgroundColor: '#7f1d1d',
            border: '1px solid #991b1b',
            marginBottom: '1.5rem',
            color: '#fecaca',
          }}
        >
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Last Cron Run Summary Card */}
      {lastRun && (
        <div
          style={{
            padding: '1.5rem',
            borderRadius: '0.5rem',
            backgroundColor: '#1e293b',
            border: '1px solid #334155',
            marginBottom: '1.5rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: '1rem',
            }}
          >
            <h3
              style={{
                fontSize: '1.25rem',
                fontWeight: 'bold',
                margin: 0,
                color: '#f1f5f9',
              }}
            >
              Last Cron Run
            </h3>
            <div
              style={{
                padding: '0.25rem 0.75rem',
                borderRadius: '0.375rem',
                backgroundColor: getStatusColor(lastRun.status).bg,
                color: getStatusColor(lastRun.status).text,
                fontSize: '0.875rem',
                fontWeight: 500,
              }}
            >
              {getStatusColor(lastRun.status).label}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <div style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                Last Run
              </div>
              <div style={{ fontSize: '1rem', color: '#f1f5f9' }}>
                {formatRelativeTime(lastRun.completedAt)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                Duration
              </div>
              <div style={{ fontSize: '1rem', color: '#f1f5f9' }}>
                {formatDuration(lastRun.durationMs)}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
            <div style={{ padding: '0.75rem', borderRadius: '0.375rem', backgroundColor: '#0f172a' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                Flights Analyzed
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#3b82f6' }}>
                {lastRun.flightsAnalyzed}
              </div>
            </div>
            <div style={{ padding: '0.75rem', borderRadius: '0.375rem', backgroundColor: '#0f172a' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                Conflicts Found
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f59e0b' }}>
                {lastRun.weatherConflictsFound}
              </div>
            </div>
            <div style={{ padding: '0.75rem', borderRadius: '0.375rem', backgroundColor: '#0f172a' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                Rescheduled
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#10b981' }}>
                {lastRun.flightsRescheduled}
              </div>
            </div>
          </div>

          {/* Error Alert */}
          {lastRun.status !== 'success' && (
            <div
              style={{
                marginTop: '1rem',
                padding: '1rem',
                borderRadius: '0.375rem',
                backgroundColor: lastRun.status === 'error' ? '#7f1d1d' : '#78350f',
                border: lastRun.status === 'error' ? '1px solid #991b1b' : '1px solid #92400e',
              }}
            >
              <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', color: '#fef3c7' }}>
                {lastRun.status === 'error' ? '⚠️ Pipeline Failure' : '⚠️ Partial Execution'}
              </div>
              <div style={{ fontSize: '0.875rem', color: '#fef3c7', marginBottom: '0.5rem' }}>
                {lastRun.errorCount} error{lastRun.errorCount === 1 ? '' : 's'} occurred during execution
              </div>
              {lastRun.errorDetails.length > 0 && (
                <ul style={{ margin: '0.5rem 0 0 1rem', padding: 0, fontSize: '0.875rem', color: '#fecaca' }}>
                  {lastRun.errorDetails.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!loading && cronRuns.length === 0 && (
        <div
          style={{
            padding: '3rem',
            borderRadius: '0.5rem',
            backgroundColor: '#1e293b',
            border: '1px solid #334155',
            textAlign: 'center',
            color: '#94a3b8',
          }}
        >
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏱️</div>
          <div style={{ fontSize: '1.125rem', fontWeight: 500 }}>No cron runs recorded yet</div>
          <div style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
            Cron runs will appear here after the first execution
          </div>
        </div>
      )}

      {/* Recent Runs Timeline */}
      {cronRuns.length > 0 && (
        <div
          style={{
            padding: '1.5rem',
            borderRadius: '0.5rem',
            backgroundColor: '#1e293b',
            border: '1px solid #334155',
          }}
        >
          <h3
            style={{
              fontSize: '1.25rem',
              fontWeight: 'bold',
              marginTop: 0,
              marginBottom: '1rem',
              color: '#f1f5f9',
            }}
          >
            Recent Runs
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {cronRuns.slice(0, 5).map((run) => (
              <div
                key={run.id}
                style={{
                  padding: '1rem',
                  borderRadius: '0.375rem',
                  backgroundColor: '#0f172a',
                  border: '1px solid #1e293b',
                  cursor: 'pointer',
                }}
                onClick={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: getStatusColor(run.status).bg,
                      }}
                    />
                    <div>
                      <div style={{ fontSize: '0.875rem', color: '#f1f5f9' }}>
                        {formatRelativeTime(run.completedAt)}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        Duration: {formatDuration(run.durationMs)}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.875rem' }}>
                    <div>
                      <span style={{ color: '#94a3b8' }}>Analyzed: </span>
                      <span style={{ color: '#f1f5f9', fontWeight: 500 }}>{run.flightsAnalyzed}</span>
                    </div>
                    <div>
                      <span style={{ color: '#94a3b8' }}>Rescheduled: </span>
                      <span style={{ color: '#10b981', fontWeight: 500 }}>{run.flightsRescheduled}</span>
                    </div>
                    {run.errorCount > 0 && (
                      <div>
                        <span style={{ color: '#94a3b8' }}>Errors: </span>
                        <span style={{ color: '#ef4444', fontWeight: 500 }}>{run.errorCount}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedRunId === run.id && (
                  <div
                    style={{
                      marginTop: '1rem',
                      paddingTop: '1rem',
                      borderTop: '1px solid #334155',
                    }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', fontSize: '0.875rem' }}>
                      <div>
                        <span style={{ color: '#94a3b8' }}>Correlation ID: </span>
                        <span style={{ color: '#f1f5f9', fontFamily: 'monospace' }}>{run.correlationId}</span>
                      </div>
                      <div>
                        <span style={{ color: '#94a3b8' }}>Weather Snapshots: </span>
                        <span style={{ color: '#f1f5f9' }}>{run.weatherSnapshotsCreated}</span>
                      </div>
                      <div>
                        <span style={{ color: '#94a3b8' }}>Conflicts Found: </span>
                        <span style={{ color: '#f1f5f9' }}>{run.weatherConflictsFound}</span>
                      </div>
                      <div>
                        <span style={{ color: '#94a3b8' }}>Pending Review: </span>
                        <span style={{ color: '#f1f5f9' }}>{run.flightsPendingReview}</span>
                      </div>
                      <div>
                        <span style={{ color: '#94a3b8' }}>Skipped: </span>
                        <span style={{ color: '#f1f5f9' }}>{run.flightsSkipped}</span>
                      </div>
                    </div>
                    {run.errorDetails.length > 0 && (
                      <div style={{ marginTop: '0.75rem' }}>
                        <div style={{ color: '#94a3b8', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                          Error Details:
                        </div>
                        <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.875rem', color: '#fca5a5' }}>
                          {run.errorDetails.map((error, index) => (
                            <li key={index}>{error}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
