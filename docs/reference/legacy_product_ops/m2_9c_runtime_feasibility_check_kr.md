# M2-9C Runtime Feasibility Check

## Purpose

Records whether a controlled runtime dry-run can safely run against the confirmed dev target before any synthetic row is written. Pairs with `docs/m2_9c_synthetic_input_plan_kr.md` and the operator script at `scripts/m2_9c_dry_run.js`.

## Inputs Verified

- M2-9A GO record present and validator green (`docs/m2_9a_live_db_preflight_go_evidence_kr.md`, `npm run validate:m2-9a:live-db-go` 64/0).
- M2-9B SQL apply complete and validator green (`docs/m2_9b_sql_apply_evidence_kr.md`, `npm run validate:m2-9b:sql-apply-evidence` 97/0). Schema: 3/3 tables, 10/10 named indexes, 15/15 named constraints, plus 9 expected implicit PK/FK constraints; total 24.
- Phase 0 baseline rerun (2026-05-04): all M2-8O / M2-8N / M2-8M / M2-9A / M2-9B / global safety validators green; `git diff --check` exit 0.
- Bounds intact: sample-count 1, time-window 10 minutes, evidence_report_ref `docs/runtime_evidence/m2_9_dev_dry_run_20260504.md`, cleanup owner Yoon Joonho, rollback owner Yoon Joonho.

## Required Columns Summary

### `public.cdc_failure`

Required (NOT NULL): `failure_id`, `failure_type`, `source_topic`, `source_table`, `op`, `ts_ms`, `parser_error_class`, `parser_error_summary`, `first_seen_at`, `last_seen_at`, `status`, `owner`, `evidence_report_ref`.

Defaulted (NOT NULL with DEFAULT): `primary_key '{}'::jsonb`, `observed_field_names '[]'::jsonb`, `missing_required_fields '[]'::jsonb`, `unexpected_fields '[]'::jsonb`, `forbidden_field_names_detected '[]'::jsonb`, `attempt_count 1`, `created_at NOW()`, `updated_at NOW()`.

Nullable: `source_run_id`, `latest_replay_request_id`.

### `public.cdc_replay_request`

Required (NOT NULL): `replay_request_id`, `failure_id`, `requested_action`, `requested_by`, `owner`, `reason_summary`, `idempotency_key`, `evidence_report_ref`.

Defaulted: `bounded_scope '{}'::jsonb`, `attempt_count 0`, `status 'requested'`, `cleanup_status 'not_started'`, `requested_at NOW()`, `created_at NOW()`, `updated_at NOW()`.

Nullable: `target_topic`, `target_table`, `source_run_id`, `new_run_id`, `approved_at`, `completed_at`.

### `public.cdc_failure_state_log`

Required (NOT NULL): `failure_id`, `to_status`, `reason_code`, `owner`. `state_log_id` is `BIGSERIAL` (auto). `safe_metadata '{}'::jsonb` defaulted.

Nullable: `replay_request_id`, `from_status`, `evidence_report_ref`.

## Foreign-Key Dependency Summary

- `cdc_failure.source_run_id → public.run(run_id) ON DELETE SET NULL` — **NULLABLE**. No synthetic upstream `run` row is required.
- `cdc_replay_request.failure_id → public.cdc_failure(failure_id) ON DELETE CASCADE` — must be seeded first; cascades on cleanup.
- `cdc_replay_request.source_run_id → public.run(run_id) ON DELETE SET NULL` — **NULLABLE**.
- `cdc_replay_request.new_run_id → public.run(run_id) ON DELETE SET NULL` — **NULLABLE**.
- `cdc_failure_state_log.failure_id → public.cdc_failure(failure_id) ON DELETE CASCADE` — cascades on cleanup.
- `cdc_failure_state_log.replay_request_id → public.cdc_replay_request(replay_request_id) ON DELETE SET NULL` — replay_request rows cascade-delete from cdc_failure delete, so this fires after.

**Conclusion:** No synthetic upstream `public.run` row is needed. All three M2-4 FKs to `public.run` are nullable. The synthetic input plan can leave `source_run_id` and `new_run_id` as `NULL` and still satisfy all constraints.

## Repository / Service Reachability

