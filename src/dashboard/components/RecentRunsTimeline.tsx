/**
 * RecentRunsTimeline Component
 * Displays a timeline of recent cron runs with expandable details
 */

import { useState } from 'react';
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

interface RecentRunsTimelineProps {
  runs: CronRun[];
  formatDuration: (ms: number) => string;
  formatRelativeTime: (isoDate: string) => string;
  getStatusColor: (status: 'success' | 'partial' | 'error') => {
    bg: string;
    text: string;
    label: string;
  };
}

export function RecentRunsTimeline({
  runs,
  formatDuration,
  formatRelativeTime,
  getStatusColor,
}: RecentRunsTimelineProps) {
  const [expandedRunId, setExpandedRunId] = useState<number | null>(null);

  if (runs.length === 0) {
    return null;
  }

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Recent Runs</h3>

      <div className={styles.timelineContainer}>
        {runs.slice(0, 5).map((run) => (
          <div
            key={run.id}
            className={styles.timelineItem}
            onClick={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}
          >
            <div className={styles.timelineItemHeader}>
              <div className={styles.timelineItemLeft}>
                <div
                  className={styles.statusDot}
                  style={{
                    backgroundColor: getStatusColor(run.status).bg,
                  }}
                />
                <div>
                  <div className={styles.timelineTime}>
                    {formatRelativeTime(run.completedAt)}
                  </div>
                  <div className={styles.timelineDuration}>
                    Duration: {formatDuration(run.durationMs)}
                  </div>
                </div>
              </div>
              <div className={styles.timelineMetrics}>
                <div>
                  <span className={styles.timelineMetricLabel}>Analyzed: </span>
                  <span className={`${styles.timelineMetricValue} ${styles.timelineMetricValueNormal}`}>
                    {run.flightsAnalyzed}
                  </span>
                </div>
                <div>
                  <span className={styles.timelineMetricLabel}>Rescheduled: </span>
                  <span className={`${styles.timelineMetricValue} ${styles.timelineMetricValueSuccess}`}>
                    {run.flightsRescheduled}
                  </span>
                </div>
                {run.errorCount > 0 && (
                  <div>
                    <span className={styles.timelineMetricLabel}>Errors: </span>
                    <span className={`${styles.timelineMetricValue} ${styles.timelineMetricValueError}`}>
                      {run.errorCount}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {expandedRunId === run.id && (
              <div className={styles.expandedDetails}>
                <div className={styles.detailsGrid}>
                  <div>
                    <span className={styles.detailLabel}>Correlation ID: </span>
                    <span className={`${styles.detailValue} ${styles.detailValueMono}`}>
                      {run.correlationId}
                    </span>
                  </div>
                  <div>
                    <span className={styles.detailLabel}>Weather Snapshots: </span>
                    <span className={styles.detailValue}>{run.weatherSnapshotsCreated}</span>
                  </div>
                  <div>
                    <span className={styles.detailLabel}>Conflicts Found: </span>
                    <span className={styles.detailValue}>{run.weatherConflictsFound}</span>
                  </div>
                  <div>
                    <span className={styles.detailLabel}>Pending Review: </span>
                    <span className={styles.detailValue}>{run.flightsPendingReview}</span>
                  </div>
                  <div>
                    <span className={styles.detailLabel}>Skipped: </span>
                    <span className={styles.detailValue}>{run.flightsSkipped}</span>
                  </div>
                </div>
                {run.errorDetails.length > 0 && (
                  <div className={styles.errorDetailsSection}>
                    <div className={styles.detailLabel}>Error Details:</div>
                    <ul className={styles.errorDetailsList}>
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
  );
}
