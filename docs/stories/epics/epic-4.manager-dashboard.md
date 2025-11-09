# Epic 4: Manager Dashboard & User Interface

**Epic ID:** EPIC-4
**Epic Name:** Manager Dashboard & User Interface
**Status:** Planned
**Priority:** High
**Owner:** Development Team

## Epic Description

Deliver the React-based manager dashboard with Shadcn UI components that provides real-time visibility into flight status, weather alerts, AI-generated reschedule suggestions, notification feed, and manual testing controls.

## Business Value

Enables staff to review and act on all active conflicts in ≤2 minutes through a single-pane interface, maintaining human oversight while leveraging automation. Manual testing controls de-risk development and deployment by allowing verification without waiting for cron cycles.

## Success Criteria

- Dashboard loads and renders within 300ms on warm cache
- Flight status board shows all upcoming flights with status badges
- Weather timeline visualizes forecast confidence and severity windows
- Reschedule suggestions display AI-ranked options with rationale
- Notification tray surfaces recent auto actions and advisories
- Manual controls successfully trigger weather poll, rescheduler, and data seeding
- Dashboard reflects updates without full-page reload
- Keyboard navigation and WCAG AA contrast compliance

## Functional Requirements Alignment

- **FR4 – Dashboard Experience** (primary)
- **FR6 – Notifications & Messaging** (notification tray)
- Supports FR1 (Weather Monitoring) through weather timeline visualization
- Supports FR2 (Rescheduling) through suggestion cards and action controls

## Stories

1. **4.1** - Dashboard Layout & Navigation Shell
2. **4.2** - Flight Status Board Component
3. **4.3** - Weather Timeline Visualization
4. **4.4** - Reschedule Suggestions & Action Controls
5. **4.5** - Notification Tray & In-App Alerts
6. **4.6** - Manual Testing Controls

## Dependencies

- Epic 1 (Foundation) RPC bridge must be functional
- Epic 2 (Weather Monitoring) provides weather status data
- Epic 3 (AI Rescheduling) provides reschedule suggestions
- Shadcn UI components initialized (`button`, `card`, `table`, `toast`)
- Tailwind CSS configured with design tokens

## Acceptance Criteria

1. React 18 dashboard bootstrapped with `src/dashboard/main.tsx` entry point
2. Shadcn UI components imported and themed with Tailwind
3. RPC hook (`useRpc`) enables dashboard to call Worker methods
4. Flight Status Board displays upcoming flights with status badges (clear, advisory, auto-reschedule, rescheduled)
5. Each flight card shows departure/arrival times, instructor, aircraft, and weather severity
6. Weather Timeline renders severity bands and confidence windows for selected flight
7. Reschedule Suggestions component displays AI-ranked options with rationale
8. Accept/reject controls update flight status and persist decision via RPC
9. Notification Tray shows toast-style feed of recent actions with timestamps
10. Notifications include status labels (`auto-rescheduled`, `advisory`, `action required`)
11. Manual Testing Controls provide buttons for seed data, weather poll, and rescheduler triggers
12. Dashboard state updates via client-side state management (no full reload)
13. Keyboard navigation functional for all interactive components
14. Color contrast meets WCAG AA requirements

## Technical Notes

- React 18 with functional components and hooks
- Shadcn UI components: Button, Card, Table, Toast, Timeline (custom)
- Tailwind CSS 3.x for styling
- RPC client hook makes typed calls to Worker methods
- Vite bundles dashboard assets and Worker serves from static manifest
- Dashboard route: `/` (Worker fetch handler)
- No authentication layer in MVP (trusted environment)
