/**
 * TestingControls Component
 * Provides manual testing controls for RPC methods
 */

import { useState } from 'react';
import { useRpc } from '../hooks/useRpc';
import { RescheduleRecommendationCard } from './RescheduleRecommendationCard';

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
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [recommendationsMetadata, setRecommendationsMetadata] = useState<any>(null);
  const [showRecommendations, setShowRecommendations] = useState(false);

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

  const handleClassifyFlights = async () => {
    try {
      const { result, correlationId } = await call('classifyFlights', {});

      const summary = result.results.reduce(
        (acc: any, r: any) => {
          acc[r.weatherStatus] = (acc[r.weatherStatus] || 0) + 1;
          return acc;
        },
        {}
      );

      const message = `Classification complete: ${result.results.length} flights classified (Clear: ${summary.clear || 0}, Advisory: ${summary.advisory || 0}, Auto-reschedule: ${summary['auto-reschedule'] || 0}, Unknown: ${summary.unknown || 0})`;
      showToast('success', message, correlationId);
      setLastResult(JSON.stringify(result, null, 2));
    } catch (err) {
      showToast('error', error || 'Failed to classify flights');
    }
  };

  const handleGenerateRecommendations = async () => {
    try {
      // First, get a flight ID to test with (use flight 1 for demo)
      const flightId = 1;

      // Generate candidate slots
      const startTime = Date.now();
      const { result: candidateSlotsResult } = await call(
        'generateCandidateSlots',
        { flightId }
      );

      if (candidateSlotsResult.error) {
        showToast('error', `Failed to generate candidates: ${candidateSlotsResult.error}`);
        return;
      }

      if (candidateSlotsResult.candidateSlots.length === 0) {
        showToast('error', 'No candidate slots found for this flight');
        return;
      }

      // Generate AI recommendations
      const { result: recommendationsResult, correlationId } = await call(
        'generateRescheduleRecommendations',
        { candidateSlotsResult }
      );

      const elapsedMs = Date.now() - startTime;

      if (recommendationsResult.error) {
        showToast('error', `Failed to generate recommendations: ${recommendationsResult.error}`);
        return;
      }

      // Update UI
      setRecommendations(recommendationsResult.recommendations || []);
      setRecommendationsMetadata({
        flightId,
        generatedAt: new Date().toISOString(),
        aiUnavailable: recommendationsResult.aiUnavailable,
        fallbackReason: recommendationsResult.fallbackReason,
        elapsedMs,
      });
      setShowRecommendations(true);

      const statusText = recommendationsResult.aiUnavailable
        ? `AI ranking unavailable (${recommendationsResult.fallbackReason}), used fallback`
        : 'AI ranking available';

      const message = `Generated ${recommendationsResult.recommendations.length} recommendations in ${elapsedMs}ms. ${statusText}`;
      showToast('success', message, correlationId);
      setLastResult(JSON.stringify(recommendationsResult, null, 2));
    } catch (err) {
      showToast('error', error || 'Failed to generate recommendations');
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

        <button
          onClick={handleClassifyFlights}
          disabled={loading}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: loading ? '#94a3b8' : '#06b6d4',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: '500',
            fontSize: '0.875rem',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => {
            if (!loading) (e.target as HTMLButtonElement).style.backgroundColor = '#0891b2';
          }}
          onMouseLeave={(e) => {
            if (!loading) (e.target as HTMLButtonElement).style.backgroundColor = '#06b6d4';
          }}
        >
          {loading ? 'Loading...' : 'Classify Flights'}
        </button>

        <button
          onClick={handleGenerateRecommendations}
          disabled={loading}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: loading ? '#94a3b8' : '#ec4899',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: '500',
            fontSize: '0.875rem',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => {
            if (!loading) (e.target as HTMLButtonElement).style.backgroundColor = '#db2777';
          }}
          onMouseLeave={(e) => {
            if (!loading) (e.target as HTMLButtonElement).style.backgroundColor = '#ec4899';
          }}
        >
          {loading ? 'Loading...' : 'Generate AI Recommendations'}
        </button>
      </div>

      {showRecommendations && recommendations.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: '600' }}>
              AI Reschedule Recommendations
            </h3>
            <button
              onClick={() => setShowRecommendations(false)}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              Clear
            </button>
          </div>

          {recommendationsMetadata && (
            <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f3f4f6', borderRadius: '0.375rem' }}>
              <div style={{ fontSize: '0.875rem', color: '#4b5563' }}>
                <p style={{ margin: '0.25rem 0' }}>
                  <strong>Flight ID:</strong> {recommendationsMetadata.flightId}
                </p>
                <p style={{ margin: '0.25rem 0' }}>
                  <strong>Generated:</strong> {new Date(recommendationsMetadata.generatedAt).toLocaleString()}
                </p>
                <p style={{ margin: '0.25rem 0' }}>
                  <strong>Processing Time:</strong> {recommendationsMetadata.elapsedMs}ms
                </p>
                <p style={{ margin: '0.25rem 0' }}>
                  <strong>AI Status:</strong>{' '}
                  {recommendationsMetadata.aiUnavailable ? (
                    <span style={{ color: '#f59e0b' }}>
                      AI ranking unavailable ({recommendationsMetadata.fallbackReason})
                    </span>
                  ) : (
                    <span style={{ color: '#10b981' }}>AI ranking available</span>
                  )}
                </p>
              </div>
            </div>
          )}

          <div>
            {recommendations.map((rec: any) => (
              <RescheduleRecommendationCard
                key={rec.candidateIndex}
                recommendation={rec}
                isFallback={recommendationsMetadata?.aiUnavailable}
              />
            ))}
          </div>
        </div>
      )}

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
