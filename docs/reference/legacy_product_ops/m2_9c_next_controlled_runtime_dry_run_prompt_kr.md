# M2-9C Next Controlled Runtime Dry-Run Prompt

## Status

This prompt is gated by both the M2-9A GO record **and** a green M2-9B SQL apply. It authorizes a single, narrowly-scoped controlled runtime dry-run against the confirmed dev target `product-ops-dev-aurora`. It does not authorize production access, unbounded replay/reprocess, or any external infrastructure command.

## Preconditions (Mandatory Before Entry)

All of the following must be green before M2-9C may run:

- `npm run validate:m2-9b:sql-apply-evidence` → 0 FAIL
- `npm run validate:m2-9a:live-db-go` → 0 FAIL
- `npm run validate:m2-9a:live-db-preflight` → 0 FAIL
- `npm run test:m2-8o:aurora-repository` → all PASS
- `npm run validate:m2-8o:aurora-repository` → 0 FAIL
- `npm run validate:m2-8n:post-merge-closure` → 0 FAIL
- `npm run validate:m2-8m:openapi-merge` → 0 FAIL
- `npm run validate:m2:global-safety` → 0 FAIL
- `git diff --check` → exit 0

If any precondition fails, **stop**. Do not run dry-run.

## Inputs Already Recorded

The following are filed under M2-9A GO and M2-9B and do not need to be re-supplied:

- target environment: dev (`product-ops-dev-aurora`)
- migration role: `app_migration_dev_role`; sanitized observed user: `postgres`
- region: `ap-northeast-2`; account identifier not recorded in docs
- cleanup owner: Yoon Joonho
- rollback owner: Yoon Joonho
- evidence_report_ref: `docs/runtime_evidence/m2_9_dev_dry_run_20260504.md`
- bounded sample-count: **1**
- bounded time-window: **10 minutes**
- post-apply schema state: 3 of 3 tables, 10 of 10 indexes, 15 of 15 named constraints all present (plus 9 expected implicit PK/FK constraints)
- corrected verification query (see `docs/m2_9b_schema_verification_report_kr.md` "Verification Query Correction")

## Inputs The M2-9C Operator Must Add

Before dry-run executes, the operator must add:

1. **Synthetic / dev-only failure row payload** — minimal, safe, dev-derived only. No production data. The payload must be deterministic enough to identify and clean up afterward (e.g. a `failure_id` of `m2_9c_dryrun_<timestamp>`).
2. **evidence_report_ref destination file** — operator creates `docs/runtime_evidence/m2_9_dev_dry_run_20260504.md` and writes the sanitized dry-run timeline into it. M2-9C will record references to this file but does not write raw payload values into it.
3. **Cleanup commands prepared** — explicit `DELETE` statements bounded to the synthetic `failure_id` only, reviewed by the cleanup owner before dry-run executes.

## Allowed In M2-9C

- read-only Phase 0 + M2-9B baseline regression rerun
- one controlled route/repository-level dry-run that creates **at most 1** synthetic CDC failure row and **at most 1** related replay request, within the **10-minute** time-window
- read-only post-dry-run inspection covering replay request creation, idempotency duplicate behavior, idempotency conflict behavior (if safely testable), state log append, valid state transition, invalid state transition rejection, safe error envelope shape, and cleanup status
- bounded cleanup of the synthetic row by `failure_id`
- creation of M2-9C evidence docs (`docs/m2_9c_controlled_runtime_dry_run_evidence_kr.md`, `docs/m2_9c_runtime_cleanup_report_kr.md`, `docs/m2_9c_runtime_decision_record_kr.md`)
- creation of `scripts/validate_m2_9c_runtime_dry_run_evidence.py` and `package.json` script `validate:m2-9c:runtime-dry-run-evidence`

## Forbidden In M2-9C

- production DB access
- unbounded sample-count or unbounded time-window
- exceeding 1 synthetic failure row or exceeding 10 minutes wall-clock
- replay/reprocess against production data
- Kafka, Debezium, or ClickHouse runtime execution unless bounded and explicitly approved (default: forbidden)
- Terraform changes
- deployment changes
- broad rewrites of `apps/api/src/server.js`, `apps/api/src/auth.js`, `apps/api/src/error-response.js`, or main OpenAPI
- writing DB URLs, hostnames, ports, IAM ARNs, AWS account IDs, credentials, tokens, or passwords into evidence
- writing raw payload, full message body, issue raw value, or prod_change payload/actor value into evidence (synthetic dev payload field names are acceptable; concrete values must remain inside the evidence_report_ref destination, not in the M2-9C decision/cleanup docs)
- writing stack traces, SQL error internals, or persistence internals into API-safe outputs or evidence
- skipping cleanup
- exiting M2-9C with the synthetic row still present

