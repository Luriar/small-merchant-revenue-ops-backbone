# M2-9A Schema Inspection Report

## Scope

Sanitized read-only preflight inspection results captured by the human operator against the dev target labeled `product-ops-dev-aurora`. The inspection used read-only SQL only — no DDL, no DML, no writes, no SQL apply. This report records the operator-supplied sanitized output. Claude did not connect to any DB.

## Identity (Sanitized)

- current_database safe label: **productops**
- current_user safe label: **postgres**
- current_schema safe label: **public**
- server/version safe summary: **PostgreSQL 15.17**

No DB URL, hostname, port, IAM ARN, credential, token, or password is recorded. The full `version()` banner was stripped to its safe `PostgreSQL 15.17` summary.

## Inspection Provenance

- inspection command run by human operator: yes
- inspection was read-only: yes
- inspection target: `product-ops-dev-aurora` (dev only, non-production)
- inspection user role: `postgres` (sanitized observed user)
- migration owner role for M2-9B (separate task): `app_migration_dev_role`

## Table Existence

| Table | Status |
| --- | --- |
| `public.cdc_failure` | missing |
| `public.cdc_replay_request` | missing |
| `public.cdc_failure_state_log` | missing |

All three expected CDC replay metadata tables are **missing**. This is the expected pre-apply state for a target that has never had `infra/sql/aurora/m2_4_dlq_replay_metadata.sql` applied.

## Index Existence Summary

- **0 of 10 expected indexes present.**

Expected indexes (all currently missing on the dev target):

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

## Constraint Existence Summary

- **0 of 15 expected constraints present.**

Expected constraints (all currently missing on the dev target):

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

## Interpretation

The dev target has never had the M2-4 DLQ replay metadata schema applied. The pre-apply state is consistent across tables, indexes, and constraints — none of the expected objects exist. M2-9B SQL apply is the next task that creates them. M2-9B must rerun this exact inspection set after apply to confirm post-apply parity.

## Boundary Statements

- SQL apply has not been performed in M2-9A.
- Runtime dry-run has not been executed in M2-9A.
- No production DB was used.
- No write query was executed.
- No DB URL, connection string, secret, token, password, raw payload, full message body, issue raw value, or prod_change payload/actor value is recorded.
- The M2-4 DLQ replay metadata SQL file remains marked `PROPOSAL ONLY - DO NOT APPLY AUTOMATICALLY`.

## Cross-References

- Master GO evidence: `docs/m2_9a_live_db_preflight_go_evidence_kr.md`
- Target identity: `docs/m2_9a_live_db_target_evidence_kr.md`
- GO/NO-GO decision: `docs/m2_9a_sql_apply_go_no_go_decision_kr.md`
- Runtime dry-run bounds: `docs/m2_9a_runtime_dry_run_bounds_kr.md`
