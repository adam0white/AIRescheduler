/**
 * CronStatusMonitor Component
 * Displays cron execution status, metrics, and error alerts
 * Story 5.3: AC5 - Dashboard Component for Cron Status Monitoring
 */

import { useState, useEffect } from 'react';
import { useRpc } from '../hooks/useRpc';
import { ErrorAlert } from './ErrorAlert';
import { LastRunSummaryCard } from './LastRunSummaryCard';
import { RecentRunsTimeline } from './RecentRunsTimeline';
import styles from './CronStatusMonitor.module.css';

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
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Cron Status Monitor</h2>
        <button
          onClick={loadCronRuns}
          disabled={loading}
          className={styles.refreshButton}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && <ErrorAlert error={error} />}

      {lastRun && (
        <LastRunSummaryCard
          run={lastRun}
          formatDuration={formatDuration}
          formatRelativeTime={formatRelativeTime}
          getStatusColor={getStatusColor}
        />
      )}

      {!loading && cronRuns.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.emptyStateIcon}>⏱️</div>
          <div className={styles.emptyStateTitle}>No cron runs recorded yet</div>
          <div className={styles.emptyStateSubtitle}>
            Cron runs will appear here after the first execution
          </div>
        </div>
      )}

      <RecentRunsTimeline
        runs={cronRuns}
        formatDuration={formatDuration}
        formatRelativeTime={formatRelativeTime}
        getStatusColor={getStatusColor}
      />
    </div>
  );
}
