# AIRescheduler - Product Requirements Document

**Author:** Adam  
**Date:** 2025-11-09  
**Version:** 1.0

---

## Executive Summary

AIRescheduler automates weather-aware flight lesson scheduling for flight schools that currently rely on manual monitoring. The system continuously ingests short-term forecasts, scores impact against training-level thresholds, and either reschedules imminent lessons or raises advisory alerts. A manager dashboard exposes real-time status, AI-generated alternatives, and manual trigger controls so staff can stay ahead of volatile weather without chasing data across systems.

### What Makes This Special

It marries deterministic weather rules with Workers AI reasoning to craft three vetted alternate lesson slots—complete with rationale—within seconds of identifying a risk, giving schedulers confidence to act without combing through availability spreadsheets or forecasts.

---

## Project Classification

**Technical Type:** Cloudflare Worker SaaS (cron + dashboard)  
**Domain:** Aviation training operations  
**Complexity:** Medium – safety-adjacent scheduling with external data dependencies

AIRescheduler is a greenfield, cloud-native solution anchored on Cloudflare Workers. It blends hourly autonomous execution with an embedded React 18 dashboard, targeting small-to-mid flight schools that need proactive disruption handling but lack dispatch-scale tooling.

### Domain Context

- Flight lessons must respect instructor certifications, aircraft availability, and progressing student curriculums.  
- Weather volatility near flight time directly affects safety and compliance, demanding tight turnaround on scheduling decisions.  
- Schools often operate lean teams; any automation must surface high-confidence recommendations, not just alerts.

---

## Success Criteria

- Detect and classify ≥95% of weather conflicts for flights within 72 hours, with zero missed high-severity events.  
- Auto-reschedule at least 70% of conflicted flights inside the 72-hour window without manual intervention, with staff acceptance rate ≥80%.  
- Deliver advisory alerts ≥72 hours out with <5-minute lag from forecast update and <2 false positives per week.  
- Provide a single-pane dashboard where schedulers can review and act on all active conflicts in ≤2 minutes.  
- Maintain an auditable history of decisions and AI rationales for 100% of automated actions.

---

## Product Scope

### MVP - Minimum Viable Product

- Hourly cron worker that polls WeatherAPI.com for departure, arrival, and corridor checkpoints tied to upcoming lessons (<7 days).  
- Tiered threshold engine keyed by training level; auto-reschedule flights inside 72 hours, flag advisory status ≥72 hours.  
- Workers AI prompt that composes three alternate slots using instructor/aircraft availability, weather horizon, and lesson constraints; validates JSON schema before persisting.  
- Cloudflare D1 schema with tables for students, instructors, aircraft, flights, weather snapshots, reschedule actions, thresholds, and notifications.  
- Manager dashboard (React + Shadcn) showing flight board, weather timeline, AI suggestions, notification tray, and manual controls (seed demo data, trigger poll/rescheduler).  
- Structured logging with correlation IDs and audit trail for all automated decisions.

### Growth Features (Post-MVP)

- Email notifications to students and instructors mirroring in-dashboard alerts.  
- Configurable threshold tuning per school or instructor.  
- Role-based access and authentication for multi-user teams.  
- Metrics dashboard summarizing conflicts detected, interventions taken, and average resolution time.  
- SLA monitoring and alerting for cron failures or integration outages.

### Vision (Future)

- Two-way integration with scheduling/calendaring systems (e.g., Flight Schedule Pro, Google Calendar) for automatic booking updates.  
- Instructor and student self-service portals to acknowledge or request alternate slots.  
- Predictive analytics that anticipate weather bottlenecks beyond 7 days using historical patterns.  
- Multi-airport expansion with corridor-specific micro-forecasts and routing suggestions.

---

## Domain-Specific Requirements

- Respect aviation training regulations: auto-rescheduled lessons must maintain required instructor credentials, aircraft category, and student progression stage.  
- Preserve a full audit trail (original schedule, weather evidence, AI rationale) to support safety reviews or regulator audits.  
- Validate weather data integrity; fallback to cached snapshots when APIs fail while flagging data staleness to staff.  
- Acknowledge that final go/no-go decisions remain human; system should provide confidence indicators, not hard enforcement.

This section shapes all functional and non-functional requirements below.

---

## Innovation & Novel Patterns

AIRescheduler operationalizes a hybrid human+AI rescheduling loop in a traditionally manual domain. It combines deterministic safety thresholds with LLM-backed ranking to accelerate decision-making while keeping humans in control. The Worker-based architecture demonstrates how lightweight serverless runtimes can orchestrate mission-critical scheduling in near real time.

### Validation Approach

- Capture and review AI-ranked suggestions against manual dispatcher choices during pilot rollout.  
- Log model input/output pairs; run nightly schema validation checks to confirm AI responses stay within contract.  
- Provide a manual override path in the dashboard to accept, adjust, or reject AI proposals, capturing rationale for retraining or prompt tuning.  
- Monitor auto-reschedule acceptance rate and adjust prompt or scoring logic when acceptance dips below target.

---

## Cloudflare Worker SaaS (cron + dashboard) Specific Requirements

- Single Worker module exporting both `fetch` (dashboard + RPC) and `scheduled` handlers.  
- RPC schema enforced with Zod; methods include `weatherPoll`, `autoReschedule`, `seedDemoData`, `listFlights`.  
- Shared service layer (weather, thresholds, rescheduler, notifications) used by both cron and dashboard triggers.  
- Vite-powered asset bundling with React 18 and Shadcn UI components served via the Worker.  
- D1 client abstractions for prepared statements, transactions, and result mapping.

### API Specification

