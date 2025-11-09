# AIRescheduler - Technical Specification

**Author:** Adam
**Date:** 2025-11-08
**Project Level:** 1
**Change Type:** Automated weather rescheduling showcase
**Development Context:** Greenfield Cloudflare Workers build

---

## Context

### Available Documents

- PRD: `AI Flight Lesson Rescheduler.md` – core objectives, stack preferences, success criteria
- Additional inputs: none (tech spec is primary source of truth)
- Brownfield assets: not applicable (greenfield project)

### Project Stack

- Cloudflare Workers runtime (compatibility date 2024-11-08)
- Workers Cron (hourly schedule) for autonomous runs
- Cloudflare D1 database (`AIRESCHEDULER_DB`) for schedules, thresholds, audit log
- Workers AI binding (`@cf/meta/llama-3.1-8b-instruct`) for reschedule reasoning
- WeatherAPI.com REST integration for forecast data
- React 18 dashboard with Shadcn UI components bundled via Vite
- Wrangler CLI + npm workflows for build and deploy

### Existing Codebase Structure

- Greenfield project – conventions defined by this spec
- Single Worker entry exporting scheduled handler and RPC bridge
- Service modules under `src/services` for weather, rescheduler, notifications
- Dashboard UI co-located under `src/dashboard` using Shadcn components
- Manual verification via Wrangler preview and dashboard controls

---

## The Change

### Problem Statement

Flight schools currently re-schedule weather-impacted lessons manually. This showcase system automatically monitors weather, evaluates severity against training-level thresholds, and reschedules or flags upcoming flights without staff intervention.

### Proposed Solution

Build a Cloudflare Workers application that:
- Continuously polls WeatherAPI.com via Workers Cron and evaluates upcoming flights across departure, arrival, and corridor checkpoints
- Applies tiered thresholds per training level to mark auto-reschedule candidates (<72 hours) or advisory flags (≥72 hours)
- Orchestrates Workers AI to produce ranked alternate slots with justification
- Persists flights, weather snapshots, decisions, and audit events in Cloudflare D1
- Provides a manager-facing dashboard with Shadcn UI components, in-app notifications, and manual testing controls

### Scope

**In Scope:**

- Scheduled cron Workers to fetch weather data and evaluate flights
- Tiered rescheduling logic with auto actions for high-confidence windows and advisory status otherwise
- Workers AI prompts to generate ranked reschedule suggestions
- D1 schema design for students, instructors, flights, weather snapshots, reschedule actions, and training thresholds
- Manager dashboard served from same Worker, including notification tray and manual trigger buttons
- Deployment via Wrangler using push-to-main workflow

**Out of Scope:**

- External notification channels (SMS, push)
- Authentication or access control layers
- Secondary hosting environments beyond Cloudflare Workers
- Historical analytics or predictive ML beyond Workers AI inference
- Calendar integrations and enterprise security hardening

**Stretch Goals:**

- Add email notifications to students and instructors alongside in-app alerts
- Instrument key operational metrics (bookings created, weather conflicts detected, successful reschedules, average rescheduling time)
- Introduce individual dashboards or web views for students and instructors to monitor their own schedules and alerts

---

## Implementation Details

### Source Tree Changes

