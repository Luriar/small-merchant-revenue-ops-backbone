# M2-9C Runtime Cleanup Report

## Cleanup Decision

Cleanup decision: **complete**.

The single synthetic `cdc_failure` row created during the M2-9C controlled runtime dry-run was removed. The CASCADE foreign-key relationships from `cdc_replay_request` and `cdc_failure_state_log` removed dependent rows in the same operation. Post-cleanup row counts for the synthetic `failure_id` are 0 across all three M2-4 tables.

## Cleanup Owner

- Cleanup owner: Yoon Joonho
- Rollback owner: Yoon Joonho

## Rows Created During Dry-Run

| Table | Row count | Note |
| --- | --- | --- |
| `public.cdc_failure` | 1 | seeded directly with a synthetic `failure_id` matching `m2_9c_dryrun_<ts>_failure` |
| `public.cdc_replay_request` | 1 | created by `createReplayRequest`; the second duplicate-INSERT attempt was rejected by `uq_cdc_replay_idempotency_key` and therefore did not produce a row |
| `public.cdc_failure_state_log` | ≥ 1 | one explicit append from `appendFailureStateLog`. The `updateFailureStatus` and `updateReplayRequestStatus` write paths do not append state-log rows themselves; append is a separate repository call. |

All rows were bounded by the single synthetic `failure_id`. No unrelated rows were created or touched.

## Cleanup Command Type (Sanitized)

```
DELETE FROM public.cdc_failure WHERE failure_id = $1
```

CASCADE FKs:

- `public.cdc_replay_request.failure_id REFERENCES public.cdc_failure(failure_id) ON DELETE CASCADE`
- `public.cdc_failure_state_log.failure_id REFERENCES public.cdc_failure(failure_id) ON DELETE CASCADE`

Both cascade in the same operation. No additional `DELETE` statements were issued.

## Cleanup Result

- Rows deleted (top-level `cdc_failure`): **1**
- Cascade rows removed (`cdc_replay_request`, `cdc_failure_state_log`): all rows for the synthetic `failure_id`
- Post-cleanup row counts for the synthetic `failure_id`:
  - `public.cdc_failure`: **0**
  - `public.cdc_replay_request`: **0**
  - `public.cdc_failure_state_log`: **0**
- Cleanup complete: **yes**

## Schema State After Cleanup

No table was dropped. No constraint was dropped. No index was dropped. The M2-9B schema remains intact at:

- 3/3 M2-4 tables present
- 10/10 named indexes present
- 15/15 named check/unique constraints present
- 9/9 expected implicit primary-key and foreign-key constraints present
- 24 total constraints — unchanged from M2-9B

## Remaining Rows

- Remaining synthetic rows: **0**
- Remaining synthetic objects: **0**
- Outstanding cleanup tasks: **none**

## Rollback Status

- Rollback file: `infra/sql/aurora/m2_4_dlq_replay_metadata_rollback.sql`
- Rollback executed: **no**
- Rollback needed: **no**
- The reviewed rollback file remains in place for future emergency use. M2-9C did not require any schema rollback because cleanup was bounded to synthetic rows and the schema was not changed.

## No-Go And Follow-Up

- Cleanup blockers: none
- Follow-up tasks: none required for cleanup
- Recommended next: final M2 closure docs, then handoff for next-phase planning

## Boundary Confirmations

- Cleanup was bounded by the single synthetic `failure_id`. No unrelated rows were touched.
- No table, index, or constraint was dropped.
- No schema rollback was executed.
- No production DB was accessed.
- No DB URL, hostname, port, credential, token, password, AWS account ID, or IAM ARN is recorded.
- No raw payload, full message body, issue raw value, or prod_change payload or actor value is recorded.

## Cross-References

- Evidence: `docs/m2_9c_controlled_runtime_dry_run_evidence_kr.md`
- Decision record: `docs/m2_9c_runtime_decision_record_kr.md`
- Runtime evidence report: `docs/runtime_evidence/m2_9_dev_dry_run_20260504.md`
- Synthetic input plan: `docs/m2_9c_synthetic_input_plan_kr.md`
- Operator dry-run script: `scripts/m2_9c_dry_run.js`
- M2-9B schema verification report: `docs/m2_9b_schema_verification_report_kr.md`
- M2-9A runtime dry-run bounds: `docs/m2_9a_runtime_dry_run_bounds_kr.md`
