/**
 * AI Reschedule Service
 * Uses Workers AI to rank candidate reschedule slots with natural language rationale
 * Includes timeout fallback to confidence-based ranking
 */

import { ExecutionContext } from '../lib/logger';
import { CandidateSlot, CandidateSlotsResult } from './candidate-slot-service';

// ========================================
// Type Definitions
// ========================================

/**
 * AI-ranked recommendation with rationale
 */
export interface RescheduleRecommendation {
  candidateIndex: number; // 0-14 reference to candidate slot
  aiRank: number; // 1, 2, or 3
  aiConfidence: number; // 0-100 from AI or fallback
  rationale: string; // Natural language explanation
  originalCandidate: CandidateSlot; // Full candidate data
}

/**
 * Response containing recommendations and metadata
 */
export interface RescheduleRecommendationResponse {
  recommendations: RescheduleRecommendation[];
  aiUnavailable?: boolean; // true if fallback used
  fallbackReason?: string; // "timeout", "parse_error", "empty_candidates", etc.
  error?: string; // error message if fatal
  correlationId: string;
}

/**
 * Internal AI response format for parsing
 */
interface AIRankingResponse {
  rank: number;
  candidateIndex: number;
  confidence: number;
  rationale: string;
}

// ========================================
// Constants
// ========================================

const AI_TIMEOUT_MS = 5000; // 5 seconds
const MAX_CANDIDATES_FOR_PROMPT = 15;

// ========================================
// Helper Functions - Prompt Engineering
// ========================================

/**
 * Builds flight context section for AI prompt
 * @param candidateSlots - Candidate slots result
 * @returns Human-readable flight context
 */
function buildFlightContextPrompt(candidateSlots: CandidateSlotsResult): string {
  const departureDate = new Date(candidateSlots.originalDepartureTime);
  const firstCandidate = candidateSlots.candidateSlots[0];
  const duration = firstCandidate?.durationMinutes || 60;

  return `Original Flight: Flight #${candidateSlots.originalFlightId}
Scheduled: ${departureDate.toLocaleString('en-US', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
})} (${duration} minutes)
Reason: Weather conflict detected <72 hours before departure
Search Window: ±7 days from original departure
`;
}

/**
 * Builds candidate slots list section for AI prompt
 * @param candidates - Array of candidate slots
 * @param maxCandidates - Maximum number to include in prompt
 * @returns Human-readable candidate list
 */
function buildCandidateSlotsPrompt(candidates: CandidateSlot[], maxCandidates: number = MAX_CANDIDATES_FOR_PROMPT): string {
  const limitedCandidates = candidates.slice(0, maxCandidates);

  const candidatesList = limitedCandidates.map((candidate, idx) => {
    const departureTime = new Date(candidate.departureTime);
    const timeStr = departureTime.toLocaleString('en-US', {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });

    return `${idx + 1}. ${candidate.instructorName} / ${candidate.aircraftRegistration} @ ${timeStr} (confidence: ${candidate.confidence}%, ${candidate.durationMinutes} min)${candidate.notes ? ' - ' + candidate.notes : ''}`;
  }).join('\n');

  return `Candidate Slots (sorted by score):
${candidatesList}`;
}

/**
 * Builds AI ranking instructions section
 * @returns Instructions for AI
 */
function buildAIRankingInstructions(): string {
  return `Rank the TOP 3 candidates considering:
1. Instructor continuity (same instructor preferred)
2. Time alignment (same time of day > same day > nearby days)
3. Aircraft compatibility (same type > compatible type > alternative)
4. Student preference signals (higher confidence scores preferred)
5. Any concerns (note aircraft alternatives, significant time shifts)

Return ONLY valid JSON array (no markdown, no extra text):
[
  { "rank": 1, "candidateIndex": 0, "confidence": 95, "rationale": "Brief 1-2 sentence explanation" },
  { "rank": 2, "candidateIndex": 1, "confidence": 88, "rationale": "Brief 1-2 sentence explanation" },
  { "rank": 3, "candidateIndex": 2, "confidence": 80, "rationale": "Brief 1-2 sentence explanation" }
]

Rationale guidelines: Use 1-3 sentences, natural language, explain WHY this option is good.`;
}

/**
 * Assembles full prompt for Workers AI
 * @param candidateSlots - Candidate slots result
 * @returns Complete prompt string
 */
function assembleFullPrompt(candidateSlots: CandidateSlotsResult): string {
  const flightContext = buildFlightContextPrompt(candidateSlots);
  const candidatesList = buildCandidateSlotsPrompt(candidateSlots.candidateSlots);
  const instructions = buildAIRankingInstructions();

  return `Flight Rescheduling Decision Support

${flightContext}

${candidatesList}

${instructions}`;
}

