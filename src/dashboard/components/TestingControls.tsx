/**
 * TestingControls Component
 * Provides manual testing controls for RPC methods
 */

import { useState } from 'react';
import { useRpc } from '../hooks/useRpc';

interface ToastMessage {
  id: string;
  type: 'success' | 'error';
  message: string;
  correlationId?: string;
}

export function TestingControls() {
  const { call, loading, error } = useRpc();
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const showToast = (type: 'success' | 'error', message: string, correlationId?: string) => {
    const id = `toast-${Date.now()}`;
    const toast: ToastMessage = { id, type, message, correlationId };
    setToasts((prev) => [...prev, toast]);

    // Auto-remove toast after 5 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const handleSeedDemoData = async () => {
    try {
      const { result, correlationId } = await call('seedDemoData', {
        clearExisting: false,
      });

      const message = `Successfully seeded: ${result.students} students, ${result.instructors} instructors, ${result.aircraft} aircraft, ${result.flights} flights`;
      showToast('success', message, correlationId);
      setLastResult(JSON.stringify(result, null, 2));
    } catch (err) {
      showToast('error', error || 'Failed to seed demo data');
    }
  };

  const handleListFlights = async () => {
    try {
      const { result, correlationId } = await call('listFlights', {});

      const message = `Found ${result.totalCount} flight(s)`;
      showToast('success', message, correlationId);
      setLastResult(JSON.stringify(result, null, 2));
    } catch (err) {
      showToast('error', error || 'Failed to list flights');
    }
  };

  const handleWeatherPoll = async () => {
    try {
      const { result, correlationId } = await call('weatherPoll', {});

      const message = `Weather poll complete: ${result.snapshotsCreated} snapshots created, ${result.flightsEvaluated} flights evaluated`;
      showToast('success', message, correlationId);
      setLastResult(JSON.stringify(result, null, 2));
    } catch (err) {
      showToast('error', error || 'Failed to poll weather');
    }
  };

  const handleAutoReschedule = async () => {
    try {
      const { result, correlationId } = await call('autoReschedule', {});

      const message = `Auto reschedule complete: ${result.flightsProcessed} flights processed, ${result.reschedulesCreated} reschedules created, ${result.advisoriesIssued} advisories issued`;
      showToast('success', message, correlationId);
      setLastResult(JSON.stringify(result, null, 2));
    } catch (err) {
      showToast('error', error || 'Failed to auto reschedule');
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>
        Testing Controls
      </h2>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        <button
          onClick={handleSeedDemoData}
          disabled={loading}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: loading ? '#94a3b8' : '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: '500',
            fontSize: '0.875rem',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => {
            if (!loading) (e.target as HTMLButtonElement).style.backgroundColor = '#2563eb';
          }}
          onMouseLeave={(e) => {
            if (!loading) (e.target as HTMLButtonElement).style.backgroundColor = '#3b82f6';
          }}
        >
          {loading ? 'Loading...' : 'Seed Demo Data'}
        </button>

        <button
          onClick={handleListFlights}
          disabled={loading}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: loading ? '#94a3b8' : '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: '500',
            fontSize: '0.875rem',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => {
            if (!loading) (e.target as HTMLButtonElement).style.backgroundColor = '#059669';
          }}
          onMouseLeave={(e) => {
            if (!loading) (e.target as HTMLButtonElement).style.backgroundColor = '#10b981';
          }}
        >
          {loading ? 'Loading...' : 'List Flights'}
        </button>

        <button
          onClick={handleWeatherPoll}
          disabled={loading}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: loading ? '#94a3b8' : '#f59e0b',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: '500',
            fontSize: '0.875rem',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => {
            if (!loading) (e.target as HTMLButtonElement).style.backgroundColor = '#d97706';
          }}
          onMouseLeave={(e) => {
            if (!loading) (e.target as HTMLButtonElement).style.backgroundColor = '#f59e0b';
          }}
        >
          {loading ? 'Loading...' : 'Poll Weather'}
        </button>

        <button
          onClick={handleAutoReschedule}
          disabled={loading}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: loading ? '#94a3b8' : '#8b5cf6',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: '500',
            fontSize: '0.875rem',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => {
            if (!loading) (e.target as HTMLButtonElement).style.backgroundColor = '#7c3aed';
          }}
          onMouseLeave={(e) => {
            if (!loading) (e.target as HTMLButtonElement).style.backgroundColor = '#8b5cf6';
          }}
        >
          {loading ? 'Loading...' : 'Auto Reschedule'}
        </button>
      </div>

      {lastResult && (
        <div style={{ marginBottom: '2rem' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem' }}>
            Last Result:
          </h3>
          <pre
            style={{
              backgroundColor: '#1f2937',
              color: '#e5e7eb',
              padding: '1rem',
              borderRadius: '0.375rem',
              overflow: 'auto',
              fontSize: '0.875rem',
              maxHeight: '400px',
            }}
          >
            {lastResult}
          </pre>
        </div>
      )}

      {/* Toast Container */}
      <div
        style={{
          position: 'fixed',
          top: '1rem',
          right: '1rem',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          maxWidth: '400px',
        }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            style={{
              padding: '1rem',
              backgroundColor: toast.type === 'success' ? '#10b981' : '#ef4444',
              color: 'white',
              borderRadius: '0.375rem',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              animation: 'slideIn 0.3s ease-out',
            }}
          >
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: '0.875rem' }}>{toast.message}</p>
              {toast.correlationId && (
                <p
                  style={{
                    margin: '0.25rem 0 0 0',
                    fontSize: '0.75rem',
                    opacity: 0.8,
                    fontFamily: 'monospace',
                  }}
                >
                  ID: {toast.correlationId}
                </p>
              )}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              style={{
                marginLeft: '1rem',
                background: 'none',
                border: 'none',
                color: 'white',
                cursor: 'pointer',
                fontSize: '1.25rem',
                lineHeight: '1',
                padding: 0,
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