## Required Dry-Run Verifications

The M2-9C dry-run must observe and record (sanitized) outcomes for each of:

1. **Replay request creation** — POSTing to `/api/v1/cdc/failures/{failure_id}/replay-requests` with a dev-only request body creates a `cdc_replay_request` row, sets `status='requested'`, and appends a `cdc_failure_state_log` row.
2. **Idempotency duplicate** — re-issuing the same request with the same `idempotency_key` returns the existing replay request without creating a second row.
3. **Idempotency conflict** (if safely testable in 1 sample) — re-issuing with the same `idempotency_key` but a different bounded scope returns a 409 with the safe `CdcErrorResponse` envelope and does not create a new row.
4. **State log append** — every state transition appends a row to `cdc_failure_state_log` with `from_status`, `to_status`, `reason_code`, `owner`, and `safe_metadata`. Append-only is preserved.
5. **Valid transition** — `requested → approved` (via the approve route) succeeds and appends a state log row.
6. **Invalid transition rejection** — attempting `requested → succeeded` directly (skipping `approved` and `running`) returns a 409 with the safe `CdcErrorResponse` envelope and does not append a misleading state log row.
7. **Safe error envelope** — every error response uses the redacted `CdcErrorResponse` shape from M2-8M. No SQL internals, no stack traces, no DB internals.
8. **Cleanup status** — `cdc_replay_request.cleanup_status` lifecycle is observable and ends in `complete` or `not_required` for the synthetic row before cleanup deletes it.

## Cleanup Requirements

After dry-run completes, the operator must:

1. Delete the synthetic `cdc_failure` row by `failure_id` (cascading deletes will remove related `cdc_replay_request` and `cdc_failure_state_log` rows via the FK ON DELETE CASCADE chain).
2. Re-run the M2-9B post-apply schema verification (read-only). The schema must remain at 3/3 tables, 10/10 indexes, 15/15 named constraints. Row counts on all three M2-4 tables must be 0.
3. Record cleanup outcome in `docs/m2_9c_runtime_cleanup_report_kr.md`.
4. If cleanup leaves any synthetic row behind, escalate to the cleanup owner and do not declare M2-9C complete.

## Failure Handling

If dry-run fails or partially succeeds:

1. Stop immediately. Do not retry blindly.
2. Run the cleanup commands to remove any synthetic row created.
3. Document the safe failure summary in `docs/m2_9c_runtime_dry_run_failed_repair_prompt_kr.md`. Do not include connection strings, raw error internals, or stack traces.
4. Decide with the rollback owner whether the failure indicates a schema-level defect that requires running the M2-9B rollback. Default: it does not — most runtime failures are application-level, not schema-level.
5. Do not enter final M2 closure until M2-9C is re-attempted and passes cleanly.

## Final M2 Closure (Only After M2-9C Passes)

Once M2-9C dry-run, cleanup, and validator are green, the next session may create the final M2 closure docs (`docs/m2_final_closure_summary_kr.md`, `docs/m2_final_validation_evidence_kr.md`, etc.) per the original M2 closure plan. Final closure must record exact bounds used, evidence_report_ref, cleanup status, rollback status (`not needed; not executed`), and the exact rerun command set.

## Cross-References

- M2-9A GO master: `docs/m2_9a_live_db_preflight_go_evidence_kr.md`
- M2-9A runtime dry-run bounds: `docs/m2_9a_runtime_dry_run_bounds_kr.md`
- M2-9B apply evidence: `docs/m2_9b_sql_apply_evidence_kr.md`
- M2-9B schema verification report: `docs/m2_9b_schema_verification_report_kr.md`
- M2-9B decision record: `docs/m2_9b_sql_apply_decision_record_kr.md`
- M2-9B rollback SQL review: `docs/m2_9b_rollback_sql_review_kr.md`
- Rollback SQL: `infra/sql/aurora/m2_4_dlq_replay_metadata_rollback.sql`
- Aurora repository (live target): `apps/api/src/cdc-recovery/cdc-recovery-aurora-repository.js`
- M2-8O test matrix (mocked): `docs/m2_8o_repository_test_matrix_kr.md`
