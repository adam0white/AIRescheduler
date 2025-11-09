# Epic 5: Cron Automation & Scheduled Execution

**Epic ID:** EPIC-5
**Epic Name:** Cron Automation & Scheduled Execution
**Status:** Planned
**Priority:** Medium
**Owner:** Development Team

## Epic Description

Implement the Workers Cron scheduled handler that orchestrates hourly autonomous execution of the weather polling, threshold classification, and auto-rescheduling pipeline without manual intervention.

## Business Value

Achieves true hands-off automation by continuously monitoring weather and rescheduling flights every hour, ensuring the system responds to forecast updates within the 5-minute SLA without requiring staff to trigger manual refreshes.

## Success Criteria

- Cron trigger executes every hour on schedule `0 * * * *`
- Scheduled handler reuses identical service functions as dashboard controls
- Full pipeline (weather poll + classification + rescheduling) completes within 120 seconds
- Correlation IDs link all operations within a single cron run
- Cron failures are logged and surfaced in dashboard alerts
- Manual testing controls remain functional to verify cron behavior locally

## Functional Requirements Alignment

- Enables autonomous operation for FR1, FR2, FR3 (Weather Monitoring, Rescheduling, Advisory Management)
- Supports FR7 (Observability) through structured logging of cron runs

## Stories

1. **5.1** - Scheduled Handler & Cron Configuration
2. **5.2** - Cron Pipeline Orchestration
3. **5.3** - Cron Error Handling & Alerting

## Dependencies

- Epic 1 (Foundation) Worker entry point must export `scheduled` handler
- Epic 2 (Weather Monitoring) service functions must be available
- Epic 3 (AI Rescheduling) service functions must be available
- `wrangler.toml` cron schedule configured

## Acceptance Criteria

1. Worker entry `src/index.ts` exports `scheduled` handler
2. Cron schedule set to `0 * * * *` in `wrangler.toml`
3. Scheduled handler generates correlation ID for entire run
4. Handler orchestrates: weather poll → threshold classification → auto-reschedule
5. Same service functions used by dashboard manual controls
6. Entire pipeline completes within 120 seconds to prevent overlapping runs
7. Structured logs emit run start, completion, errors, and summary metrics
8. Correlation ID propagates through all service calls and logs
9. Failures logged with actionable error messages
10. Dashboard surfaces cron failures in notification tray
11. Local preview (`npm run dev`) allows manual triggering of scheduled handler
12. Deployed Worker executes cron on hourly schedule without intervention

## Technical Notes

- Cron schedule: `0 * * * *` (top of every hour)
- Correlation ID format: `cron-{timestamp}-{uuid}`
- Timeout threshold: 120 seconds
- Service function orchestration order: weatherPoll → classify flights → autoReschedule
- Logs include run ID, start time, end time, flights processed, reschedules created
- Wrangler dev preview can simulate cron trigger via `wrangler dev --test-scheduled`
