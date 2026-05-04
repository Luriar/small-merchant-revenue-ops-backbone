# M2-9B Rollback SQL Review

## Purpose

Reviews `infra/sql/aurora/m2_4_dlq_replay_metadata_rollback.sql` before any M2-9B SQL apply executes. The review is a precondition: rollback must be prepared and approved before apply.

## Rollback Ownership

- Rollback owner: Yoon Joonho
- Cleanup owner: Yoon Joonho
- Target environment: **dev only**, specifically `product-ops-dev-aurora`. Production is rejected.

## Rollback File

- Path: `infra/sql/aurora/m2_4_dlq_replay_metadata_rollback.sql`
- Authority: M2-9A GO record at `docs/m2_9a_sql_apply_go_no_go_decision_kr.md`.
- Confirmation that rollback was prepared before apply: **yes**, the rollback file and this review doc were created in M2-9B Phase 1, before any apply attempt.

## Rollback Scope

Rollback drops only the schema objects created by `infra/sql/aurora/m2_4_dlq_replay_metadata.sql`. It is intentionally narrow.

### Objects Affected

- `public.cdc_failure_state_log` (table)
- `public.cdc_replay_request` (table)
- `public.cdc_failure` (table)
- All ten M2-4 indexes (auto-drop with their parent tables):
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
- All fifteen M2-4 inline constraints (auto-drop with their parent tables):
  - `chk_cdc_failure_op`
  - `chk_cdc_failure_attempt_count`
  - `chk_cdc_failure_status`
  - `chk_cdc_failure_primary_key_object`
  - `chk_cdc_failure_observed_fields_array`
  - `chk_cdc_failure_missing_fields_array`
  - `chk_cdc_failure_unexpected_fields_array`
  - `chk_cdc_failure_forbidden_fields_array`
  - `chk_cdc_replay_action`
  - `chk_cdc_replay_attempt_count`
  - `chk_cdc_replay_status`
  - `chk_cdc_replay_cleanup_status`
  - `chk_cdc_replay_bounded_scope_object`
  - `uq_cdc_replay_idempotency_key`
  - `chk_cdc_failure_state_safe_metadata_object`

### Objects Not Affected

- `public.run` and all earlier numbered migrations (`001_change_intake_idempotency.sql` through `005_run_state_log_insert_bootstrap.sql`)
- All M2-1 logical replication objects (`m2_1_logical_replication_prereq_check.sql`, `m2_1_traceability_publication.sql`)
- Any non-M2-4 tables, sequences, views, or extensions
- Database, role, schema, or server configuration

## Drop Order Justification

The three M2-4 tables form a foreign-key chain:

- `public.cdc_failure_state_log` → references `public.cdc_failure` and `public.cdc_replay_request`
- `public.cdc_replay_request` → references `public.cdc_failure`
- `public.cdc_failure` → references `public.run` (external; not affected by rollback)

Drops therefore proceed in reverse FK dependency order:

1. `DROP TABLE IF EXISTS public.cdc_failure_state_log;`
2. `DROP TABLE IF EXISTS public.cdc_replay_request;`
3. `DROP TABLE IF EXISTS public.cdc_failure;`

`CASCADE` is intentionally **not** used. If an unexpected external object references one of these tables, the drop will surface a clear error rather than silently cascade-dropping unrelated state. Inline constraints and `CREATE INDEX`-defined indexes auto-drop with their parent tables in PostgreSQL.

## Transaction Wrapping

The rollback is wrapped in a single `BEGIN; ... COMMIT;` block. PostgreSQL supports transactional DDL, so a mid-rollback failure aborts cleanly without leaving the schema half-rolled-back.

## Idempotency

Every `DROP TABLE` uses `IF EXISTS`. Re-running the rollback after success or after a partial-apply scenario is safe:

- 0 of 3 tables present (apply never ran or failed at first table) → all three drops are no-ops; transaction commits.
- 1 of 3 tables present (`cdc_failure` only) → first two drops are no-ops; third drops `cdc_failure`.
- 2 of 3 tables present (`cdc_failure`, `cdc_replay_request`) → first drop is no-op; remaining two drop in dependency order.
- 3 of 3 tables present (apply succeeded) → all three drops execute; indexes and constraints auto-drop with their parents.

## Rollback Preconditions

Rollback may execute only if **all** of the following hold:

1. The target is confirmed `product-ops-dev-aurora` (dev only). Not production. Not staging. Not ambiguous.
2. M2-9B SQL apply has been attempted and either failed in a way that requires recovery, or completed but post-apply schema verification surfaced a defect that the rollback owner approves rolling back.
3. The rollback owner (Yoon Joonho) explicitly approves running the rollback for the specific failure or defect observed.
4. No external workload is currently writing to the M2-4 tables (M2-9C runtime dry-run has not been entered, so this should be trivially true after a failed M2-9B).
5. No production indicator is present (no `prod`, `production`, or production-account label appears in the connection target).

## Rollback No-Go Conditions

Do **not** run rollback if any of the following hold:

- Target is production, staging, or ambiguous.
- Target is `product-ops-dev-aurora` but the rollback owner has not approved rollback for the specific observed failure.
- M2-9B SQL apply has not yet been attempted in the current task. Rollback is not a "clean before apply" tool — apply uses `IF NOT EXISTS` and is itself idempotent.
- M2-9C runtime dry-run is in progress or has run and produced rows that the cleanup owner has not yet retired. Rolling back tables that hold dry-run rows would lose evidence required for the M2-9C report.
- Any external table outside the M2-4 set is suspected of holding a foreign key into the M2-4 tables. The rollback's lack of `CASCADE` will surface this; the operator must triage rather than retry with `CASCADE`.

## Confirmation That Rollback Was Not Executed In M2-9B Unless Required

This M2-9B task does **not** execute the rollback by default. Rollback executes only if SQL apply fails and the rollback owner approves. In the planned-success path, `infra/sql/aurora/m2_4_dlq_replay_metadata_rollback.sql` is created and reviewed but never run; M2-9C cleanup uses bounded sample-cleanup, not full schema rollback.

## Forbidden Content Statement

This document and the rollback SQL deliberately omit:

- DB URLs and connection strings
- hostnames, IP addresses, ports
- IAM role ARNs and AWS account identifiers
- credentials, tokens, passwords, secret references
- raw payload values, full message bodies, issue raw values, prod_change payload or actor values
- stack traces, SQL error internals, persistence internals

## Cross-References

- Rollback SQL: `infra/sql/aurora/m2_4_dlq_replay_metadata_rollback.sql`
- M2-4 forward SQL: `infra/sql/aurora/m2_4_dlq_replay_metadata.sql`
- M2-9A GO master: `docs/m2_9a_live_db_preflight_go_evidence_kr.md`
- M2-9A GO/NO-GO decision: `docs/m2_9a_sql_apply_go_no_go_decision_kr.md`
- M2-9A schema inspection report: `docs/m2_9a_schema_inspection_report_kr.md`
- M2-9A rollback plan (gate-level): `docs/m2_9a_rollback_plan_kr.md`
- M2-9B next-task prompt: `docs/m2_9b_next_sql_apply_prompt_kr.md`
