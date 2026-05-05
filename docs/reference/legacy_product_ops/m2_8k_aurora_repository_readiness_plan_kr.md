# M2-8K Aurora Repository Readiness Plan

## Current Boundary

Current route wiring still uses the in-memory/stub repository. Aurora repository is not implemented.

## Required Readiness Gates

- SQL migration review
- rollback plan
- transaction boundary review
- idempotency lookup and conflict handling review
- state log append-only review
- original failure immutable review
- original run immutable review
- safe DTO projection review
- persistence error redaction review
- controlled runtime dry-run gate

## Repository Contract Areas

Future Aurora repository work must implement the M2-6 repository contract while preserving:

- safe list/get metadata only
- idempotency duplicate and idempotency conflict behavior
- invalid state transition behavior
- approve/cancel transitions
- `linkNewRunId` as future worker-only
- append-only state log behavior
- immutable original failure/run references

## Stop Conditions

- real DB queries before the repository task is explicitly approved
- Aurora connection before migration and rollback gates pass
- SQL apply before migration gate passes
- direct Aurora repository implementation during planning
- external infrastructure commands
- raw payloads
- full message bodies
- issue raw values
- prod_change payload/actor values
- stack traces
- SQL details
- persistence internals

## Explicit Forbidden Scope

M2-8K planning does not implement real DB queries, does not connect to Aurora, does not apply SQL, does not implement direct Aurora repository, and does not run external infrastructure commands.
