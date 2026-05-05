# M2-9C Controlled Runtime Dry-Run Evidence

## Decision

Decision: **passed**.

The M2-9C controlled runtime dry-run executed against the confirmed dev target `product-ops-dev-aurora` and verified all required behaviors. Cleanup completed; post-cleanup row counts for the synthetic `failure_id` are 0/0/0 across the three M2-4 tables. Rollback was not needed and was not executed. No production DB was used. No Kafka, Debezium, ClickHouse, or full pipeline was run.

## Target

- Target safe label: `product-ops-dev-aurora`
- Target environment: dev (non-production)
- Identity safe summary observed at runtime:
  - current_database: productops
  - current_user: postgres
  - current_schema: public
- Source of dev classification: `infra/terraform/envs/dev` and operator confirmation, recorded under M2-9A.

## Bounds

- Sample-count: **1** (one synthetic `cdc_failure`, one resulting `cdc_replay_request`, one resulting state-log row).
- Time-window: **10 minutes** wall-clock. Watchdog enforced. Observed elapsed: 671 ms — well within bound.
- evidence_report_ref: `docs/runtime_evidence/m2_9_dev_dry_run_20260504.md`
- Cleanup owner: Yoon Joonho
- Rollback owner: Yoon Joonho

## Execution Path

**Repository-level controlled dry-run** using the M2-8O Aurora repository (`apps/api/src/cdc-recovery/cdc-recovery-aurora-repository.js`). The operator ran `scripts/m2_9c_dry_run.js` from the authorized dev path. The script wired a `pg.Client` through a thin transactional adapter into the M2-8O repository constructor.

Route-level execution and SQL-level-only execution were not selected:

- Route-level was rejected because wiring the Aurora repository into production routes would require broadening `apps/api/src/server.js`, which is forbidden in M2-9C. Route-level 409 envelope mapping remains covered by the earlier route-level tests in `apps/api/src/cdc-recovery/cdc-recovery-production-routes.test.js` and `apps/api/src/cdc-recovery/cdc-recovery-route-level.test.js`, both run with the stub repository.
- SQL-level-only was rejected because the M2-9C prompt prefers exercising the JS code, and repository-level was available.

## Synthetic Input Pattern

Patterns used (no concrete values bound here; the script generates `<ts>` from `Date.now()` at run time):

- `failure_id` pattern: `m2_9c_dryrun_<ts>_failure`
- `idempotency_key` pattern: `m2_9c_dryrun_<ts>_idem`
- `replay_request_id` shape: derived by repository as `cdc_replay_req_<sanitized idempotency_key>`
- `bounded_scope`: `{"sample_count": 1, "time_window_minutes": 10, "environment": "dev"}`
- `source_run_id`: NULL (M2-4 FKs to `public.run` are nullable; no upstream `public.run` row was created)
- All field values used safe label patterns only — no raw payload, no full message body, no issue raw value, no prod_change payload or actor value.

## Pre-State Counts For Synthetic ID

```
public.cdc_failure          : 0
public.cdc_replay_request   : 0
public.cdc_failure_state_log: 0
```

The synthetic `failure_id` was clean before seed.

## Step Results

| Step | Result | Observed |
| --- | --- | --- |
| Seed synthetic failure | passed | one `cdc_failure` row created with status `open` |
| Replay request creation | passed | `status=requested`, `cleanup_status=not_started`, `replay_request_id` present, response had 21 safe fields |
| Idempotency duplicate lookup | passed | `findReplayRequestByIdempotencyKey` returned the same `replay_request_id` |
| Idempotency conflict rejected | passed at repository level | duplicate INSERT threw `CdcRecoveryPersistenceError` (`code=internal_error`, `statusCode=500`) — see "Repository-Level Rejection vs Route-Level 409" below |
| State log append | passed | one `cdc_failure_state_log` row appended; `from_status=open`, `to_status=replay_requested`, `state_log_id` present |
| Valid failure transition | passed | `updateFailureStatus(open → replay_requested)` returned the updated row with `status=replay_requested` |
| Invalid failure transition rejected | passed | `updateFailureStatus(open → closed_no_replay)` against current `replay_requested` returned null (UPDATE 0 rows) |
| Valid replay request transition | passed | `updateReplayRequestStatus(requested → approved)` returned `status=approved` with `approved_at` set |
| Invalid replay request transition rejected | passed | `updateReplayRequestStatus(requested → cancelled)` against current `approved` returned null |

## Repository-Level Rejection vs Route-Level 409

The idempotency-conflict step verified the **repository-level** safe rejection. The duplicate INSERT against `uq_cdc_replay_idempotency_key` raises a unique-violation in PostgreSQL; the M2-8O Aurora repository wraps this in `CdcRecoveryPersistenceError` (`code=internal_error`, `statusCode=500`). This is the safe error class that the service layer catches and re-maps.

M2-9C did **not** live-test the route-level 409 `idempotency_conflict` envelope. That mapping is covered by the earlier route-level tests with the stub repository (`apps/api/src/cdc-recovery/cdc-recovery-production-routes.test.js` and `apps/api/src/cdc-recovery/cdc-recovery-route-level.test.js`), validated under M2-8I/M2-8B. The M2-9C dry-run intentionally stayed below the route layer to avoid broadening server.js wiring.

## Cleanup

```
DELETE FROM public.cdc_failure WHERE failure_id = $1
```

The CASCADE FKs from `cdc_replay_request.failure_id` and `cdc_failure_state_log.failure_id` removed the dependent rows in the same operation.