- `wrangler.toml` — CREATE — Configure Worker name, compatibility date 2024-11-08, D1 binding (`AIRESCHEDULER_DB`), Workers AI binding (`AI_MODEL`), optional KV cache, and cron schedule (`0 * * * *`)
- `package.json` — CREATE — Define npm scripts (`dev`, `build`, `deploy`, `lint`), dependencies (`wrangler`, `hono`, `react`, `react-dom`, `vite`, `shadcn-ui`, `tailwindcss`, `typescript`)
- `tsconfig.json` — CREATE — Enable strict TypeScript with `es2022` target and `moduleResolution` set to `bundler`
- `vite.config.ts` — CREATE — Configure React + Workers build pipeline
- `tailwind.config.ts` — CREATE — Tailwind preset aligned with Shadcn tokens
- `src/index.ts` — CREATE — Worker entry exporting `fetch` (RPC router + dashboard asset serving) and `scheduled` handler (cron pipeline)
- `src/rpc/schema.ts` — CREATE — Define Zod schemas for RPC methods (`weatherPoll`, `autoReschedule`, `seedDemoData`, `listFlights`)
- `src/rpc/handlers.ts` — CREATE — Implement RPC dispatcher calling service layer with typed `Env`
- `src/services/weather-service.ts` — CREATE — Fetch WeatherAPI data, apply caching, compute confidence horizon, persist snapshots
- `src/services/rescheduler.ts` — CREATE — Generate candidate slots, invoke Workers AI, persist chosen results, mark original flights
- `src/services/notification-service.ts` — CREATE — Manage in-dashboard notification queue derived from latest actions
- `src/services/thresholds.ts` — CREATE — Load training-level weather thresholds from D1
- `src/db/client.ts` — CREATE — Provide prepared statement helpers, transactions, and result mapping for D1
- `src/db/migrations/0001_init.sql` — CREATE — Tables: `students`, `instructors`, `aircraft`, `flights`, `weather_snapshots`, `reschedule_actions`, `training_thresholds`
- `src/db/migrations/0002_seed_thresholds.sql` — CREATE — Insert baseline thresholds for student, private, instrument training levels
- `src/data/instructor-availability.json` — CREATE — Static availability windows consumed by rescheduler and AI prompt
- `src/dashboard/main.tsx` — CREATE — React entry point bootstrapping dashboard root
- `src/dashboard/App.tsx` — CREATE — Layout, navigation, and provider wiring for RPC client and notifications
- `src/dashboard/components/FlightStatusBoard.tsx` — CREATE — Render upcoming flights with status badges and action controls
- `src/dashboard/components/WeatherTimeline.tsx` — CREATE — Visualize forecast confidence windows and severity
- `src/dashboard/components/RescheduleSuggestions.tsx` — CREATE — Display AI-ranked slots with justification
- `src/dashboard/components/NotificationTray.tsx` — CREATE — Toast-style feed of auto actions and advisories
- `src/dashboard/components/TestingControls.tsx` — CREATE — Buttons for manual triggers (seed data, run weather poll, run rescheduler)
- `src/dashboard/hooks/useRpc.ts` — CREATE — Client hook bridging to Worker RPC methods
- `src/lib/logger.ts` — CREATE — Structured logging wrapper calling `console` with JSON payloads
- `README.md` — MODIFY — Document setup steps, manual testing workflow, and deployment instructions

### Technical Approach

- Worker runtime: single module Worker bundled with Vite, using Hono 4.x to simplify handler composition
- Scheduling: Workers Cron executes every hour, calling the same service functions exposed via dashboard control
- Weather ingestion: WeatherAPI.com requests include ETag support and exponential backoff; responses cached in D1 snapshot table and optionally KV for short-term reuse
- Confidence logic: Forecast metadata defines confidence horizon; <72 hours triggers auto-reschedule pipeline, ≥72 hours flags advisory
- AI reasoning: Workers AI model `@cf/meta/llama-3.1-8b-instruct` receives structured JSON input (flight, availability, weather). Output validated against JSON schema before persisting
- Persistence: D1 accessed through prepared statements; migrations managed with `wrangler d1 migrations`
- RPC bridge: Dashboard imports generated client that calls Worker methods directly (no REST routes). Cron handler reuses identical service functions
- UI delivery: React + Shadcn components compiled via Vite; assets served from Worker static manifest
- Observability: Logger emits structured JSON to Workers logs; include correlation IDs per cron run

### Existing Patterns to Follow

- Worker-internal RPC bridge via typed handlers; avoid ad-hoc fetch endpoints
- Service modules expose pure functions accepting `Env`, input DTOs, and returning explicit results
- Shadcn component conventions (using `cn` utility, variant props, Tailwind tokens)
- Manual verification using Wrangler preview and dashboard controls as primary QA loop

### Integration Points

- WeatherAPI.com REST integration for forecast data
- Workers AI model `@cf/meta/llama-3.1-8b-instruct` for rescheduling reasoning
- Cloudflare D1 (`AIRESCHEDULER_DB`) for schedule data, thresholds, audit logs
- Workers Cron scheduler and dashboard testing controls sharing same service layer

---

## Development Context

### Relevant Existing Code

- Greenfield build; reference modules specified in this spec:
  - `src/services/weather-service.ts`
  - `src/services/rescheduler.ts`
  - `src/services/notification-service.ts`
  - `src/rpc/handlers.ts`
  - `src/db/migrations/*.sql`

