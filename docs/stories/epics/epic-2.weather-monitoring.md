# Epic 2: Weather Monitoring & Classification

**Epic ID:** EPIC-2
**Epic Name:** Weather Monitoring & Classification
**Status:** Planned
**Priority:** High
**Owner:** Development Team

## Epic Description

Implement automated weather data ingestion from WeatherAPI.com, persistence of weather snapshots, and threshold-based classification of flights as clear, advisory, or requiring auto-rescheduling. This epic delivers the core detection capability that triggers all downstream rescheduling actions.

## Business Value

Enables proactive identification of weather-impacted flights with 95%+ detection accuracy, reducing manual monitoring burden and ensuring no high-severity events are missed within the 72-hour critical window.

## Success Criteria

- Cron worker successfully polls WeatherAPI.com hourly for all upcoming flights
- Weather data covers departure, arrival, and corridor checkpoints
- Snapshots are persisted in D1 with correlation IDs and forecast metadata
- Threshold engine correctly classifies flights using training-level rules
- <5-minute lag between forecast update and classification
- Weather API failures fall back to cached data with staleness warnings

## Functional Requirements Alignment

- **FR1 – Weather Monitoring & Classification** (primary)
- Supports FR7 (Observability) through logging of API calls and errors

## Stories

1. **2.1** - Weather API Integration & Caching
2. **2.2** - Threshold Engine & Flight Classification
3. **2.3** - Weather Snapshot Persistence & Retrieval

## Dependencies

- Epic 1 (Foundation) must be complete
- D1 schema with `weather_snapshots` and `training_thresholds` tables
- Service layer architecture from Epic 1

## Acceptance Criteria

1. WeatherAPI.com client includes ETag support and exponential backoff
2. Weather requests cover all flights within 7-day horizon
3. Weather snapshots stored with timestamp, correlation ID, forecast metadata, and confidence horizon
4. Training thresholds loaded from D1 seed data (student, private, instrument levels)
5. Threshold engine marks flights as `clear`, `advisory`, or `auto-reschedule` based on weather severity and time horizon
6. Flights <72 hours with threshold breaches trigger auto-reschedule pipeline
7. Flights ≥72 hours with threshold breaches receive advisory status
8. API failures log incidents and use most recent cached snapshot
9. Dashboard displays weather status for each flight with severity indicators

## Technical Notes

- WeatherAPI.com endpoint: `/v1/forecast.json`
- Checkpoints: departure airport, arrival airport, corridor waypoints
- Confidence horizon derived from forecast metadata
- Cache in D1 `weather_snapshots` table (optional KV for short-term reuse)
- Training thresholds define max wind speed, visibility minimums, ceiling minimums per level
- Weather API key stored in Workers secrets
