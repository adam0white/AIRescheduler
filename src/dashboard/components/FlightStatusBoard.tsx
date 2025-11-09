/**
 * FlightStatusBoard Component
 * Displays flights with weather status badges and detailed checkpoint information
 */

import { useState, useEffect } from 'react';
import { useRpc } from '../hooks/useRpc';
import { WeatherTimeline } from './WeatherTimeline';

interface Flight {
  id: number;
  studentName: string;
  instructorName: string;
  aircraftRegistration: string;
  departureTime: string;
  arrivalTime: string;
  departureAirport: string;
  arrivalAirport: string;
  status: string;
  weatherStatus: 'clear' | 'advisory' | 'auto-reschedule' | 'unknown';
}

interface CheckpointBreach {
  checkpointType: 'departure' | 'arrival' | 'corridor';
  location: string;
  breaches: {
    wind?: boolean;
    visibility?: boolean;
    ceiling?: boolean;
  };
  conditions: {
    windSpeed: number;
    visibility: number;
    ceiling: number | null;
  };
  thresholds: {
    maxWind: number;
    minVisibility: number;
    minCeiling: number;
  };
}

interface ClassificationResult {
  flightId: number;
  weatherStatus: string;
  reason: string;
  breachedCheckpoints: CheckpointBreach[];
  hoursUntilDeparture: number;
}

