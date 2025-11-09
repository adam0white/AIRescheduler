# AIRescheduler - Project Overview

**Version:** 1.0
**Last Updated:** 2025-11-09
**Project Type:** Greenfield Cloudflare Workers SaaS
**Status:** Initial Setup Phase

---

## Executive Summary

AIRescheduler is a Cloudflare Workers-based SaaS application that automates weather-aware flight lesson scheduling for flight schools. The system continuously monitors weather forecasts, evaluates impact against training-level safety thresholds, and automatically reschedules conflicted flights or raises advisory alerts.

The core innovation combines deterministic weather rules with Workers AI reasoning to generate three vetted alternate lesson slots—complete with rationale—within seconds of identifying risk, giving schedulers confidence to act without manual data analysis.

---

## Business Value

- **Detect and classify ≥95%** of weather conflicts for flights within 72 hours
- **Auto-reschedule ≥70%** of conflicted flights with ≥80% staff acceptance rate
- **Reduce manual monitoring burden** through hourly autonomous execution
- **Maintain safety compliance** with full audit trail of automated decisions
- **Provide single-pane dashboard** for 2-minute conflict resolution

---

## Technical Architecture

### Stack

- **Runtime:** Cloudflare Workers (compatibility date 2024-11-08)
- **Database:** Cloudflare D1 (SQLite)
- **AI:** Workers AI (`@cf/meta/llama-3.1-8b-instruct`)
- **Weather Data:** WeatherAPI.com REST API
- **Frontend:** React 18 + Shadcn UI + Tailwind CSS
- **Build:** Vite 5.x + TypeScript 5.x (strict mode)
- **Deployment:** Wrangler 3.x CLI

### Architecture Patterns

- Single Worker module with dual handlers: `fetch` (dashboard + RPC) and `scheduled` (cron)
- RPC bridge (Zod-validated) connects dashboard to Worker services
- Service layer architecture: pure functions accepting `ExecutionContext` and DTOs
- Structured JSON logging with correlation IDs for all operations
- D1 schema with normalized tables and referential integrity

### Key Components

1. **Weather Monitoring Engine:** Hourly polling of WeatherAPI.com for departure, arrival, and corridor checkpoints
2. **Threshold Classification:** Training-level rules (student, private, instrument) mark flights as clear, advisory, or auto-reschedule
3. **AI Rescheduling Engine:** Workers AI generates three ranked alternate slots with rationale
4. **Manager Dashboard:** React UI with flight board, weather timeline, suggestions, and notifications
5. **Cron Automation:** Autonomous hourly execution orchestrating weather poll → classification → rescheduling

---

## Project Epics

### Epic 1: Foundation & Infrastructure [ACTIVE]
**Priority:** Critical
**Status:** In Progress
**Stories:** 1.1 (Ready for Dev), 1.2 (Draft), 1.3 (Draft), 1.4 (Draft)

Establish Worker runtime, D1 database, RPC bridge, service architecture, and structured logging.

**Key Deliverables:**
- Wrangler configuration with D1 and Workers AI bindings
- D1 schema with 8 tables (students, instructors, aircraft, flights, weather_snapshots, reschedule_actions, training_thresholds, notifications)
- RPC handler routing dashboard calls to service layer
- Structured JSON logging with correlation IDs

### Epic 2: Weather Monitoring & Classification [PLANNED]
**Priority:** High
**Status:** Planned
**Dependencies:** Epic 1 complete

Implement WeatherAPI.com integration, weather snapshot persistence, and threshold-based flight classification.

**Key Deliverables:**
- Weather API client with ETag support and exponential backoff
- Threshold engine using training-level rules
- Weather snapshots stored in D1 with correlation IDs
- Dashboard weather timeline visualization

### Epic 3: AI-Driven Rescheduling Engine [PLANNED]
**Priority:** High
**Status:** Planned
**Dependencies:** Epic 1, Epic 2 complete

Build automated rescheduling with candidate slot generation, Workers AI ranking, and audit trail persistence.

**Key Deliverables:**
- Candidate slot algorithm respecting instructor/aircraft availability
- Workers AI prompt engineering for slot ranking
- Reschedule decision persistence with full audit trail
- Dashboard suggestion cards with accept/reject controls

### Epic 4: Manager Dashboard & User Interface [PLANNED]
**Priority:** High
**Status:** Planned
**Dependencies:** Epic 1 complete (partial), Epic 2 & 3 for full functionality

Deliver React dashboard with Shadcn components for flight status, weather visualization, and manual controls.

**Key Deliverables:**
- Flight status board with badges and action controls
- Weather timeline with severity bands
- Notification tray for auto-actions and advisories
- Manual testing controls (seed data, trigger poll, trigger rescheduler)

### Epic 5: Cron Automation & Scheduled Execution [PLANNED]
**Priority:** Medium
**Status:** Planned
**Dependencies:** Epic 1, 2, 3 complete

Implement Workers Cron scheduled handler for hourly autonomous pipeline execution.

**Key Deliverables:**
- Scheduled handler orchestrating weather → classification → rescheduling
- Cron configuration `0 * * * *` (hourly)
- Error handling and alerting for cron failures
- Pipeline completion within 120-second timeout