// ========================================
// Helper Functions - Workers AI Integration
// ========================================

/**
 * Calls Workers AI with timeout enforcement
 * @param env - Cloudflare environment
 * @param prompt - Prompt string
 * @param ctx - Execution context
 * @param timeoutMs - Timeout in milliseconds
 * @returns AI response string
 * @throws Error with 'AI_TIMEOUT' message on timeout
 */
async function callWorkersAI(
  env: any,
  prompt: string,
  ctx: ExecutionContext,
  timeoutMs: number = AI_TIMEOUT_MS
): Promise<string> {
  const logger = ctx.logger;

  logger.info('[ai-reschedule] Calling Workers AI', {
    correlationId: ctx.correlationId,
    promptSize: prompt.length,
    timeoutMs
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const startTime = Date.now();

    // Call Workers AI
    const response = await env.AI_MODEL.run(
      '@cf/meta/llama-3.1-8b-instruct',
      {
        prompt: prompt,
      }
    );

    clearTimeout(timeoutId);
    const elapsedMs = Date.now() - startTime;

    logger.info('[ai-reschedule] AI response received', {
      correlationId: ctx.correlationId,
      elapsedMs
    });

    // Extract response text
    if (response && response.response) {
      return response.response;
    } else {
      throw new Error('Invalid AI response format');
    }
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      logger.warn('[ai-reschedule] AI call timeout', {
        correlationId: ctx.correlationId,
        timeoutMs
      });
      throw new Error('AI_TIMEOUT');
    }

    logger.error('[ai-reschedule] AI call failed', {
      correlationId: ctx.correlationId,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

/**
 * Parses AI response JSON to rankings
 * @param response - Raw AI response string
 * @param ctx - Execution context
 * @returns Array of rankings or null on parse failure
 */
function parseAIResponse(response: string, ctx: ExecutionContext): AIRankingResponse[] | null {
  const logger = ctx.logger;

  try {
    // Try to extract JSON from response (AI might add extra text)
    let jsonStr = response.trim();

    // Remove markdown code blocks if present
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    }

    // Find JSON array
    const jsonMatch = jsonStr.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const rankings = JSON.parse(jsonStr);

    if (!Array.isArray(rankings) || rankings.length === 0) {
      logger.warn('[ai-reschedule] Empty rankings array from AI', {
        correlationId: ctx.correlationId,
        response: response.substring(0, 200),
      });
      return null;
    }

    // Validate each ranking has required fields
    const valid = rankings.filter(r =>
      typeof r.rank === 'number' &&
      typeof r.candidateIndex === 'number' &&
      typeof r.confidence === 'number' &&
      typeof r.rationale === 'string'
    );

    if (valid.length < rankings.length) {
      logger.warn('[ai-reschedule] Some rankings missing required fields', {
        correlationId: ctx.correlationId,
        expected: rankings.length,
        valid: valid.length,
      });
    }

    const topThree = valid.slice(0, 3); // Return top 3 only

    logger.info('[ai-reschedule] Parsed AI rankings', {
      correlationId: ctx.correlationId,
      rankingCount: topThree.length
    });

    return topThree;
  } catch (error) {
    logger.error('[ai-reschedule] Failed to parse AI response', {
      correlationId: ctx.correlationId,
      error: error instanceof Error ? error.message : 'Unknown',
      response: response.substring(0, 200),
    });
    return null;
  }
}

// ========================================
// Helper Functions - Fallback Ranking
// ========================================

/**
 * Generates fallback ranking based on confidence scores
 * @param candidates - Candidate slots
 * @param reason - Reason for fallback
 * @param ctx - Execution context
 * @returns Array of fallback rankings
 */
function generateFallbackRanking(
  candidates: CandidateSlot[],
  reason: string,
  ctx: ExecutionContext
): AIRankingResponse[] {
  const logger = ctx.logger;

  logger.warn('[ai-reschedule] Using fallback ranking', {
    correlationId: ctx.correlationId,
    reason,
    candidateCount: candidates.length
  });

  // Sort by confidence descending
  const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);
  const topThree = sorted.slice(0, 3);

  return topThree.map((candidate, idx) => ({
    rank: idx + 1,
    candidateIndex: candidate.slotIndex,
    confidence: candidate.confidence,
    rationale: `[Fallback: ${reason}] ${getGenericRationale(candidate)}`,
  }));
}

/**
 * Generates generic rationale for fallback rankings
 * @param candidate - Candidate slot
 * @returns Generic rationale string
 */
function getGenericRationale(candidate: CandidateSlot): string {
  const timeStr = new Date(candidate.departureTime).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  });
  return `${candidate.instructorName} available at ${timeStr} on ${candidate.aircraftRegistration}. All constraints met.`;
}

// ========================================
// Helper Functions - Response Assembly
// ========================================