- RPC endpoint `/rpc` accepting JSON payloads with method name and arguments; responses return `{ result, error? }`.  
- `weatherPoll`: triggers weather ingestion pipeline; returns summary of updated snapshots.  
- `autoReschedule`: evaluates queued flights, invokes AI, persists decisions; returns affected flight IDs and statuses.  
- `seedDemoData`: idempotent initializer for D1 tables with sample flights, instructors, aircraft.  
- `listFlights`: returns upcoming flights with weather status, recommendations, and audit references.

### Authentication & Authorization

- MVP operates in trusted environment without auth; future growth features will add role-based access.  
- Protect RPC methods by restricting origins to the dashboard UI and requiring Workers secret token when invoked via CLI.

---

## User Experience Principles

- Present a "command center" feel: essential signal first (flight risk level, recommendation confidence), with quick drill-down paths.  
- Keep interactions low-friction; key actions (accept suggestion, trigger rescan) should be one click with immediate feedback.  
- Use timeline visualizations and severity badges to communicate urgency and confidence at a glance.  
- Provide inline rationale and weather details so schedulers understand why a recommendation exists before acting.  
- Ensure keyboard accessibility and high-contrast styling to support operations in varied lighting conditions.

### Key Interactions

- Accept or reject AI-suggested reschedule slots directly from each flight card.  
- Trigger manual weather poll or rescheduler runs and observe inline status to confirm completion.  
- Inspect weather timeline overlays linking forecasts to specific lesson checkpoints.  
- Review the notification tray for recent automated actions and advisories, with ability to clear or archive entries.

---

## Functional Requirements

### FR1 – Weather Monitoring & Classification
- Cron job polls WeatherAPI.com hourly, covering departure, arrival, and corridor checkpoints for lessons within 7 days.  
- Weather snapshots stored with correlation IDs, forecast metadata, and confidence horizon.  
- Threshold engine classifies each lesson as `clear`, `advisory`, or `auto-reschedule` based on training level and severity.

### FR2 – Rescheduling Engine
- Identify conflicted flights under 72 hours, assemble candidate slots within ±7 days using instructor and aircraft availability, and ensure no overlap or duty conflicts.  
- Score candidates on availability alignment, weather suitability, and spacing; invoke Workers AI to rank top three options.  
- Persist chosen slot, AI rationale, and decision metadata; mark original flight status as `rescheduled`, `pending`, or `manual-review`.

### FR3 – Advisory Management
- For flights ≥72 hours out, log advisory status with recommended review date and weather summary.  
- Surface advisories in dashboard timeline and notification tray; allow managers to dismiss or promote to manual review.

### FR4 – Dashboard Experience
- Render upcoming flights with status badges, AI suggestions, and action buttons.  
- Provide weather timeline visualization with severity shading and confidence windows.  
- Offer manual controls for seeding demo data, triggering weather poll, and forcing rescheduler run.  
- Reflect live updates without full-page reload using client-side state management.

### FR5 – Data & Audit Trail
- Maintain normalized D1 tables for core entities and events; enforce referential integrity via migrations.  
- Record every automated action with timestamp, inputs, AI output, and human follow-up (accept/reject).  
- Expose audit log entries through dashboard or exported reports for compliance checks.

### FR6 – Notifications & Messaging
- Generate in-app notifications for new advisories, reschedules, and errors; queue them in D1 and hydrate dashboard tray.  
- Include clear status labels (`auto-rescheduled`, `advisory`, `action required`) with timestamps and quick links to affected flights.

### FR7 – Observability & Error Handling
- Emit structured JSON logs tagged with run IDs, method names, and severity levels.  
- Surface errors in dashboard controls with actionable messages (e.g., Weather API timeout, AI schema failure) and preserve context for debugging.  
- Provide retry behavior with exponential backoff for external integrations, and notify staff when fallback data is being used.

Acceptance criteria for each FR include end-to-end validation via Wrangler preview using seeded data and ability to inspect outcomes in D1 and logs.

---

## Non-Functional Requirements

### Performance

- Cron execution must complete weather poll + evaluation + AI ranking within 120 seconds to prevent overlapping runs.  
- Dashboard interactions should respond within 300 ms for primary actions on warm cache.  
- AI inference requests should return within 5 seconds; otherwise flag as degraded and queue for retry.

### Security

- Store API keys (WeatherAPI, Workers AI) in Workers secrets; never expose in client bundle.  
- Sanitize and validate all RPC inputs; reject unexpected schema to prevent injection or malformed data persistence.  
- Limit RPC access to first-party dashboard by checking request origin and optional shared secret.

### Scalability

- Support up to 500 active flights in a 7-day window with hourly cron without exceeding D1 limits.  
- Design data model to partition by school in future multi-tenant deployments.  
- Ensure weather ingestion and AI prompting logic is configurable for additional airports or corridors.

### Accessibility

- Meet WCAG AA contrast ratios for dashboard components.  
- Provide keyboard navigation for key interactions; ensure focus states are visible.  
- Use semantic markup and ARIA labels for timelines, buttons, and notifications.

### Integration

- Maintain retry and backoff policy for WeatherAPI.com outages; log incidents and surface alerts.  
- Validate Workers AI responses against JSON schema; quarantine or retry invalid responses with alert to staff.  
- Provide CLI-friendly scripts (Wrangler) for seeding data and running migrations in CI/CD.

---

## References

- Tech Spec: `docs/tech-spec.md`

---

_This PRD captures the essence of AIRescheduler – automated, AI-backed weather responsiveness that keeps flight schools ahead of disruption._  
_Created through collaborative discovery between Adam and AI facilitator._