- The M2-8O Aurora repository (`apps/api/src/cdc-recovery/cdc-recovery-aurora-repository.js`) takes an injected `db` client with `query(text, values)` and optionally `withTransaction(work)`. A `pg.Client` satisfies the first; a thin adapter satisfies the second.
- The repository exposes `createReplayRequest`, `findReplayRequestByIdempotencyKey`, `appendFailureStateLog`, `updateFailureStatus`, `updateReplayRequestStatus`, and the relevant read methods. These cover the required dry-run verifications without invoking Kafka, Debezium, ClickHouse, or any worker loop.
- `cdc_failure` rows are produced by upstream CDC parsing in production; the repository deliberately does **not** expose a write method for them. The dry-run must seed one synthetic `cdc_failure` row directly via `INSERT` before exercising the repository.
- The route layer (`apps/api/src/cdc-recovery/cdc-recovery-routes.js`) is currently wired to a stub repository in production (per M2-8I), not the Aurora repository. Wiring the Aurora repository into production routes would require broadening `apps/api/src/server.js`, which is forbidden in M2-9C. Route-level dry-run is therefore not selected.

## Dry-Run Path Selected

**Repository-level controlled dry-run**, executed by the human operator via `scripts/m2_9c_dry_run.js` against the confirmed dev target `product-ops-dev-aurora`. Claude does not connect to the DB.

### Reason

- Prefers repository-level over route-level (per the M2-9C prompt). Route-level would require broadening server.js, which is forbidden.
- Prefers repository-level over SQL-level (per the M2-9C prompt). SQL-level would not exercise the JS code; repository-level does.
- Bounded by sample-count 1 (one synthetic `cdc_failure`, one resulting `cdc_replay_request`, multiple state-log rows are append-only and bounded by transitions of the single sample).
- Bounded by time-window 10 minutes (the operator script enforces a 10-minute watchdog and aborts with a non-zero exit if exceeded).
- All forbidden infrastructure (Kafka, Debezium, ClickHouse, kubectl, Terraform, deployment, replay/reprocess workers) is out of scope.

## Cleanup Plan

After dry-run, cleanup runs in the operator script's `finally` block:

```sql
DELETE FROM public.cdc_failure WHERE failure_id = $1;
```

The `ON DELETE CASCADE` from `cdc_replay_request.failure_id` and `cdc_failure_state_log.failure_id` removes the synthetic replay request and synthetic state-log rows in the same operation. Cleanup is bounded by the single synthetic `failure_id`. No unrelated rows are touched.

Post-cleanup, the script counts rows in all three M2-4 tables filtered to the synthetic `failure_id` and reports each as 0. If any count is non-zero, the cleanup report records it as a blocker; M2-9C cannot mark "passed" while synthetic rows remain.

## No-Go Conditions

The operator must abort the dry-run if any of the following hold:

- target database name contains `prod` (the script aborts on this with an explicit exception)
- the script cannot connect to the dev target via the operator's authorized path
- pre-state row count for the synthetic `failure_id` is non-zero (means an old run left rows behind; investigate and clean before re-running)
- M2-9B schema verification re-check shows a missing table, index, or constraint (run the corrected verification query from `docs/m2_9b_schema_verification_report_kr.md`)
- the watchdog fires (10-minute time-window exceeded); the script aborts and the operator must rerun cleanup separately
- the operator's connection target is not the confirmed dev target

If any no-go condition fires, do not paste fabricated results back. Stop, escalate to the rollback owner, and document the blocker.

## Boundary Confirmations

- No production DB will be accessed by the dry-run.
- No raw payload, full message body, issue raw value, or prod_change payload/actor value is generated or written. The synthetic payload uses only safe field-name labels.
- No Kafka, Debezium, ClickHouse, or full pipeline execution is involved.
- No external infrastructure command (kubectl, Terraform, deployment, AWS write) is involved.
- No DB URL, hostname, port, IAM ARN, AWS account ID, credential, token, or password is recorded in this feasibility doc, in the synthetic input plan, in the operator script, or in any post-run evidence doc.
- Sample-count remains 1. Time-window remains 10 minutes.
- Cleanup is bounded by the single synthetic `failure_id`.

## Cross-References

- Synthetic input plan: `docs/m2_9c_synthetic_input_plan_kr.md`
- Operator dry-run script: `scripts/m2_9c_dry_run.js`
- M2-9C next-task prompt (this task's source prompt): `docs/m2_9c_next_controlled_runtime_dry_run_prompt_kr.md`
- M2-9B schema verification report (with corrected verification query): `docs/m2_9b_schema_verification_report_kr.md`
- M2-9B SQL apply evidence: `docs/m2_9b_sql_apply_evidence_kr.md`
- Aurora repository: `apps/api/src/cdc-recovery/cdc-recovery-aurora-repository.js`
- State transition matrix: `docs/m2_replay_state_transition_matrix_kr.md`
- Error envelope matrix: `docs/m2_error_envelope_redaction_matrix_kr.md`
