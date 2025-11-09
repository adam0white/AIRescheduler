/**
 * ErrorAlert Component
 * Displays error messages in a styled alert box
 */

import styles from './CronStatusMonitor.module.css';

interface ErrorAlertProps {
  error: string;
}

export function ErrorAlert({ error }: ErrorAlertProps) {
  return (
    <div className={styles.errorAlert}>
      <strong>Error:</strong> {error}
    </div>
  );
}
