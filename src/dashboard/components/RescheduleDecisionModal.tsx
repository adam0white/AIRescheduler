/**
 * RescheduleDecisionModal Component
 * Modal for confirming accept/reject decisions on AI recommendations
 */

import { useState } from 'react';

interface CandidateSlot {
  slotIndex: number;
  instructorId: number;
  instructorName: string;
  aircraftId: number;
  aircraftRegistration: string;
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  confidence: number;
}

interface RescheduleRecommendation {
  candidateIndex: number;
  aiRank: number;
  aiConfidence: number;
  rationale: string;
  originalCandidate: CandidateSlot;
}

interface RescheduleDecisionModalProps {
  isOpen: boolean;
  decision: 'accept' | 'reject';
  recommendation: RescheduleRecommendation;
  allRecommendations: RescheduleRecommendation[];
  onConfirm: (notes: string) => void;
  onCancel: () => void;
  isLoading: boolean;
}

export function RescheduleDecisionModal({
  isOpen,
  decision,
  recommendation,
  allRecommendations,
  onConfirm,
  onCancel,
  isLoading,
}: RescheduleDecisionModalProps) {
  const [notes, setNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [customReason, setCustomReason] = useState('');

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (decision === 'reject') {
      const finalNotes = rejectionReason === 'Other (specify)'
        ? customReason
        : rejectionReason + (customReason ? `: ${customReason}` : '');

      if (!finalNotes.trim()) {
        alert('Please provide a rejection reason');
        return;
      }
      onConfirm(finalNotes);
    } else {
      onConfirm(notes);
    }
  };

  // Format time
  const departureDate = new Date(recommendation.originalCandidate.departureTime);
  const timeStr = departureDate.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
          onClick={onCancel}
        ></div>

        {/* Center modal */}
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>

        <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
          <div>
            {/* Icon */}
            <div className={`mx-auto flex items-center justify-center h-12 w-12 rounded-full ${
              decision === 'accept' ? 'bg-green-100' : 'bg-red-100'
            }`}>
              <span className={`text-2xl ${
                decision === 'accept' ? 'text-green-600' : 'text-red-600'
              }`}>
                {decision === 'accept' ? '✓' : '✗'}
              </span>
            </div>

            {/* Title */}
            <div className="mt-3 text-center sm:mt-5">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                {decision === 'accept' ? 'Confirm Reschedule' : 'Reject Reschedule'}
              </h3>

              <div className="mt-2">
                <p className="text-sm text-gray-500">
                  {decision === 'accept'
                    ? 'Are you sure you want to reschedule this flight?'
                    : 'Are you sure you want to reject this recommendation?'}
                </p>
              </div>
            </div>

            {/* Slot Details (for accept) */}
            {decision === 'accept' && (
              <div className="mt-4 bg-gray-50 rounded-lg p-4">
                <div className="text-sm font-semibold text-gray-700 mb-2">New Flight Details:</div>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-gray-600">Time:</span>
                    <span className="ml-2 font-medium">{timeStr}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Instructor:</span>
                    <span className="ml-2 font-medium">{recommendation.originalCandidate.instructorName}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Aircraft:</span>
                    <span className="ml-2 font-medium">{recommendation.originalCandidate.aircraftRegistration}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">AI Confidence:</span>
                    <span className="ml-2 font-medium">{recommendation.aiConfidence}%</span>
                  </div>
                </div>
              </div>
            )}

            {/* Rejected Recommendations (for reject) */}
            {decision === 'reject' && allRecommendations.length > 0 && (
              <div className="mt-4 bg-gray-50 rounded-lg p-4">
                <div className="text-sm font-semibold text-gray-700 mb-2">Rejected Options:</div>
                <div className="space-y-1 text-sm">
                  {allRecommendations.slice(0, 3).map((rec, idx) => (
                    <div key={idx} className="text-gray-600">
                      {idx + 1}. {rec.originalCandidate.instructorName} / {rec.originalCandidate.aircraftRegistration}
                      ({rec.aiConfidence}%)
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes field (for accept) */}
            {decision === 'accept' && (
              <div className="mt-4">
                <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                  Notes (optional)
                </label>
                <textarea
                  id="notes"
                  rows={3}
                  className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                  placeholder="e.g., Confirmed with instructor, student notified via email..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            )}

            {/* Rejection reason (for reject) */}
            {decision === 'reject' && (
              <div className="mt-4 space-y-3">
                <div>
                  <label htmlFor="reason" className="block text-sm font-medium text-gray-700 mb-1">
                    Rejection Reason <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="reason"
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm rounded-md border"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    disabled={isLoading}
                  >
                    <option value="">Select a reason...</option>
                    <option value="Student unavailable">Student unavailable</option>
                    <option value="Instructor unavailable">Instructor unavailable</option>
                    <option value="Aircraft issue">Aircraft issue</option>
                    <option value="Schedule conflict">Schedule conflict</option>
                    <option value="Other (specify)">Other (specify)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="details" className="block text-sm font-medium text-gray-700 mb-1">
                    Additional Details {rejectionReason === 'Other (specify)' && <span className="text-red-500">*</span>}
                  </label>
                  <textarea
                    id="details"
                    rows={3}
                    className="shadow-sm focus:ring-red-500 focus:border-red-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                    placeholder="Provide more details about the rejection..."
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="mt-5 sm:mt-6 sm:grid sm:grid-cols-2 sm:gap-3 sm:grid-flow-row-dense">
            <button
              type="button"
              disabled={isLoading}
              className={`w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 text-base font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 sm:col-start-2 sm:text-sm ${
                decision === 'accept'
                  ? 'bg-green-600 hover:bg-green-700 focus:ring-green-500'
                  : 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
              } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={handleConfirm}
            >
              {isLoading ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </span>
              ) : (
                decision === 'accept' ? 'Confirm Accept' : 'Confirm Rejection'
              )}
            </button>
            <button
              type="button"
              disabled={isLoading}
              className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:col-start-1 sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
