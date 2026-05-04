# M2-9A Live DB Preflight Gate

## Purpose

M2-9A records the live DB preflight gate before SQL apply or controlled runtime dry-run.

## Current Decision

Decision: NO-GO for SQL apply and runtime dry-run.

Reason: no explicit dev/staging/non-production DB target, connection evidence, current schema inspection, cleanup owner, bounded runtime sample plan, or bounded time-window was provided in the task context.

## Required Preflight Evidence

- target explicitly confirmed dev/staging/non-production
- current schema state captured by read-only inspection
- migration target tables absent/present status recorded
- migration idempotency reviewed
- rollback strategy ready
- verification queries ready
- expected table list recorded
- expected indexes/constraints recorded
- user/role permission boundary recorded
- no production markers
- bounded runtime sample plan
- evidence_report_ref plan
- cleanup owner
- no-go conditions reviewed

## Expected Tables

- `public.cdc_failure`
- `public.cdc_replay_request`
- `public.cdc_failure_state_log`

## Expected Indexes/Constraints

- `idx_cdc_failure_status`
- `idx_cdc_failure_type`
- `idx_cdc_failure_source_topic`
- `idx_cdc_failure_owner`
- `idx_cdc_failure_first_seen_at`
- `idx_cdc_replay_failure`
- `idx_cdc_replay_status`
- `idx_cdc_replay_owner`
- `idx_cdc_replay_idempotency_key`
- `idx_cdc_failure_state_log_failure`
- `uq_cdc_replay_idempotency_key`

## Verification Queries

Verification queries must be prepared before apply and must be read-only. They should check table existence, index existence, constraints, current database, current user, and current schema.

## Stop Conditions

Stop if target DB is production or ambiguous, rollback plan is missing, verification query is missing, sample-count is unbounded, time-window is unbounded, evidence_report_ref is missing, cleanup owner is missing, tests fail, or global safety fails.

## Boundary

M2-9A does not apply SQL. M2-9A does not run real DB queries without explicit dev/staging confirmation. M2-9A does not run external infrastructure commands.