### Dependencies

**Framework/Libraries:**

- Cloudflare Workers (compatibility date 2024-11-08)
- Hono 4.x
- React 18.x
- Shadcn UI (Radix-based)
- Vite 5.x
- Tailwind CSS 3.x
- TypeScript 5.x
- Wrangler 3.x

**Internal Modules:**

- Weather service
- Rescheduler service
- Notification service
- Thresholds loader
- RPC handlers
- Dashboard components

### Configuration Changes

- `wrangler.toml`: set compatibility date 2024-11-08; bind `AIRESCHEDULER_DB`, `AI_MODEL`, optional `WEATHER_CACHE`; configure cron schedule `0 * * * *`
- `src/data/instructor-availability.json`: checked-in dataset consumed by rescheduler and AI prompt
- `.dev.vars`: optionally define `WEATHER_API_KEY` when WeatherAPI access requires authentication
- Wrangler-generated `Env` types used directly in Worker modules (no custom env mapper)

### Existing Conventions (Brownfield)

- Greenfield project – conventions established in this spec (Worker RPC, Shadcn UI, manual testing)

### Test Framework & Standards

- Manual validation pipeline only; engineers exercise functionality via dashboard controls and observe Wrangler logs
- Maintain deterministic data seeds to keep manual checks reproducible

---

## Implementation Stack

- Cloudflare Workers runtime with compatibility date 2024-11-08
- Workers Cron for scheduled execution every hour
- Cloudflare D1 database managed via Wrangler migrations
- WeatherAPI.com as external data source
- Workers AI `@cf/meta/llama-3.1-8b-instruct` as inference engine
- React 18 + Shadcn UI for manager dashboard
- Vite build system with Tailwind and TypeScript strict mode
- npm + Wrangler CLI for local development and deployment

---

## Technical Details

- Weather confidence rule: derive forecast confidence from WeatherAPI metadata; treat forecasts under 72 hours as high-confidence auto candidates, longer horizons as advisory
- Reschedule algorithm: query instructor and aircraft availability, build candidate slots within ±7 days, score using availability overlap, weather suitability, and spacing, then ask Workers AI to rank top three suggestions; persist chosen slot and update flight record
- AI prompting: supply JSON payload containing flight details, training level, current weather snapshot, availability windows; require JSON response matching schema (`ranked_options`, `rationale`) and reject malformed output
- Notifications: derive in-dashboard notifications from latest reschedule actions; store summary rows in D1 for hydration
- Weather API consumption: include rate limit guard, fall back to cached data if API unavailable, log incidents; request and correlate data for departure, arrival, and corridor checkpoints
- Cron entry point: Worker `scheduled` handler orchestrates weather poll, evaluation, auto-reschedule; reuse service functions invoked by dashboard testing controls
- Manual testing controls: dashboard component exposes buttons to seed sample data, run weather poll, run auto rescheduler, and clear notifications
- Deployment pipeline: `npx wrangler deploy` publishes Worker and dashboard assets after `npm run build`

---

## Development Setup

- Run `npm install`
- Copy `.dev.vars.example` to `.dev.vars` and set `WEATHER_API_KEY`
- Apply D1 migrations locally: `npx wrangler d1 migrations apply AIRESCHEDULER_DB --local`
- Initialize Shadcn library: `npx shadcn-ui@latest init` and add required components (`button`, `card`, `table`, `toast`)
- Launch preview: `npm run dev` (Wrangler dev + dashboard bundling)
- Use dashboard testing controls to seed data and verify RPC operations

---

## Implementation Guide

### Setup Steps

- Install npm dependencies
- Apply D1 migrations locally
- Initialize Shadcn component library
- Seed demo data through dashboard control
- Confirm Workers AI binding availability (or enable mock mode)
- Verify `WEATHER_API_KEY` is present in `.dev.vars` if WeatherAPI access requires authentication in the current environment
- Start local preview via `npm run dev`

### Implementation Steps