export function FlightStatusBoard() {
  const { call } = useRpc();
  const [flights, setFlights] = useState<Flight[]>([]);
  const [classifications, setClassifications] = useState<Map<number, ClassificationResult>>(
    new Map()
  );
  const [expandedFlight, setExpandedFlight] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const loadFlights = async () => {
    setLoading(true);
    try {
      const { result: flightResult } = await call('listFlights', {});
      setFlights(flightResult.flights || []);

      // Load classification details for flights with weather status
      if (flightResult.flights && flightResult.flights.length > 0) {
        const flightIds = flightResult.flights.map((f: Flight) => f.id);
        const { result: classResult } = await call('classifyFlights', { flightIds });
        const classMap = new Map<number, ClassificationResult>();
        classResult.results.forEach((r: ClassificationResult) => {
          classMap.set(r.flightId, r);
        });
        setClassifications(classMap);
      }
    } catch (err) {
      console.error('Failed to load flights:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFlights();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'clear':
        return { bg: '#10b981', text: 'Clear' };
      case 'advisory':
        return { bg: '#f59e0b', text: 'Advisory' };
      case 'auto-reschedule':
        return { bg: '#ef4444', text: 'Auto-Reschedule' };
      case 'unknown':
      default:
        return { bg: '#6b7280', text: 'Unknown' };
    }
  };

  const formatDateTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const toggleExpand = (flightId: number) => {
    setExpandedFlight(expandedFlight === flightId ? null : flightId);
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading flights...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
        }}
      >
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>
          Flight Status Board
        </h2>
        <button
          onClick={loadFlights}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontSize: '0.875rem',
          }}
        >
          Refresh
        </button>
      </div>

      {flights.length === 0 ? (
        <div
          style={{
            padding: '3rem',
            textAlign: 'center',
            backgroundColor: '#1f2937',
            borderRadius: '0.5rem',
          }}
        >
          <p style={{ fontSize: '1.125rem', color: '#9ca3af' }}>
            No flights scheduled. Click "Seed Demo Data" to add sample flights.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {flights.map((flight) => {
            const classification = classifications.get(flight.id);
            const statusColor = getStatusColor(flight.weatherStatus);
            const isExpanded = expandedFlight === flight.id;

            return (
              <div
                key={flight.id}
                style={{
                  backgroundColor: '#1f2937',
                  borderRadius: '0.5rem',
                  padding: '1.5rem',
                  border: '1px solid #374151',
                }}
              >
                {/* Flight Header */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '1rem',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <h3 style={{ fontSize: '1.125rem', fontWeight: '600', margin: 0 }}>
                        Flight #{flight.id}
                      </h3>
                      <span
                        style={{
                          padding: '0.25rem 0.75rem',
                          backgroundColor: statusColor.bg,
                          color: 'white',
                          borderRadius: '0.25rem',
                          fontSize: '0.75rem',
                          fontWeight: '500',
                        }}
                      >
                        {statusColor.text}
                      </span>
                    </div>
                    <p style={{ margin: '0.5rem 0', color: '#9ca3af', fontSize: '0.875rem' }}>
                      {flight.studentName} with {flight.instructorName} • {flight.aircraftRegistration}
                    </p>
                  </div>

                  {classification && (
                    <button
                      onClick={() => toggleExpand(flight.id)}
                      style={{
                        padding: '0.5rem 1rem',
                        backgroundColor: '#374151',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.375rem',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                      }}
                    >
                      {isExpanded ? 'Hide Details' : 'Show Details'}
                    </button>
                  )}
                </div>

                {/* Flight Info */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '1rem',
                    marginBottom: '1rem',
                  }}
                >
                  <div>
                    <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0 }}>
                      Departure
                    </p>
                    <p style={{ fontSize: '0.875rem', fontWeight: '500', margin: '0.25rem 0' }}>
                      {flight.departureAirport}
                    </p>
                    <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>
                      {formatDateTime(flight.departureTime)}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0 }}>Arrival</p>
                    <p style={{ fontSize: '0.875rem', fontWeight: '500', margin: '0.25rem 0' }}>
                      {flight.arrivalAirport}
                    </p>
                    <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>
                      {formatDateTime(flight.arrivalTime)}
                    </p>
                  </div>
                  {classification && (
                    <div>
                      <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0 }}>
                        Time to Departure
                      </p>
                      <p style={{ fontSize: '0.875rem', fontWeight: '500', margin: '0.25rem 0' }}>
                        {Math.round(classification.hoursUntilDeparture)}h
                      </p>
                      <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>
                        {classification.hoursUntilDeparture < 72 ? '<72h window' : '≥72h window'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Classification Reason */}
                {classification && (
                  <div
                    style={{
                      padding: '0.75rem',
                      backgroundColor: '#111827',
                      borderRadius: '0.375rem',
                      marginBottom: isExpanded ? '1rem' : 0,
                    }}
                  >
                    <p style={{ fontSize: '0.875rem', margin: 0, color: '#d1d5db' }}>
                      {classification.reason}
                    </p>
                  </div>
                )}

                {/* Expanded Checkpoint Details */}
                {isExpanded && classification && classification.breachedCheckpoints.length > 0 && (
                  <div
                    style={{
                      marginTop: '1rem',
                      padding: '1rem',
                      backgroundColor: '#111827',
                      borderRadius: '0.375rem',
                    }}
                  >
                    <h4 style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.75rem' }}>
                      Breached Checkpoints:
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {classification.breachedCheckpoints.map((checkpoint, idx) => (
                        <div
                          key={idx}
                          style={{
                            padding: '0.75rem',
                            backgroundColor: '#1f2937',
                            borderRadius: '0.375rem',
                            borderLeft: '3px solid #ef4444',
                          }}
                        >
                          <p
                            style={{
                              fontSize: '0.875rem',
                              fontWeight: '600',
                              margin: '0 0 0.5rem 0',
                              textTransform: 'capitalize',
                            }}
                          >
                            {checkpoint.checkpointType} ({checkpoint.location})
                          </p>
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(3, 1fr)',
                              gap: '0.5rem',
                              fontSize: '0.75rem',
                            }}
                          >
                            <div>
                              <p style={{ color: '#6b7280', margin: 0 }}>Wind Speed</p>
                              <p
                                style={{
                                  margin: '0.25rem 0 0 0',
                                  color: checkpoint.breaches.wind ? '#ef4444' : '#10b981',
                                }}
                              >
                                {checkpoint.conditions.windSpeed} kt (max: {checkpoint.thresholds.maxWind})
                              </p>
                            </div>
                            <div>
                              <p style={{ color: '#6b7280', margin: 0 }}>Visibility</p>
                              <p
                                style={{
                                  margin: '0.25rem 0 0 0',
                                  color: checkpoint.breaches.visibility ? '#ef4444' : '#10b981',
                                }}
                              >
                                {checkpoint.conditions.visibility} mi (min: {checkpoint.thresholds.minVisibility})
                              </p>
                            </div>
                            <div>
                              <p style={{ color: '#6b7280', margin: 0 }}>Ceiling</p>
                              <p
                                style={{
                                  margin: '0.25rem 0 0 0',
                                  color: checkpoint.breaches.ceiling ? '#ef4444' : '#10b981',
                                }}
                              >
                                {checkpoint.conditions.ceiling === null
                                  ? 'Unlimited'
                                  : `${checkpoint.conditions.ceiling} ft`}{' '}
                                (min: {checkpoint.thresholds.minCeiling})
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Weather Timeline */}
                {isExpanded && classification && (
                  <div style={{ marginTop: '1rem' }}>
                    <WeatherTimeline
                      flightId={flight.id}
                      departureTime={flight.departureTime}
                      arrivalTime={flight.arrivalTime}
                      thresholds={
                        classification.breachedCheckpoints.length > 0 &&
                        classification.breachedCheckpoints[0]
                          ? classification.breachedCheckpoints[0].thresholds
                          : undefined
                      }
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
