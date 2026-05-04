# M2-8N Aurora Repository Readiness Gate

## Purpose

This gate defines what must be true before any CDC recovery Aurora repository becomes a live route dependency.

## Gate Requirements

- M2-8M OpenAPI merge completed.
- Proposal patch preserved.
- Mocked repository tests pass before live DB work.
- Repository uses injected DB client only.
- Repository creates no DB client and handles no connection strings.
- Parameterized SQL only.
- Transaction-aware writes.
- Safe metadata projections only.
- Redacted persistence errors only.
- No raw payloads.
- No full message bodies.
- No issue raw values.
- No prod_change payload/actor values.
- No stack traces.
- No SQL details.
- No persistence internals.

## Live Route Boundary

The Aurora repository must not be wired into production CDC routes until M2-9A/M2-9B/M2-9C gates pass. The M2-8I dispatcher remains stub-backed until an explicit later task changes the dependency.

## Required Live DB Preflight

- target explicitly confirmed dev/staging/non-production
- rollback plan exists
- verification queries exist
- expected tables and constraints listed
- migration idempotency reviewed
- bounded sample-count and bounded time-window recorded
- evidence_report_ref and cleanup owner recorded

## Stop Conditions

Stop on production or ambiguous target, missing rollback, missing verification query, failed tests, failed global safety, unsafe SQL exposure, or any unbounded runtime dry-run.
