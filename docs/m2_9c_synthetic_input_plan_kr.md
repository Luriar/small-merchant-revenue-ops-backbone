# M2-9C Synthetic Input Plan

## Purpose

Records the bounded synthetic input the M2-9C controlled runtime dry-run uses against the confirmed dev target `product-ops-dev-aurora`. Pairs with `docs/m2_9c_runtime_feasibility_check_kr.md` and `scripts/m2_9c_dry_run.js`.

## Bounds

- Sample-count: **1** (one synthetic `cdc_failure`, one resulting `cdc_replay_request`, multiple state-log rows append-only against the single sample).
- Time-window: **10 minutes** wall-clock. Enforced by a watchdog in the operator script.
- Target: confirmed dev target only (`product-ops-dev-aurora`). No production. No staging.
- Cleanup: bounded by the synthetic `failure_id` only. No unrelated rows touched.

## Synthetic ID Patterns

Every generated identifier is clearly synthetic and dev-only. The script uses millisecond timestamps to keep ids unique across reruns.

| ID | Pattern | Example label only (no real value generated yet) |
| --- | --- | --- |
| `failure_id` | `m2_9c_dryrun_<ts>_failure` | `m2_9c_dryrun_<ts>_failure` |
| `replay_request_id` | derived by repository: `cdc_replay_req_<sanitized idempotency_key>` | `cdc_replay_req_m2_9c_dryrun_<ts>_idem` |
| `idempotency_key` | `m2_9c_dryrun_<ts>_idem` | `m2_9c_dryrun_<ts>_idem` |
| `evidence_report_ref` | fixed | `docs/runtime_evidence/m2_9_dev_dry_run_20260504.md` |

The `<ts>` suffix is the script's `Date.now()` value. No external timestamp source. No production-derived value.

## Synthetic `cdc_failure` Row

The script seeds one row with these safe field-name values only:

| Column | Value | Note |
| --- | --- | --- |
| `failure_id` | `m2_9c_dryrun_<ts>_failure` | synthetic |
| `failure_type` | `unknown_field` | safe class label |
| `source_topic` | `dev_topic_synthetic` | safe label |
| `source_table` | `dev_table_synthetic` | safe label |
| `primary_key` | `{"id": "dev_pk_synthetic"}` | JSONB object, safe label only |
| `op` | `u` | passes `chk_cdc_failure_op` |
| `ts_ms` | `<Date.now()>` | numeric only |
| `observed_field_names` | `[]` | JSONB array |
| `missing_required_fields` | `[]` | JSONB array |
| `unexpected_fields` | `[]` | JSONB array |
| `forbidden_field_names_detected` | `[]` | JSONB array |
| `parser_error_class` | `dev_synthetic_class` | safe label |
| `parser_error_summary` | `dev synthetic dry-run failure` | safe summary |
| `first_seen_at` | `NOW()` | clock |
| `last_seen_at` | `NOW()` | clock |
| `attempt_count` | `1` | small integer |
| `status` | `open` | passes `chk_cdc_failure_status` |
| `owner` | `Yoon Joonho` | dev owner label |
| `evidence_report_ref` | `docs/runtime_evidence/m2_9_dev_dry_run_20260504.md` | safe ref |
| `source_run_id` | `NULL` | nullable; no upstream `public.run` row needed |

No raw payload, full message body, issue raw value, or prod_change payload/actor value appears in any of these fields.

## Synthetic `cdc_replay_request` Row

Created by the repository call `createReplayRequest(...)` with these inputs:

| Repository input field | Value | Note |
| --- | --- | --- |
| `failure_id` | the seeded synthetic `failure_id` | FK satisfied |
| `requested_action` | `replay` | passes `chk_cdc_replay_action` |
| `requester_ref` / `owner` | `Yoon Joonho` | dev owner |
| `reason_summary` | `M2-9C dry-run synthetic` | safe label |
| `bounded_scope` | `{"sample_count": 1, "time_window_minutes": 10, "environment": "dev"}` | JSONB object; passes `chk_cdc_replay_bounded_scope_object` |
| `idempotency_key` | `m2_9c_dryrun_<ts>_idem` | synthetic; uniqueness verified by script |
| `evidence_report_ref` | `docs/runtime_evidence/m2_9_dev_dry_run_20260504.md` | safe ref |
| `source_run_id` | `NULL` | nullable |

The repository derives `replay_request_id` as `cdc_replay_req_<sanitized idempotency_key>` (see `buildReplayRequestId` in the repository).

## Intended Transition Sequence

The dry-run exercises the following ordered sequence against the single synthetic sample:

1. **Seed** synthetic `cdc_failure` row (status `open`).
2. **`createReplayRequest`** — inserts one `cdc_replay_request` (status `requested`).
3. **`findReplayRequestByIdempotencyKey`** — returns the just-created row (idempotency duplicate behavior).
4. **`createReplayRequest` again with the same `idempotency_key`** — must throw `CdcRecoveryPersistenceError` due to `uq_cdc_replay_idempotency_key` unique-constraint violation (idempotency conflict behavior). The script catches and confirms the safe error class only; no SQL internals or stack traces are recorded.
5. **`appendFailureStateLog`** — inserts one row recording `from_status=open → to_status=replay_requested` with `reason_code=m2_9c_dryrun_transition`.
6. **`updateFailureStatus`** valid transition — `from_status=open, to_status=replay_requested` succeeds and returns the updated row.
7. **`updateFailureStatus`** invalid transition — `from_status=open` (no longer matches; current is `replay_requested`) returns `null` (UPDATE affects 0 rows). Confirms the from_status guard rejects invalid transitions.
8. **`updateReplayRequestStatus`** valid transition — `from_status=requested, to_status=approved` succeeds; `approved_at` is set.
9. **`updateReplayRequestStatus`** invalid transition — `from_status=requested` (no longer matches; current is `approved`) returns `null`. Confirms guard.
10. **Cleanup** — `DELETE FROM public.cdc_failure WHERE failure_id = $1` cascades to the replay request and state log rows.
11. **Post-cleanup count** — all three M2-4 tables show 0 rows for the synthetic `failure_id`.