/**
 * Converts AI rankings to recommendations
 * @param rankings - AI ranking responses
 * @param candidates - Candidate slots array
 * @param ctx - Execution context
 * @returns Array of recommendations
 */
function assembleRecommendations(
  rankings: AIRankingResponse[],
  candidates: CandidateSlot[],
  ctx: ExecutionContext
): RescheduleRecommendation[] {
  const logger = ctx.logger;

  const recommendations = rankings.map(ranking => {
    const candidate = candidates.find(c => c.slotIndex === ranking.candidateIndex);

    if (!candidate) {
      logger.warn('[ai-reschedule] Candidate not found for ranking', {
        correlationId: ctx.correlationId,
        candidateIndex: ranking.candidateIndex,
      });
      return null;
    }

    return {
      candidateIndex: ranking.candidateIndex,
      aiRank: ranking.rank,
      aiConfidence: ranking.confidence,
      rationale: ranking.rationale || getGenericRationale(candidate),
      originalCandidate: candidate,
    };
  }).filter((rec): rec is RescheduleRecommendation => rec !== null);

  logger.info('[ai-reschedule] Assembled recommendations', {
    correlationId: ctx.correlationId,
    recommendationCount: recommendations.length
  });

  return recommendations;
}

// ========================================
// Main Service Function
// ========================================

/**
 * Generates AI-ranked reschedule recommendations
 * @param env - Cloudflare environment
 * @param candidateSlots - Candidate slots result from candidate-slot-service
 * @param executionContext - Execution context with logger
 * @returns Reschedule recommendation response
 */
export async function generateRescheduleRecommendations(
  env: any,
  candidateSlots: CandidateSlotsResult,
  executionContext: ExecutionContext
): Promise<RescheduleRecommendationResponse> {
  const logger = executionContext.logger;
  const correlationId = executionContext.correlationId;

  logger.info('[ai-reschedule] Generating recommendations', {
    correlationId,
    flightId: candidateSlots.originalFlightId,
    candidateCount: candidateSlots.candidateSlots.length,
  });

  try {
    // Validate input
    if (!candidateSlots || !candidateSlots.candidateSlots || candidateSlots.candidateSlots.length === 0) {
      logger.warn('[ai-reschedule] No candidates to rank', { correlationId });
      return {
        recommendations: [],
        aiUnavailable: true,
        fallbackReason: 'empty_candidates',
        error: 'No candidates available to rank',
        correlationId,
      };
    }

    // Check if AI binding exists
    if (!env.AI_MODEL) {
      logger.error('[ai-reschedule] AI_MODEL binding not configured', { correlationId });
      return {
        recommendations: [],
        error: 'Workers AI binding not configured. Check wrangler.toml',
        correlationId,
      };
    }

    let rankings: AIRankingResponse[] | null = null;
    let aiUnavailable = false;
    let fallbackReason: string | undefined;

    try {
      // Assemble prompt
      const prompt = assembleFullPrompt(candidateSlots);
      logger.info('[ai-reschedule] Prompt assembled', {
        correlationId,
        promptSize: prompt.length
      });

      // Call Workers AI with timeout
      const aiResponse = await callWorkersAI(env, prompt, executionContext);

      // Parse AI response
      rankings = parseAIResponse(aiResponse, executionContext);

      if (!rankings) {
        // Parse failed, use fallback
        aiUnavailable = true;
        fallbackReason = 'parse_error';
        rankings = generateFallbackRanking(candidateSlots.candidateSlots, 'parse_error', executionContext);
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'AI_TIMEOUT') {
        // Timeout occurred, use fallback
        aiUnavailable = true;
        fallbackReason = 'timeout';
        rankings = generateFallbackRanking(candidateSlots.candidateSlots, 'timeout', executionContext);
      } else {
        // Other error, use fallback
        logger.error('[ai-reschedule] Unexpected error during AI call', {
          correlationId,
          error: error instanceof Error ? error.message : String(error),
        });
        aiUnavailable = true;
        fallbackReason = 'error';
        rankings = generateFallbackRanking(candidateSlots.candidateSlots, 'error', executionContext);
      }
    }

    // Assemble recommendations
    const recommendations = assembleRecommendations(
      rankings,
      candidateSlots.candidateSlots,
      executionContext
    );

    logger.info('[ai-reschedule] Returning recommendations', {
      correlationId,
      recommendationCount: recommendations.length,
      aiUnavailable
    });

    return {
      recommendations,
      aiUnavailable,
      fallbackReason,
      correlationId,
    };
  } catch (error) {
    logger.error('[ai-reschedule] Fatal error generating recommendations', {
      correlationId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return {
      recommendations: [],
      error: error instanceof Error ? error.message : 'Unknown error',
      correlationId,
    };
  }
}
