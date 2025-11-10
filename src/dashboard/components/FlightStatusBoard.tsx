/**
 * FlightStatusBoard Component
 * Displays flights with weather status badges and detailed checkpoint information
 */

import { CSSProperties, Fragment, useEffect, useMemo, useState } from 'react';
import { useRpc } from '../hooks/useRpc';
import { WeatherTimeline } from './WeatherTimeline';

type WeatherStatus = 'clear' | 'advisory' | 'auto-reschedule' | 'unknown';

const STATUS_ORDER: WeatherStatus[] = ['auto-reschedule', 'advisory', 'unknown', 'clear'];

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
  weatherStatus: WeatherStatus;
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
  const [statusFilter, setStatusFilter] = useState<'all' | WeatherStatus>('all');
  const [departureWindow, setDepartureWindow] = useState<'all' | 'imminent' | 'upcoming' | 'later'>(
    'all'
  );
  const [showOnlyActionable, setShowOnlyActionable] = useState(false);

  const loadFlights = async () => {
    setLoading(true);
    try {
      const { result: flightResult } = await call('listFlights', {});
      const flightList: Flight[] = flightResult.flights || [];

      setFlights(flightList);

      // Load classification details for flights with weather status
      if (flightList.length > 0) {
        const flightIds = flightList.map((f: Flight) => f.id);
        const { result: classResult } = await call('classifyFlights', { flightIds });
        const classMap = new Map<number, ClassificationResult>();
        classResult.results.forEach((r: ClassificationResult) => {
          classMap.set(r.flightId, r);
        });
        setClassifications(classMap);

        const enrichedFlights = flightList.map((flight) => {
          const classification = classMap.get(flight.id);
          if (!classification) {
            return flight;
          }
          return {
            ...flight,
            weatherStatus: classification.weatherStatus as WeatherStatus,
          };
        });
        setFlights(enrichedFlights);
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

  const statusVisuals = useMemo(
    () => ({
      clear: {
        bg: 'rgba(16, 185, 129, 0.18)',
        badge: '#10b981',
        text: 'Clear',
        border: '1px solid rgba(16, 185, 129, 0.45)',
      },
      advisory: {
        bg: 'rgba(245, 158, 11, 0.14)',
        badge: '#f59e0b',
        text: 'Advisory',
        border: '1px solid rgba(245, 158, 11, 0.45)',
      },
      'auto-reschedule': {
        bg: 'rgba(239, 68, 68, 0.14)',
        badge: '#ef4444',
        text: 'Auto-Reschedule',
        border: '1px solid rgba(239, 68, 68, 0.45)',
      },
      unknown: {
        bg: 'rgba(148, 163, 184, 0.16)',
        badge: '#64748b',
        text: 'Unknown',
        border: '1px solid rgba(148, 163, 184, 0.35)',
      },
    }),
    []
  );

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

  const getHoursUntilDeparture = (flight: Flight, classification?: ClassificationResult) => {
    if (classification) {
      return classification.hoursUntilDeparture;
    }
    const diffMs = new Date(flight.departureTime).getTime() - Date.now();
    return diffMs / (1000 * 60 * 60);
  };

  const filteredFlights = useMemo(() => {
    return flights.filter((flight) => {
      const classification = classifications.get(flight.id);
      const hoursUntilDeparture = Math.max(0, getHoursUntilDeparture(flight, classification));

      if (statusFilter !== 'all' && flight.weatherStatus !== statusFilter) {
        return false;
      }

      if (showOnlyActionable && flight.weatherStatus === 'clear') {
        return false;
      }

      if (departureWindow !== 'all') {
        const windowMatches =
          (departureWindow === 'imminent' && hoursUntilDeparture < 24) ||
          (departureWindow === 'upcoming' && hoursUntilDeparture >= 24 && hoursUntilDeparture < 72) ||
          (departureWindow === 'later' && hoursUntilDeparture >= 72);

        if (!windowMatches) {
          return false;
        }
      }

      return true;
    });
  }, [classifications, departureWindow, flights, showOnlyActionable, statusFilter]);

  const groupedFlights = useMemo(() => {
    const bucket = new Map<WeatherStatus, Flight[]>();
    STATUS_ORDER.forEach((status) => bucket.set(status, []));

    filteredFlights.forEach((flight) => {
      const existing = bucket.get(flight.weatherStatus);
      if (existing) {
        existing.push(flight);
      }
    });

    STATUS_ORDER.forEach((status) => {
      const arr = bucket.get(status);
      if (arr) {
        arr.sort((a, b) => {
          const aClassification = classifications.get(a.id);
          const bClassification = classifications.get(b.id);
          const aHours = getHoursUntilDeparture(a, aClassification);
          const bHours = getHoursUntilDeparture(b, bClassification);
          return aHours - bHours;
        });
      }
    });

    return STATUS_ORDER
      .map((status) => ({
        status,
        flights: bucket.get(status) || [],
      }))
      .filter((group) => group.flights.length > 0);
  }, [classifications, filteredFlights]);

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
          flexDirection: 'column',
          gap: '1.5rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <div>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Flight Status Board</h2>
            <p style={{ margin: '0.25rem 0 0 0', color: '#94a3b8', fontSize: '0.875rem' }}>
              Track classifications, weather risk, and upcoming departures.
            </p>
          </div>
          <button
            onClick={loadFlights}
            style={{
              padding: '0.6rem 1.1rem',
              background: 'linear-gradient(135deg, #2563eb 0%, #38bdf8 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 600,
              boxShadow: '0 10px 25px -12px rgba(37, 99, 235, 0.6)',
            }}
          >
            Refresh Data
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.75rem',
            padding: '1rem',
            borderRadius: '0.75rem',
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(148, 163, 184, 0.3)',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#94a3b8' }}>
              Status
            </span>
            {(['all', ...STATUS_ORDER] as const).map((statusKey) => {
              const isActive = statusFilter === statusKey;
              const label =
                statusKey === 'all'
                  ? 'All'
                  : statusVisuals[statusKey].text;
              return (
                <button
                  key={statusKey}
                  onClick={() => setStatusFilter(statusKey)}
                  style={{
                    padding: '0.35rem 0.8rem',
                    borderRadius: '9999px',
                    border: isActive ? '1px solid rgba(255,255,255,0.35)' : '1px solid rgba(148,163,184,0.3)',
                    backgroundColor: isActive
                      ? 'rgba(59, 130, 246, 0.25)'
                      : 'rgba(15, 23, 42, 0.35)',
                    color: '#e2e8f0',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    letterSpacing: '0.02em',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#94a3b8' }}>
              Departure Window
            </span>
            {(['all', 'imminent', 'upcoming', 'later'] as const).map((windowKey) => {
              const isActive = departureWindow === windowKey;
              const labelMap = {
                all: 'Any',
                imminent: '< 24h',
                upcoming: '24-72h',
                later: '> 72h',
              } as const;
              return (
                <button
                  key={windowKey}
                  onClick={() => setDepartureWindow(windowKey)}
                  style={{
                    padding: '0.35rem 0.8rem',
                    borderRadius: '0.5rem',
                    border: isActive ? '1px solid rgba(59,130,246,0.45)' : '1px solid rgba(148,163,184,0.25)',
                    backgroundColor: isActive ? 'rgba(59, 130, 246, 0.18)' : 'rgba(15, 23, 42, 0.35)',
                    color: '#e2e8f0',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {labelMap[windowKey]}
                </button>
              );
            })}
          </div>

          <label
            style={{
              marginLeft: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.75rem',
              color: '#cbd5f5',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={showOnlyActionable}
              onChange={(event) => setShowOnlyActionable(event.target.checked)}
              style={{
                width: '16px',
                height: '16px',
                accentColor: '#3b82f6',
              }}
            />
            Focus on action needed
          </label>
        </div>

        {flights.length === 0 ? (
          <div
            style={{
              padding: '3rem',
              textAlign: 'center',
              backgroundColor: '#111827',
              borderRadius: '0.75rem',
              border: '1px dashed rgba(148, 163, 184, 0.4)',
            }}
          >
            <p style={{ fontSize: '1.125rem', color: '#9ca3af' }}>
              No flights scheduled. Trigger `Seed Demo Data` to populate the board.
            </p>
          </div>
        ) : groupedFlights.length === 0 ? (
          <div
            style={{
              padding: '2.5rem',
              borderRadius: '0.75rem',
              backgroundColor: 'rgba(15, 23, 42, 0.75)',
              border: '1px solid rgba(59, 130, 246, 0.35)',
              textAlign: 'center',
              color: '#cbd5f5',
            }}
          >
            <p style={{ margin: 0, fontSize: '0.95rem' }}>
              Nothing matches the current filters—loosen them to see more flights.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {groupedFlights.map(({ status, flights: statusFlights }) => {
              const visuals = statusVisuals[status];
              return (
                <div key={status} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div
                      style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '9999px',
                        backgroundColor: visuals.badge,
                        filter: 'drop-shadow(0 0 6px rgba(59, 130, 246, 0.45))',
                      }}
                    />
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
                      {visuals.text} <span style={{ color: '#64748b' }}>({statusFlights.length})</span>
                    </h3>
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gap: '1rem',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                    }}
                  >
                    {statusFlights.map((flight) => {
                      const classification = classifications.get(flight.id);
                      const hoursUntilDeparture = getHoursUntilDeparture(flight, classification);
                      const roundedHours = Math.max(0, Math.round(hoursUntilDeparture));
                      const isExpanded = expandedFlight === flight.id;
                      const primaryThresholds =
                        classification?.breachedCheckpoints?.[0]?.thresholds;

                      const cardStyles: CSSProperties = {
                        background: `linear-gradient(165deg, rgba(15, 23, 42, 0.95) 0%, rgba(15, 23, 42, 0.75) 65%, ${visuals.bg} 100%)`,
                        borderRadius: '0.75rem',
                        padding: '1.25rem',
                        border: visuals.border,
                        boxShadow: '0 20px 45px -30px rgba(15, 23, 42, 0.8)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1rem',
                      };

                      if (isExpanded) {
                        cardStyles.gridColumn = '1 / -1';
                      }

                      return (
                        <div
                          key={flight.id}
                          style={cardStyles}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
                                  Flight #{flight.id}
                                </h4>
                                <span
                                  style={{
                                    padding: '0.2rem 0.65rem',
                                    borderRadius: '9999px',
                                    fontSize: '0.7rem',
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.08em',
                                    backgroundColor: visuals.badge,
                                    color: '#0f172a',
                                  }}
                                >
                                  {visuals.text}
                                </span>
                              </div>
                              <p style={{ margin: '0.4rem 0 0 0', color: '#cbd5f5', fontSize: '0.85rem' }}>
                                {flight.studentName} with {flight.instructorName} • {flight.aircraftRegistration}
                              </p>
                            </div>
                            {classification && (
                              <button
                                onClick={() => toggleExpand(flight.id)}
                                style={{
                                  alignSelf: 'flex-start',
                                  padding: '0.45rem 0.75rem',
                                  borderRadius: '0.5rem',
                                  border: '1px solid rgba(148, 163, 184, 0.35)',
                                  backgroundColor: 'rgba(15, 23, 42, 0.45)',
                                  color: '#e2e8f0',
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                {isExpanded ? 'Collapse' : 'Expand'}
                              </button>
                            )}
                          </div>

                          <div
                            style={{
                              display: 'grid',
                              gap: '0.75rem',
                              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                              fontSize: '0.8rem',
                            }}
                          >
                            <div>
                              <span style={{ color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                Departure
                              </span>
                              <div style={{ fontSize: '0.9rem', fontWeight: 600, marginTop: '0.25rem' }}>
                                {flight.departureAirport}
                              </div>
                              <div style={{ color: '#94a3b8', marginTop: '0.15rem' }}>
                                {formatDateTime(flight.departureTime)}
                              </div>
                            </div>
                            <div>
                              <span style={{ color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                Arrival
                              </span>
                              <div style={{ fontSize: '0.9rem', fontWeight: 600, marginTop: '0.25rem' }}>
                                {flight.arrivalAirport}
                              </div>
                              <div style={{ color: '#94a3b8', marginTop: '0.15rem' }}>
                                {formatDateTime(flight.arrivalTime)}
                              </div>
                            </div>
                            <div>
                              <span style={{ color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                Countdown
                              </span>
                              <div style={{ fontSize: '0.9rem', fontWeight: 600, marginTop: '0.25rem' }}>
                                {roundedHours}h
                              </div>
                              <div style={{ color: '#94a3b8', marginTop: '0.15rem' }}>
                                {hoursUntilDeparture < 72
                                  ? '<72h window'
                                  : '≥72h window'}
                              </div>
                            </div>
                          </div>

                          {classification && (
                            <div
                              style={{
                                padding: '0.75rem',
                                borderRadius: '0.65rem',
                                backgroundColor: 'rgba(15, 23, 42, 0.6)',
                                border: '1px solid rgba(148, 163, 184, 0.25)',
                                color: '#e2e8f0',
                                fontSize: '0.85rem',
                              }}
                            >
                              {classification.reason}
                            </div>
                          )}

                          {isExpanded && classification && classification.breachedCheckpoints.length > 0 && (
                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.75rem',
                                borderTop: '1px solid rgba(148, 163, 184, 0.2)',
                                paddingTop: '0.75rem',
                              }}
                            >
                              <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>
                                Breached Checkpoints
                              </div>
                              {classification.breachedCheckpoints.map((checkpoint, idx) => (
                                <div
                                  key={idx}
                                  style={{
                                    padding: '0.75rem',
                                    borderRadius: '0.65rem',
                                    backgroundColor: 'rgba(15, 23, 42, 0.85)',
                                    border: '1px solid rgba(239, 68, 68, 0.4)',
                                  }}
                                >
                                  <div
                                    style={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      marginBottom: '0.5rem',
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontWeight: 600,
                                        fontSize: '0.85rem',
                                        textTransform: 'capitalize',
                                      }}
                                    >
                                      {checkpoint.checkpointType} • {checkpoint.location}
                                    </span>
                                    <span
                                      style={{
                                        fontSize: '0.7rem',
                                        color: '#f87171',
                                        letterSpacing: '0.08em',
                                        textTransform: 'uppercase',
                                      }}
                                    >
                                      Thresholds
                                    </span>
                                  </div>

                                  <div
                                    style={{
                                      display: 'grid',
                                      gap: '0.5rem',
                                      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                                      fontSize: '0.75rem',
                                    }}
                                  >
                                    <div>
                                      <p style={{ margin: 0, color: '#94a3b8' }}>Wind</p>
                                      <p
                                        style={{
                                          margin: '0.25rem 0 0 0',
                                          color: checkpoint.breaches.wind ? '#f87171' : '#34d399',
                                        }}
                                      >
                                        {checkpoint.conditions.windSpeed} kt
                                      </p>
                                      <p style={{ margin: 0, color: '#475569', fontSize: '0.7rem' }}>
                                        Max {checkpoint.thresholds.maxWind} kt
                                      </p>
                                    </div>
                                    <div>
                                      <p style={{ margin: 0, color: '#94a3b8' }}>Visibility</p>
                                      <p
                                        style={{
                                          margin: '0.25rem 0 0 0',
                                          color: checkpoint.breaches.visibility ? '#f87171' : '#34d399',
                                        }}
                                      >
                                        {checkpoint.conditions.visibility} mi
                                      </p>
                                      <p style={{ margin: 0, color: '#475569', fontSize: '0.7rem' }}>
                                        Min {checkpoint.thresholds.minVisibility} mi
                                      </p>
                                    </div>
                                    <div>
                                      <p style={{ margin: 0, color: '#94a3b8' }}>Ceiling</p>
                                      <p
                                        style={{
                                          margin: '0.25rem 0 0 0',
                                          color: checkpoint.breaches.ceiling ? '#f87171' : '#34d399',
                                        }}
                                      >
                                        {checkpoint.conditions.ceiling === null
                                          ? 'Unlimited'
                                          : `${checkpoint.conditions.ceiling} ft`}
                                      </p>
                                      <p style={{ margin: 0, color: '#475569', fontSize: '0.7rem' }}>
                                        Min {checkpoint.thresholds.minCeiling} ft
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {isExpanded && classification && (
                            <Fragment>
                              <div style={{ borderTop: '1px solid rgba(148, 163, 184, 0.25)' }} />
                              <WeatherTimeline
                                flightId={flight.id}
                                departureTime={flight.departureTime}
                                arrivalTime={flight.arrivalTime}
                                thresholds={primaryThresholds}
                              />
                            </Fragment>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