1. Scaffold Worker configuration files (`wrangler.toml`, `package.json`, `tsconfig.json`, `vite.config.ts`, `tailwind.config.ts`)
2. Implement database migrations and apply them locally
3. Build service modules for weather ingestion, thresholds, notifications, and rescheduler logic
4. Implement Workers AI prompt builder and JSON schema validator
5. Wire RPC handlers and Worker entry (fetch + scheduled) to service layer
6. Construct dashboard with Shadcn components, RPC hook, and testing controls
7. Perform manual verification through Wrangler preview and adjust thresholds/data as needed
8. Run `npm run build` followed by `npx wrangler deploy`

### Testing Strategy

- Manual validation only via dashboard testing controls
- Execute weather poll, auto reschedule, and seed data buttons to confirm end-to-end behavior
- Monitor Wrangler logs for error output and confirm structured logging payloads
- Validate D1 entries using `wrangler d1 execute` queries to ensure persistence correctness

### Acceptance Criteria

1. Cron or manual weather poll automatically reschedules flights within 72 hours when thresholds are breached and flags advisory items beyond 72 hours
2. Dashboard reflects weather alerts, reschedule history, and AI recommendations without requiring reload
3. Workers AI produces three ranked reschedule options with rationale grounded in schedule and weather data
4. D1 tables persist original flights, rescheduled slots, weather snapshots, and audit records
5. Dashboard testing controls operate correctly in local preview and deployed environment
6. Deployment via `npx wrangler deploy` succeeds with compatibility date 2024-11-08 and no manual intervention

---

## Developer Resources

### File Paths Reference

- `wrangler.toml`
- `package.json`
- `src/index.ts`
- `src/rpc/schema.ts`
- `src/rpc/handlers.ts`
- `src/services/weather-service.ts`
- `src/services/rescheduler.ts`
- `src/services/notification-service.ts`
- `src/db/migrations/0001_init.sql`
- `src/db/migrations/0002_seed_thresholds.sql`
- `src/data/instructor-availability.json`
- `src/dashboard/App.tsx`
- `src/dashboard/components/FlightStatusBoard.tsx`
- `src/dashboard/components/WeatherTimeline.tsx`
- `src/dashboard/components/RescheduleSuggestions.tsx`
- `src/dashboard/components/NotificationTray.tsx`
- `README.md`

### Key Code Locations

- Worker entry (`src/index.ts`) – routes scheduled events and RPC calls
- Weather ingestion (`src/services/weather-service.ts`) – handles external API and confidence scoring
- Rescheduler engine (`src/services/rescheduler.ts`) – orchestrates AI-driven slot generation
- RPC layer (`src/rpc/handlers.ts`) – exposes methods to dashboard and cron
- Dashboard shell (`src/dashboard/App.tsx`) – renders primary UI and notification tray

### Testing Locations

- Manual validation through dashboard testing controls (no automated tests)
- Wrangler logs for runtime monitoring and error inspection

### Documentation to Update

- `README.md` – ensure setup, testing controls, and deployment steps are documented
- `docs/tech-spec.md` – maintain as living document for future iterations

---

## UX/UI Considerations

- Manager-focused dashboard with Shadcn components for lists, cards, toasts, and timelines
- Weather timeline highlights severity bands and confidence windows using Cloudflare design tokens
- Reschedule suggestions presented as ranked cards with rationale and accept/ignore actions
- Notification tray shows auto actions and advisory alerts with timestamps and training-level indicators
- Accessibility: ensure keyboard navigation and aria labels on interactive components; color choices meet contrast requirements

---

## Testing Approach

- Manual QA through dashboard controls and Wrangler dev preview
- Confirm each acceptance criterion via direct interaction
- Use seeded data to validate behavior across training levels and weather scenarios
- Inspect D1 state after each manual scenario to ensure persistence integrity

---

## Deployment Strategy

### Deployment Steps

1. Run `npm run build` to produce Worker and dashboard bundle
2. Execute `npx wrangler deploy`
3. Verify deployment via Wrangler dashboard and manual smoke test in production preview

### Rollback Plan

1. Re-deploy previous stable build using `npx wrangler deploy --config wrangler.toml --branch <previous>`
2. Confirm restored state via dashboard and D1 checks
3. Review logs to ensure rollback completed without errors

### Monitoring

- Monitor Workers logs for error-level entries and structured warnings
- Track D1 row counts for flights, reschedules, and snapshots to ensure cron is running
- Use dashboard activity feed to spot anomalies in auto-reschedule or advisory frequency
