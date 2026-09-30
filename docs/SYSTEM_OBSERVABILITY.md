# Lot Logic System Observability

## Purpose

This layer gives Lot Logic an internal technical command center without requiring an external observability vendor. It is intentionally separate from operational Inventory analytics.

The initial implementation provides:

- Admin → System Health
- application/dependency readiness checks
- Supabase response latency
- recent evaluation volume
- error/warning counts
- technical event tracing
- a best-effort server telemetry writer
- trace IDs for instrumented operations
- a Supabase migration for durable `system_events`

## Current instrumentation

Initial events are emitted for:

- evaluation saves
- MarketCheck comp searches

Telemetry is deliberately best-effort. A telemetry failure must never block an evaluator, inventory, or partner workflow.

## Database activation

The code works safely before the observability migration is applied. The System Health page will show Event Trace as not configured and continue showing the checks that do not depend on `system_events`.

Migration:

`supabase/migrations/20260924000100_system_observability.sql`

Applying that migration is the only database activation step required for the internal event trace.

## External services deferred

No external signup is required for this branch.

A later pass can connect:

- Sentry for exceptions, frontend errors, release tracking, and performance traces
- Netlify deploy/function telemetry
- richer Supabase platform metrics

The internal `system_events` model remains useful even after those services are connected because it records Lot Logic domain events that generic observability tools do not understand.

## Next instrumentation targets

Recommended next targets after the foundation is verified:

1. VIN decode
2. AI evaluation summary and condition analysis
3. evaluator run-level trace propagation from the browser so VIN → comps → AI → save share one trace ID
4. inventory automation/work-order transitions
5. notification delivery
6. external dependency failures/retries