## Cleanup Query Plan (Bounded)

```sql
-- Cleanup: bounded by the synthetic failure_id only.
DELETE FROM public.cdc_failure WHERE failure_id = $1;

-- Verification (read-only):
SELECT
  (SELECT count(*)::int FROM public.cdc_failure          WHERE failure_id = $1) AS f,
  (SELECT count(*)::int FROM public.cdc_replay_request   WHERE failure_id = $1) AS rr,
  (SELECT count(*)::int FROM public.cdc_failure_state_log WHERE failure_id = $1) AS sl;
```

Expected post-cleanup counts: `f=0, rr=0, sl=0`. The cascading deletes from the FK definitions remove the dependent rows in the same operation. No `public.run` row is touched (none was created). No unrelated rows are touched.

## Exact No-Go Conditions

- Pre-state row count for the synthetic `failure_id` is non-zero before seed.
- The connection target's `current_database()` contains `prod` (the script aborts).
- The script cannot connect through the operator's authorized dev path.
- The watchdog fires (10-minute time-window exceeded).
- M2-9B schema verification re-check (using the corrected query from `docs/m2_9b_schema_verification_report_kr.md`) reports a missing table, index, or named constraint.
- Any step throws an error other than the expected idempotency-conflict throw at step 4.
- Cleanup leaves any non-zero count for the synthetic `failure_id`.

If any no-go condition fires, the operator must paste back the **safe failure summary** rather than fabricated success. The next session will then create `docs/m2_9c_runtime_dry_run_failed_repair_prompt_kr.md` instead of evidence docs.

## Operator Command Packet

The operator runs:

```bash
# In the repo root, with PG* env vars (or DATABASE_URL) configured for the dev target.
node scripts/m2_9c_dry_run.js
```

The script prints a sanitized JSON summary on success, or a sanitized failure JSON on error. Paste the JSON output back into the next M2-9C task. Do not paste shell stderr containing connection details, hostnames, or psql noise.

## Sanitized Result Template To Paste Back

```json
{
  "target_safe_label": "product-ops-dev-aurora",
  "sample_count": 1,
  "time_window_minutes": 10,
  "evidence_report_ref": "docs/runtime_evidence/m2_9_dev_dry_run_20260504.md",
  "identity_safe_summary": {
    "db": "productops",
    "usr": "<postgres or app_migration_dev_role>",
    "sch": "public"
  },
  "pre_state_counts_for_synthetic_id": { "f": 0, "rr": 0, "sl": 0 },
  "steps": {
    "seed_synthetic_failure": { "ok": true },
    "create_replay_request": { "ok": true, "observed_status": "requested", "observed_cleanup_status": "not_started", "replay_request_id_present": true, "response_field_count": 21 },
    "idempotency_duplicate_lookup": { "ok": true, "same_replay_request_id": true },
    "idempotency_conflict_rejected": { "ok": true, "safe_class": { "mapped": "CdcRecoveryPersistenceError", "code": "internal_error", "statusCode": 500 } },
    "state_log_appended": { "ok": true, "from_status": "open", "to_status": "replay_requested", "state_log_id_present": true },
    "valid_failure_transition": { "ok": true, "observed_status": "replay_requested" },
    "invalid_failure_transition_rejected": { "ok": true, "result_was_null": true },
    "valid_replay_request_transition": { "ok": true, "observed_status": "approved", "approved_at_present": true },
    "invalid_replay_request_transition_rejected": { "ok": true, "result_was_null": true }
  },
  "cleanup": {
    "failure_rows_deleted": 1,
    "post_state_counts_for_synthetic_id": { "f": 0, "rr": 0, "sl": 0 },
    "cleanup_complete": true
  },
  "timing": { "elapsed_ms": "<short integer>", "within_bound": true }
}
```

The exact integer values (timing, counts) will reflect the live run. Do not edit booleans or status labels — paste them as observed.

## Boundary Confirmations

- No production DB will be accessed.
- No raw payload, full message body, issue raw value, or prod_change payload/actor value is generated or written.
- No Kafka, Debezium, ClickHouse, full pipeline, worker loop, or external infrastructure command is involved.
- No DB URL, hostname, port, IAM ARN, AWS account ID, credential, token, or password is recorded.
- Sample-count remains 1. Time-window remains 10 minutes.
- Cleanup is bounded by the single synthetic `failure_id`. Schema is not dropped or rolled back.

## Cross-References

- Feasibility check: `docs/m2_9c_runtime_feasibility_check_kr.md`
- Operator dry-run script: `scripts/m2_9c_dry_run.js`
- M2-9B schema verification report: `docs/m2_9b_schema_verification_report_kr.md`
- M2-9C next-task prompt: `docs/m2_9c_next_controlled_runtime_dry_run_prompt_kr.md`
- Aurora repository: `apps/api/src/cdc-recovery/cdc-recovery-aurora-repository.js`
- State transition matrix: `docs/m2_replay_state_transition_matrix_kr.md`
