/**
 * TestingControls Component
 * Provides manual testing controls for RPC methods
 */

import { CSSProperties, useMemo, useState } from 'react';
import { useRpc } from '../hooks/useRpc';
import { RescheduleRecommendationCard } from './RescheduleRecommendationCard';

interface ToastMessage {
  id: string;
  type: 'success' | 'error';
  message: string;
  correlationId?: string;
}

interface TestingControlsProps {
  layout?: 'standalone' | 'overlay';
  onClose?: () => void;
}

export function TestingControls({ layout = 'standalone', onClose }: TestingControlsProps) {
  const { call, loading, error } = useRpc();
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [recommendationsMetadata, setRecommendationsMetadata] = useState<any>(null);
  const [showRecommendations, setShowRecommendations] = useState(false);

  const containerStyles = useMemo<CSSProperties>(
    () => ({
      padding: layout === 'overlay' ? '1.5rem' : '2rem',
      width: '100%',
      maxWidth: layout === 'overlay' ? 'min(95vw, 1180px)' : '1200px',
      maxHeight: layout === 'overlay' ? '85vh' : undefined,
      overflowY: layout === 'overlay' ? 'auto' : undefined,
      overflowX: 'hidden',
      margin: layout === 'overlay' ? '0' : '0 auto',
      background:
        layout === 'overlay'
          ? 'linear-gradient(135deg, rgba(30, 64, 175, 0.12), rgba(12, 74, 110, 0.22))'
          : 'transparent',
      borderRadius: layout === 'overlay' ? '0.75rem' : undefined,
    }),
    [layout]
  );

  const headingStyles = useMemo<CSSProperties>(
    () => ({
      fontSize: '1.5rem',
      fontWeight: 'bold',
      marginBottom: '1rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '1rem',
    }),
    []
  );

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

  const getButtonStyles = (baseColor: string, disabledColor: string = '#94a3b8') => ({
    padding: '0.75rem 1.5rem',
    backgroundColor: loading ? disabledColor : baseColor,
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    cursor: loading ? 'not-allowed' : 'pointer',
    fontWeight: 500,
    fontSize: '0.875rem',
    transition: 'background-color 0.2s',
  });

  const steps = [
    {
      key: 'seed-data',
      title: 'Seed Demo Data',
      description: 'Start with a fresh scenario set so downstream automation has flights to work with.',
      optional: false,
      actions: [
        {
          key: 'seed-demo',
          label: loading ? 'Loading...' : 'Seed Demo Data',
          onClick: handleSeedDemoData,
          style: getButtonStyles('#3b82f6'),
        },
        {
          key: 'list-flights',
          label: loading ? 'Loading...' : 'List Flights',
          onClick: handleListFlights,
          style: getButtonStyles('#10b981'),
          secondary: true,
        },
      ],
    },
    {
      key: 'poll-weather',
      title: 'Poll Weather',
      description:
        'Fetch forecast data for every upcoming flight. Classification runs automatically after new snapshots are stored.',
      optional: false,
      actions: [
        {
          key: 'poll-weather-btn',
          label: loading ? 'Loading...' : 'Poll Weather',
          onClick: handleWeatherPoll,
          style: getButtonStyles('#f59e0b'),
        },
      ],
    },
    {
      key: 'classify',
      title: 'Classify Flights (optional rerun)',
      description:
        'If you tweak weather data or want to re-check results without polling again, run the classifier manually.',
      optional: true,
      actions: [
        {
          key: 'classify-flights-btn',
          label: loading ? 'Loading...' : 'Classify Flights',
          onClick: handleClassifyFlights,
          style: getButtonStyles('#06b6d4'),
        },
      ],
    },
    {
      key: 'auto-reschedule',
      title: 'Auto Reschedule',
      description:
        'Generate advisories and scheduling changes for flights flagged by classification. This mirrors the hourly cron step.',
      optional: false,
      actions: [
        {
          key: 'auto-reschedule-btn',
          label: loading ? 'Loading...' : 'Auto Reschedule',
          onClick: handleAutoReschedule,
          style: getButtonStyles('#8b5cf6'),
        },
      ],
    },
    {
      key: 'ai-recommendations',
      title: 'Generate AI Recommendations',
      description:
        'Dive into a single impacted flight to show AI-ranked slot suggestions and fallback logic.',
      optional: false,
      actions: [
        {
          key: 'generate-ai-btn',
          label: loading ? 'Loading...' : 'Generate AI Recommendations',
          onClick: handleGenerateRecommendations,
          style: getButtonStyles('#ec4899'),
        },
      ],
    },
  ];

  return (
    <div style={containerStyles}>
      <div style={headingStyles}>
        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>Testing Controls</h2>
        {layout === 'overlay' && (
          <button
            onClick={onClose}
            style={{
              padding: '0.35rem 0.9rem',
              borderRadius: '9999px',
              border: '1px solid rgba(226, 232, 240, 0.45)',
              backgroundColor: 'rgba(15, 23, 42, 0.35)',
              color: '#e2e8f0',
              fontSize: '0.75rem',
              letterSpacing: '0.04em',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        )}
      </div>

      <div
        style={{
          marginBottom: '2rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
        }}
      >
        <div
          style={{
            padding: '1rem',
            borderRadius: '0.75rem',
            backgroundColor: 'rgba(15, 118, 110, 0.08)',
            border: '1px solid rgba(45, 212, 191, 0.25)',
            color: '#0f172a',
            fontSize: '0.9rem',
            lineHeight: 1.4,
          }}
        >
          Follow the steps below when demoing. This mirrors the hourly cron:
          seed data → poll weather (auto-classifies) → auto reschedule → optional deep dive.
        </div>

        {steps.map((step, index) => (
          <div
            key={step.key}
            style={{
              display: 'flex',
              gap: '1rem',
              padding: '1.25rem',
              borderRadius: '0.75rem',
              backgroundColor: 'rgba(15, 23, 42, 0.4)',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
            }}
          >
            <div
              style={{
                width: '2.25rem',
                height: '2.25rem',
                borderRadius: '9999px',
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                color: '#1d4ed8',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {index + 1}
            </div>
            <div style={{ flex: '1 1 240px', minWidth: 0 }}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#e2e8f0' }}>
                  {step.title}
                </h3>
                {step.optional && (
                  <span
                    style={{
                      fontSize: '0.75rem',
                      letterSpacing: '0.04em',
                      padding: '0.125rem 0.5rem',
                      borderRadius: '9999px',
                      backgroundColor: 'rgba(148, 163, 184, 0.25)',
                      color: '#cbd5f5',
                      textTransform: 'uppercase',
                    }}
                  >
                    Optional
                  </span>
                )}
              </div>
              <p style={{ margin: '0.5rem 0 0 0', color: '#cbd5f5', fontSize: '0.9rem', lineHeight: 1.5 }}>
                {step.description}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {step.actions.map((action) => (
                <button
                  key={action.key}
                  onClick={action.onClick}
                  disabled={loading}
                  style={action.style}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {showRecommendations && recommendations.length > 0 && (
        <div style={{ marginBottom: '2rem', maxWidth: '100%', overflowX: 'hidden' }}>
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