- Rows created during dry-run: 1 `cdc_failure`, 1 `cdc_replay_request`, ≥1 `cdc_failure_state_log` (one explicit append; the `updateFailureStatus` and `updateReplayRequestStatus` write paths do not append state-log rows themselves — append is a separate repository call).
- Failure rows deleted: 1
- Post-cleanup row counts for synthetic `failure_id`: **0/0/0** (`cdc_failure=0, cdc_replay_request=0, cdc_failure_state_log=0`).
- Cleanup complete: yes.
- Cleanup is bounded by the single synthetic `failure_id`. No unrelated rows were touched. No table was dropped. No schema rollback was executed.

## Timing

- Started at: 2026-05-04T11:32:19.402Z
- Completed at: 2026-05-04T11:32:20.073Z
- Elapsed: **671 ms**
- Within 10-minute time-window: **yes**
- Watchdog did not fire.

## Production Guard False-Positive Repair

The original `scripts/m2_9c_dry_run.js` guard used `currentDb.includes("prod")` to refuse production-like target names. This produced a **false positive** on the confirmed dev database `productops`, because the literal substring `prod` is contained in `productops`. Running the original script aborted with `refusing to run: target database name contains 'prod'` against the legitimate dev target.

The guard was repaired in place. The repaired guard:

1. Reads an explicit allowed database from the env var `M2_9C_ALLOWED_DATABASE` (default `productops`) and requires `current_database()` to **exact-match** that label (case-insensitive). Mismatch aborts.
2. Refuses target names that match obvious production patterns: exact `prod`, exact `production`, suffix `_prod`, suffix `-prod`, suffix `_production`, suffix `-production`, or any substring `production`. The substring check uses the **full word `production`**, not the partial `prod`, so `productops` no longer false-positives while real production names like `analytics_production` are still rejected.

The repair narrows the previous over-broad `contains("prod")` rule to two precise rules that together preserve safety (explicit allowlist + clear production-keyword detection) without weakening it. Production safety was not broadly relaxed:

- `prod` alone still aborts.
- `production` alone still aborts.
- `_prod`, `-prod`, `_production`, `-production` suffixes still abort.
- The substring `production` still aborts.
- Anything not on the explicit allowlist still aborts.

## Dev-Only SSL Verification Bypass

The operator ran the dry-run through a local SSM port-forward to the dev target. The local Node `pg` connection was configured with a dev-only SSL verification bypass for the SSM-tunneled certificate path. This is a **dev-only** configuration and was used solely for the M2-9C connection. It is documented here for traceability.

This evidence document deliberately omits the literal env var names and values used; what is recorded is only the qualitative fact that a dev-only SSL verification bypass was applied through the operator's authorized SSM port-forward path. M2-9B and earlier evidence used a different connection method and did not include this bypass; the bypass is scoped to the M2-9C dev dry-run.

## Boundary Confirmations

- **Runtime dry-run was executed in M2-9C**. Sample-count 1, time-window 10 minutes.
- **Cleanup is complete**. Post-cleanup counts: 0/0/0.
- **Rollback was not needed** and was not executed. The reviewed rollback file at `infra/sql/aurora/m2_4_dlq_replay_metadata_rollback.sql` remains in place but uninvoked.
- **No production DB was used.** Identity check confirmed `current_database=productops`. The repaired production guard accepted the explicit allowlisted dev target.
- **M2-9B schema verification passed** before this dry-run (3/3 tables, 10/10 indexes, 15/15 named constraints, plus 9 expected implicit PK/FK constraints). No schema regression was introduced by M2-9C.
- **No Kafka, no Debezium, no ClickHouse, no full pipeline** was run. No worker loop. No replay/reprocess execution.
- **No raw payload, no full message body, no issue raw value, no prod_change payload or actor value** is recorded.
- **No DB URL, hostname, port, credential, token, password, AWS account ID, IAM ARN, or secret value** is recorded in this evidence set.
- **No stack trace, no SQL error internal, no persistence internal** is recorded. The idempotency-conflict step recorded only the safe error class shape (`CdcRecoveryPersistenceError` / `internal_error` / 500); no SQL error message, hint, detail, or position is recorded.
- **The forward SQL file** `infra/sql/aurora/m2_4_dlq_replay_metadata.sql` was not modified; its `PROPOSAL ONLY - DO NOT APPLY AUTOMATICALLY` marker is preserved.
- **The main OpenAPI** remains in M2-8M merged state.
- **The M2-5 proposal-only patch** retains its proposal-only marker.
- **`apps/api/src/server.js`, `apps/api/src/auth.js`, `apps/api/src/error-response.js`** are unchanged.
- **M2-9A GO and NO-GO records** and **M2-9B evidence docs** are unchanged.

## Cross-References

- Runtime evidence report: `docs/runtime_evidence/m2_9_dev_dry_run_20260504.md`
- Decision record: `docs/m2_9c_runtime_decision_record_kr.md`
- Cleanup report: `docs/m2_9c_runtime_cleanup_report_kr.md`
- Feasibility check: `docs/m2_9c_runtime_feasibility_check_kr.md`
- Synthetic input plan: `docs/m2_9c_synthetic_input_plan_kr.md`
- Operator dry-run script: `scripts/m2_9c_dry_run.js`
- M2-9B SQL apply evidence: `docs/m2_9b_sql_apply_evidence_kr.md`
- M2-9B schema verification report: `docs/m2_9b_schema_verification_report_kr.md`
- M2-9A GO master: `docs/m2_9a_live_db_preflight_go_evidence_kr.md`
- M2-9A runtime dry-run bounds: `docs/m2_9a_runtime_dry_run_bounds_kr.md`
- Aurora repository: `apps/api/src/cdc-recovery/cdc-recovery-aurora-repository.js`
- State transition matrix: `docs/m2_replay_state_transition_matrix_kr.md`
- Error envelope matrix: `docs/m2_error_envelope_redaction_matrix_kr.md`
