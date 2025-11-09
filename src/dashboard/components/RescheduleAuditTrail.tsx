/**
 * RescheduleAuditTrail Component
 * Displays complete audit trail of all reschedule actions for a flight
 * Shows timeline with decision history, AI rationale, and weather context
 */

import { useState, useEffect } from 'react';

interface RescheduleAuditEntry {
  actionId: number;
  originalFlightId: number;
  newFlightId: number | null;
  originalTime: string;
  newTime: string | null;
  actionType: 'auto-accept' | 'manual-accept' | 'manual-reject';
  decisionSource: 'system' | 'manager';
  decisionBy: string;
  decidedAt: string;
  aiConfidence: number | null;
  aiRationale: string | null;
  managerNotes: string | null;
  weatherSnapshot: {
    windSpeed: number;
    visibility: number;
    ceiling: number | null;
    conditions: string;
    confidenceHorizon: number;
  } | null;
  status: 'pending' | 'accepted' | 'rejected';
}

interface RescheduleAuditTrailProps {
  flightId: number;
  onClose: () => void;
}

export function RescheduleAuditTrail({ flightId, onClose }: RescheduleAuditTrailProps) {
  const [auditEntries, setAuditEntries] = useState<RescheduleAuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedEntry, setExpandedEntry] = useState<number | null>(null);

  useEffect(() => {
    fetchAuditTrail();
  }, [flightId]);

  const fetchAuditTrail = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/rpc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          method: 'getFlightRescheduleHistory',
          params: { flightId },
        }),
      });

      const data = await response.json() as { result: RescheduleAuditEntry[]; error?: string };

      if (data.error) {
        throw new Error(data.error);
      }

      setAuditEntries(data.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit trail');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDateTime = (isoString: string): string => {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatTimeChange = (originalTime: string, newTime: string | null): string => {
    const origDate = new Date(originalTime);
    const origStr = origDate.toLocaleString('en-US', {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

    if (!newTime) {
      return `${origStr} → REJECTED`;
    }

    const newDate = new Date(newTime);
    const newStr = newDate.toLocaleString('en-US', {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

    return `${origStr} → ${newStr}`;
  };

  const getActionTypeIcon = (actionType: string) => {
    switch (actionType) {
      case 'manual-accept':
        return { icon: '✓', color: 'text-green-600', bgColor: 'bg-green-100' };
      case 'manual-reject':
        return { icon: '✗', color: 'text-red-600', bgColor: 'bg-red-100' };
      case 'auto-accept':
        return { icon: '⚙', color: 'text-blue-600', bgColor: 'bg-blue-100' };
      default:
        return { icon: '?', color: 'text-gray-600', bgColor: 'bg-gray-100' };
    }
  };

  const getActionLabel = (actionType: string, decisionSource: string): string => {
    if (actionType === 'auto-accept') {
      return 'Auto-Rescheduled by System';
    } else if (actionType === 'manual-accept') {
      return `Manual Accept by ${decisionSource === 'manager' ? 'Manager' : 'System'}`;
    } else if (actionType === 'manual-reject') {
      return `Rejected by ${decisionSource === 'manager' ? 'Manager' : 'System'}`;
    }
    return 'Unknown Action';
  };

  const copyToClipboard = () => {
    const json = JSON.stringify(auditEntries, null, 2);
    navigator.clipboard.writeText(json);
    alert('Audit trail copied to clipboard');
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
          onClick={onClose}
        ></div>

        {/* Center modal */}
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>

        <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl sm:w-full sm:p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Reschedule History - Flight #{flightId}
            </h3>
            <div className="flex gap-2">
              <button
                onClick={copyToClipboard}
                className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Copy JSON
              </button>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-500 focus:outline-none"
              >
                <span className="text-2xl">×</span>
              </button>
            </div>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="flex justify-center items-center py-12">
              <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex">
                <div className="text-red-600 text-sm">
                  <strong>Error:</strong> {error}
                </div>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !error && auditEntries.length === 0 && (
            <div className="text-center py-12">
              <div className="text-gray-400 text-lg mb-2">No reschedule history</div>
              <div className="text-gray-500 text-sm">This flight has not been rescheduled yet.</div>
            </div>
          )}

          {/* Timeline */}
          {!isLoading && !error && auditEntries.length > 0 && (
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              {auditEntries.map((entry, index) => {
                const actionStyle = getActionTypeIcon(entry.actionType);
                const isExpanded = expandedEntry === entry.actionId;

                return (
                  <div
                    key={entry.actionId}
                    className="relative bg-gray-50 rounded-lg p-4 border border-gray-200"
                  >
                    {/* Timeline connector line (except for last item) */}
                    {index < auditEntries.length - 1 && (
                      <div className="absolute left-8 top-12 bottom-0 w-0.5 bg-gray-300 -mb-4"></div>
                    )}

                    {/* Action Icon */}
                    <div className="flex items-start gap-4">
                      <div className={`flex-shrink-0 w-12 h-12 rounded-full ${actionStyle.bgColor} flex items-center justify-center relative z-10`}>
                        <span className={`text-xl ${actionStyle.color}`}>{actionStyle.icon}</span>
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Action Header */}
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <div className="text-sm font-semibold text-gray-900">
                              {getActionLabel(entry.actionType, entry.decisionSource)}
                            </div>
                            <div className="text-xs text-gray-500">
                              {formatDateTime(entry.decidedAt)}
                            </div>
                          </div>

                          {entry.status === 'pending' && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                              Pending Review
                            </span>
                          )}
                        </div>

                        {/* Time Change */}
                        <div className="text-sm font-medium text-gray-700 mb-2">
                          {formatTimeChange(entry.originalTime, entry.newTime)}
                        </div>

                        {/* Decision By */}
                        <div className="text-xs text-gray-600 mb-2">
                          <span className="font-medium">Decision by:</span> {entry.decisionBy}
                        </div>

                        {/* AI Confidence */}
                        {entry.aiConfidence !== null && (
                          <div className="text-xs text-gray-600 mb-2">
                            <span className="font-medium">AI Confidence:</span>{' '}
                            <span className={`font-semibold ${
                              entry.aiConfidence >= 80 ? 'text-green-600' :
                              entry.aiConfidence >= 60 ? 'text-yellow-600' : 'text-red-600'
                            }`}>
                              {entry.aiConfidence}%
                            </span>
                          </div>
                        )}

                        {/* Manager Notes / Rationale */}
                        {entry.managerNotes && (
                          <div className="text-sm text-gray-800 italic bg-white p-3 rounded border border-gray-200 mb-2">
                            <span className="font-medium not-italic">Notes:</span> {entry.managerNotes}
                          </div>
                        )}

                        {/* Weather Context */}
                        {entry.weatherSnapshot && (
                          <div className="text-xs text-gray-600 bg-white p-2 rounded border border-gray-200 mb-2">
                            <div className="font-medium mb-1">Weather Context:</div>
                            <div className="space-y-0.5">
                              <div>Wind: {entry.weatherSnapshot.windSpeed} kts</div>
                              <div>Visibility: {entry.weatherSnapshot.visibility} SM</div>
                              <div>
                                Ceiling: {entry.weatherSnapshot.ceiling ? `${entry.weatherSnapshot.ceiling} ft` : 'Unlimited'}
                              </div>
                              <div>Conditions: {entry.weatherSnapshot.conditions}</div>
                            </div>
                          </div>
                        )}

                        {/* Expand/Collapse AI Rationale */}
                        {entry.aiRationale && (
                          <div className="mt-2">
                            <button
                              onClick={() => setExpandedEntry(isExpanded ? null : entry.actionId)}
                              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                            >
                              {isExpanded ? '▼ Hide' : '▶ Show'} Full AI Rationale
                            </button>

                            {isExpanded && (
                              <pre className="mt-2 text-xs bg-gray-900 text-green-400 p-3 rounded overflow-x-auto">
                                {JSON.stringify(JSON.parse(entry.aiRationale), null, 2)}
                              </pre>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Close Button */}
          <div className="mt-6">
            <button
              onClick={onClose}
              className="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:text-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
