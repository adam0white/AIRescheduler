/**
 * RescheduleRecommendationCard Component
 * Displays a single AI-ranked reschedule recommendation with rationale and details
 * Includes Accept/Reject action buttons for manager decisions
 */

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
  constraints: {
    instructorAvailable: boolean;
    aircraftAvailable: boolean;
    certificationValid: boolean;
    withinTimeWindow: boolean;
    minimumSpacingMet: boolean;
  };
  notes?: string;
}

interface RescheduleRecommendation {
  candidateIndex: number;
  aiRank: number;
  aiConfidence: number;
  rationale: string;
  originalCandidate: CandidateSlot;
}

interface RescheduleRecommendationCardProps {
  recommendation: RescheduleRecommendation;
  isFallback?: boolean;
  onAccept?: () => void;
  onReject?: () => void;
}

export function RescheduleRecommendationCard({
  recommendation,
  isFallback = false,
  onAccept,
  onReject,
}: RescheduleRecommendationCardProps) {
  const { aiRank, aiConfidence, rationale, originalCandidate } = recommendation;

  // Determine rank badge color
  const rankColors = {
    1: 'bg-green-500 text-white',
    2: 'bg-blue-500 text-white',
    3: 'bg-orange-500 text-white',
  } as const;

  const rankLabels = {
    1: '1st Choice',
    2: '2nd Choice',
    3: '3rd Choice',
  } as const;

  const rankColor = rankColors[aiRank as keyof typeof rankColors] || 'bg-gray-500 text-white';
  const rankLabel = rankLabels[aiRank as keyof typeof rankLabels] || `${aiRank}th Choice`;

  // Format times
  const departureDate = new Date(originalCandidate.departureTime);
  const departureTimeStr = departureDate.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Calculate confidence color gradient (red -> yellow -> green)
  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 80) return 'bg-green-500';
    if (confidence >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const confidenceColor = getConfidenceColor(aiConfidence);

  // Check constraints
  const { constraints } = originalCandidate;
  const allConstraintsMet =
    constraints.instructorAvailable &&
    constraints.aircraftAvailable &&
    constraints.certificationValid &&
    constraints.withinTimeWindow &&
    constraints.minimumSpacingMet;

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-4 border border-gray-200">
      {/* Header: Rank Badge and Confidence */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${rankColor}`}>
            {rankLabel}
          </span>
          {isFallback && (
            <span className="ml-2 inline-block px-2 py-1 rounded bg-yellow-100 text-yellow-800 text-xs">
              Fallback Ranking
            </span>
          )}
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500 mb-1">AI Confidence</div>
          <div className="text-lg font-bold">{aiConfidence}%</div>
        </div>
      </div>

      {/* Confidence Bar */}
      <div className="mb-4">
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`${confidenceColor} h-2 rounded-full transition-all duration-300`}
            style={{ width: `${aiConfidence}%` }}
          ></div>
        </div>
      </div>

      {/* Candidate Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Left Column */}
        <div>
          <div className="mb-3">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Instructor</div>
            <div className="font-semibold text-gray-800">{originalCandidate.instructorName}</div>
          </div>

          <div className="mb-3">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Aircraft</div>
            <div className="font-semibold text-gray-800">
              {originalCandidate.aircraftRegistration}
            </div>
            {originalCandidate.notes && (
              <div className="text-xs text-orange-600 mt-1">{originalCandidate.notes}</div>
            )}
          </div>

          <div className="mb-3">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Time</div>
            <div className="font-semibold text-gray-800">{departureTimeStr}</div>
          </div>

          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Duration</div>
            <div className="font-semibold text-gray-800">
              {originalCandidate.durationMinutes} minutes
            </div>
          </div>
        </div>

        {/* Right Column: Constraints Checklist */}
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Constraints</div>
          <div className="space-y-1">
            <div className="flex items-center text-sm">
              <span className={constraints.instructorAvailable ? 'text-green-600' : 'text-red-600'}>
                {constraints.instructorAvailable ? '✓' : '✗'}
              </span>
              <span className="ml-2">Instructor Available</span>
            </div>
            <div className="flex items-center text-sm">
              <span className={constraints.aircraftAvailable ? 'text-green-600' : 'text-red-600'}>
                {constraints.aircraftAvailable ? '✓' : '✗'}
              </span>
              <span className="ml-2">Aircraft Available</span>
            </div>
            <div className="flex items-center text-sm">
              <span className={constraints.certificationValid ? 'text-green-600' : 'text-red-600'}>
                {constraints.certificationValid ? '✓' : '✗'}
              </span>
              <span className="ml-2">Certification Valid</span>
            </div>
            <div className="flex items-center text-sm">
              <span className={constraints.withinTimeWindow ? 'text-green-600' : 'text-red-600'}>
                {constraints.withinTimeWindow ? '✓' : '✗'}
              </span>
              <span className="ml-2">Time Window Valid</span>
            </div>
            <div className="flex items-center text-sm">
              <span className={constraints.minimumSpacingMet ? 'text-green-600' : 'text-red-600'}>
                {constraints.minimumSpacingMet ? '✓' : '✗'}
              </span>
              <span className="ml-2">Minimum Spacing Met</span>
            </div>
          </div>

          {!allConstraintsMet && (
            <div className="mt-2 text-xs text-orange-600 font-semibold">
              ⚠ Some constraints not met
            </div>
          )}
        </div>
      </div>

      {/* AI Rationale */}
      <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <div className="text-xs text-blue-600 uppercase tracking-wide mb-2 font-semibold">
          AI Recommendation
        </div>
        <div className="text-sm text-gray-800 italic leading-relaxed">{rationale}</div>
      </div>

      {/* Action Buttons */}
      {(onAccept || onReject) && (
        <div className="mt-6 flex gap-3">
          {onAccept && (
            <button
              onClick={onAccept}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg shadow-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            >
              Accept
            </button>
          )}
          {onReject && (
            <button
              onClick={onReject}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg shadow-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              Reject
            </button>
          )}
        </div>
      )}
    </div>
  );
}
