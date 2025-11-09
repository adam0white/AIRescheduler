# Epic 3: AI-Driven Rescheduling Engine

**Epic ID:** EPIC-3
**Epic Name:** AI-Driven Rescheduling Engine
**Status:** Planned
**Priority:** High
**Owner:** Development Team

## Epic Description

Build the automated rescheduling engine that identifies conflicted flights, generates candidate alternate slots using instructor and aircraft availability, invokes Workers AI to rank top suggestions, and persists chosen reschedule decisions with full audit trail.

## Business Value

Delivers the core automation promise: 70%+ auto-reschedule rate for flights within 72 hours with 80%+ staff acceptance, dramatically reducing manual intervention while maintaining safety and compliance requirements.

## Success Criteria

- Rescheduler identifies all flights marked for auto-rescheduling
- Candidate slots respect instructor certifications, aircraft availability, and student progression
- Workers AI produces three ranked options with rationale in <5 seconds
- Chosen slots are persisted with full audit trail
- Original flights updated with rescheduled status and reference to new slot
- Auto-reschedule acceptance rate tracked and ≥80%

## Functional Requirements Alignment

- **FR2 – Rescheduling Engine** (primary)
- **FR5 – Data & Audit Trail** (audit logging of decisions)
- Supports FR7 (Observability) through AI request/response logging

## Stories

1. **3.1** - Candidate Slot Generation Algorithm
2. **3.2** - Workers AI Integration & Prompt Engineering
3. **3.3** - Reschedule Decision Persistence & Audit Trail

## Dependencies

- Epic 1 (Foundation) must be complete
- Epic 2 (Weather Monitoring) classification must mark flights for rescheduling
- D1 schema with `reschedule_actions` table
- Workers AI binding configured in `wrangler.toml`
- Instructor availability data in `src/data/instructor-availability.json`

## Acceptance Criteria

1. Rescheduler queries flights with status `auto-reschedule`
2. Candidate slots generated within ±7 days of original flight time
3. Candidates respect instructor certifications, aircraft category match, and no scheduling conflicts
4. Candidates scored on availability alignment, weather suitability, and spacing
5. Workers AI model `@cf/meta/llama-3.1-8b-instruct` receives structured JSON input
6. AI prompt includes flight details, training level, weather snapshot, and availability windows
7. AI response validated against JSON schema (`ranked_options`, `rationale`)
8. Malformed AI responses rejected and logged; retry with adjusted prompt
9. Chosen reschedule slot persisted in `reschedule_actions` with AI rationale
10. Original flight record updated with status `rescheduled` and reference to new slot
11. Audit trail includes timestamp, inputs, AI output, and human follow-up action
12. Dashboard displays AI-ranked suggestions with rationale and accept/reject controls

## Technical Notes

- Workers AI binding: `AI_MODEL` -> `@cf/meta/llama-3.1-8b-instruct`
- AI timeout: 5 seconds
- JSON schema validation required before persisting AI output
- Correlation IDs link original flight to reschedule action
- Instructor availability sourced from static JSON file (future: query calendar API)
- Scoring factors: availability overlap (40%), weather suitability (35%), spacing (25%)