---

## Current Status

### Completed Epics
- ✅ **Epic 1: Foundation & Infrastructure** (4/4 stories, 95.75/100 avg quality)
- ✅ **Epic 2: Weather Monitoring & Classification** (3/3 stories, 92.33/100 avg quality)
- ✅ **Epic 3: AI-Driven Rescheduling Engine** (3/3 stories, 95.0/100 avg quality)
- ✅ **Epic 5: Cron Automation & Scheduled Execution** (3/3 stories, 97.5/100 avg quality)

### In Progress
- **Epic 4: Manager Dashboard & User Interface** [Partially Complete - Most features delivered in Epics 1-3]

### System Status
- Weather monitoring: ✅ Operational (cron polling every hour)
- Database: ✅ All migrations applied (0001-0006, including cron_runs table)
- Dashboard: ✅ Fully functional with all components + CronStatusMonitor
- AI Rescheduling: ✅ Operational (candidate generation + Workers AI ranking)
- Audit Trail: ✅ Complete decision persistence and history viewing
- Autonomous Cron: ✅ Operational (hourly pipeline with monitoring)
- Build: ✅ Passing (684.22 KiB / 109.38 KiB gzipped)
- TypeScript: ✅ Zero errors
- Security: ✅ Zero vulnerabilities

### Next Steps
1. Complete Epic 4: Manager Dashboard enhancements (some features already delivered)
2. Apply migration 0006 to remote database
3. Production deployment and monitoring

---

## Development Workflow

### Story States
- **Draft:** Story created, awaiting refinement or approval
- **Ready for Development:** Story approved and ready for dev agent
- **In Progress:** Dev agent actively implementing
- **Review:** Implementation complete, awaiting QA
- **Done:** QA passed, story closed

### Agent Roles
- **Scrum Master (@sm):** Creates and refines stories, manages backlog
- **Developer (@dev):** Implements stories, updates completion notes
- **QA (@qa):** Reviews implementations against acceptance criteria
- **Orchestrator:** Coordinates multi-agent workflows

### Key Locations
- **Stories:** `/docs/stories/`
- **Epics:** `/docs/stories/epics/`
- **PRD:** `/docs/PRD.md`
- **Tech Spec:** `/docs/tech-spec.md`
- **Source:** `/src/`

### Development Commands
- **`npm run dev`** - Start local development server with Wrangler
- **`npm run build`** - Build Worker bundle (dry-run deployment)
- **`npm run build:dashboard`** - Build dashboard static assets with Vite
- **`npm run lint`** - Run TypeScript type checking
- **`npm run types`** - Generate Worker type definitions (creates `worker-configuration.d.ts`)
- **`npm run deploy`** - Deploy Worker to Cloudflare (production)

---

## Success Metrics

### Technical KPIs
- Worker deployment success rate: 100%
- Cron execution completion within 120 seconds: 100%
- RPC call response time <300ms: 95th percentile
- D1 query performance <100ms: 90th percentile

### Business KPIs
- Weather conflict detection accuracy: ≥95%
- Auto-reschedule rate: ≥70%
- Staff acceptance of AI suggestions: ≥80%
- Conflict resolution time: ≤2 minutes
- Forecast lag: <5 minutes

---

## MVP Scope

### Included in MVP
- Hourly weather monitoring for 7-day flight horizon
- Auto-reschedule for flights <72 hours out
- Advisory flags for flights ≥72 hours out
- AI-generated alternate slots (top 3 ranked)
- Manager dashboard with manual controls
- Full audit trail in D1
- Structured logging with correlation IDs

### Post-MVP Growth Features
- Email notifications to students/instructors
- Configurable threshold tuning per school
- Role-based access and authentication
- Metrics dashboard (conflicts, interventions, resolution time)
- SLA monitoring and alerting

### Future Vision
- Two-way calendar integration (Flight Schedule Pro, Google Calendar)
- Student/instructor self-service portals
- Predictive analytics beyond 7-day horizon
- Multi-airport expansion with corridor micro-forecasts

---

## Risk Mitigation

### Technical Risks
- **Weather API downtime:** Fallback to cached snapshots with staleness warnings
- **Workers AI timeout:** 5-second timeout with retry and manual review fallback
- **D1 scaling limits:** Design for 500 active flights; partition by school for multi-tenant
- **Cron overlapping runs:** 120-second pipeline timeout prevents overlap

### Domain Risks
- **Safety compliance:** Maintain audit trail for regulator reviews
- **Instructor certification:** Validate reschedule candidates respect credentials
- **Human oversight:** All auto-reschedules include manual accept/reject controls
- **Weather data integrity:** Schema validation and staleness detection

---

## References

- **PRD:** [docs/PRD.md](mdc:docs/PRD.md)
- **Tech Spec:** [docs/tech-spec.md](mdc:docs/tech-spec.md)
- **Epic 1:** [docs/stories/epics/epic-1.foundation.md](mdc:docs/stories/epics/epic-1.foundation.md)
- **Story 1.1:** [docs/stories/1.1.project-scaffolding.md](mdc:docs/stories/1.1.project-scaffolding.md)

---

_This project overview serves as the single source of truth for orchestrators and agents coordinating AIRescheduler development._
