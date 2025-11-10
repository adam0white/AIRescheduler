/**
 * LastRunSummaryCard Component
 * Displays summary information for the most recent cron run
 */

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

interface LastRunSummaryCardProps {
  run: CronRun;
  formatDuration: (ms: number) => string;
  formatRelativeTime: (isoDate: string) => string;
  getStatusColor: (status: 'success' | 'partial' | 'error') => {
    bg: string;
    text: string;
    label: string;
  };
  trendSummary: {
    successStreak: number;
    failuresIn24h: number;
    averageDurationIn24h: number | null;
    lastIncidentRun: CronRun | null;
  } | null;
}

export function LastRunSummaryCard({
  run,
  formatDuration,
  formatRelativeTime,
  getStatusColor,
  trendSummary,
}: LastRunSummaryCardProps) {
  const statusColor = getStatusColor(run.status);
  const averageDurationLabel =
    trendSummary && trendSummary.averageDurationIn24h !== null
      ? formatDuration(trendSummary.averageDurationIn24h)
      : '—';

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>Last Cron Run</h3>
        <div
          className={styles.statusBadge}
          style={{
            backgroundColor: statusColor.bg,
            color: statusColor.text,
          }}
        >
          {statusColor.label}
        </div>
      </div>

      {trendSummary && (
        <div className={styles.trendBar}>
          <div>
            <div className={styles.trendLabel}>Success Streak</div>
            <div className={styles.trendValue}>{trendSummary.successStreak} run(s)</div>
          </div>
          <div>
            <div className={styles.trendLabel}>Failures (24h)</div>
            <div
              className={`${styles.trendValue} ${
                trendSummary.failuresIn24h > 0 ? styles.trendValueWarning : styles.trendValueSuccess
              }`}
            >
              {trendSummary.failuresIn24h}
            </div>
          </div>
          <div>
            <div className={styles.trendLabel}>Avg Duration (24h)</div>
            <div className={styles.trendValue}>{averageDurationLabel}</div>
          </div>
          <div>
            <div className={styles.trendLabel}>Last Incident</div>
            <div className={styles.trendValue}>
              {trendSummary.lastIncidentRun
                ? `${trendSummary.lastIncidentRun.status.toUpperCase()} · ${formatRelativeTime(
                    trendSummary.lastIncidentRun.completedAt
                  )}`
                : 'No incidents in history window'}
            </div>
          </div>
        </div>
      )}

      <div className={styles.twoColumnGrid}>
        <div>
          <div className={styles.metricLabel}>Last Run</div>
          <div className={styles.metricValue}>
            {formatRelativeTime(run.completedAt)}
          </div>
        </div>
        <div>
          <div className={styles.metricLabel}>Duration</div>
          <div className={styles.metricValue}>
            {formatDuration(run.durationMs)}
          </div>
        </div>
      </div>

      <div className={styles.threeColumnGrid}>
        <div className={styles.statBox}>
          <div className={styles.statLabel}>Flights Analyzed</div>
          <div className={`${styles.statValue} ${styles.statValuePrimary}`}>
            {run.flightsAnalyzed}
          </div>
        </div>
        <div className={styles.statBox}>
          <div className={styles.statLabel}>Conflicts Found</div>
          <div className={`${styles.statValue} ${styles.statValueWarning}`}>
            {run.weatherConflictsFound}
          </div>
        </div>
        <div className={styles.statBox}>
          <div className={styles.statLabel}>Rescheduled</div>
          <div className={`${styles.statValue} ${styles.statValueSuccess}`}>
            {run.flightsRescheduled}
          </div>
        </div>
      </div>

      {run.status !== 'success' && (
        <div
          className={`${styles.alertBox} ${
            run.status === 'error' ? styles.alertBoxError : styles.alertBoxPartial
          }`}
        >
          <div className={styles.alertTitle}>
            {run.status === 'error' ? '⚠️ Pipeline Failure' : '⚠️ Partial Execution'}
          </div>
          <div className={styles.alertMessage}>
            {run.errorCount} error{run.errorCount === 1 ? '' : 's'} occurred during execution
          </div>
          {run.errorDetails.length > 0 && (
            <ul className={styles.alertErrorList}>
              {run.errorDetails.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
