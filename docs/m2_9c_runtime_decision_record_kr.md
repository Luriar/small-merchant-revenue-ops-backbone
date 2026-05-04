# M2-9C Runtime Decision Record

## Decision

The M2-9C controlled runtime dry-run against the confirmed dev target `product-ops-dev-aurora` is **passed**. All required behaviors verified, cleanup complete, no rollback needed. M2 is unblocked for final closure.

## Inputs Considered

- M2-9A GO record (`docs/m2_9a_live_db_preflight_go_evidence_kr.md` and supporting GO docs) — eleven operator-supplied evidence groups, structurally complete, non-production-safe.
- M2-9B SQL apply evidence (`docs/m2_9b_sql_apply_evidence_kr.md`, `docs/m2_9b_schema_verification_report_kr.md`) — schema in place: 3/3 tables, 10/10 named indexes, 15/15 named constraints, plus 9 expected implicit PK/FK constraints; 24 total.
- Phase 0 baseline rerun on 2026-05-04: M2-9B 97/0, M2-9A GO 64/0, M2-9A NO-GO preflight 29/0, M2-8O tests 10/10, M2-8O validator 50/0, M2-8N 31/0, M2-8M 18/0, global safety 6/0, `git diff --check` exit 0.
- M2-9C feasibility check (`docs/m2_9c_runtime_feasibility_check_kr.md`) — confirmed nullable `source_run_id` FKs (no upstream `public.run` row needed), repository-level dry-run is the safest bounded path, cleanup is bounded by single synthetic `failure_id`.
- M2-9C synthetic input plan (`docs/m2_9c_synthetic_input_plan_kr.md`) — exact synthetic ID patterns and column values reviewed before run.
- M2-9C operator dry-run script (`scripts/m2_9c_dry_run.js`) — repository-level controlled exercise of the M2-8O Aurora repository, with 10-minute watchdog, finally-block cleanup, sanitized JSON output.
- Operator-run dry-run against `product-ops-dev-aurora` from the authorized dev path. Claude did not connect to the DB. The operator pasted back the sanitized stdout JSON.
- All dry-run steps passed: replay request creation, idempotency duplicate lookup, idempotency conflict rejected at repository level, state log append, valid failure transition, invalid failure transition rejected, valid replay request transition, invalid replay request transition rejected.
- Cleanup: 1 `cdc_failure` row deleted; CASCADE removed 1 `cdc_replay_request` and ≥1 `cdc_failure_state_log` row; post-cleanup counts 0/0/0 across all three M2-4 tables for the synthetic `failure_id`. Cleanup is complete.
- Timing: 671 ms elapsed, well within the 10-minute bound. Watchdog did not fire.

## What Was Authorized And Performed

- Repository-level controlled dry-run against `product-ops-dev-aurora` only, using the M2-8O Aurora repository through a thin transactional `pg.Client` adapter.
- One synthetic `cdc_failure` row seed via direct `INSERT` (the repository deliberately does not expose a write method for `cdc_failure`; those rows come from upstream CDC parsing in production).
- Repository writes through `createReplayRequest`, `appendFailureStateLog`, `updateFailureStatus`, `updateReplayRequestStatus`.
- Repository reads through `findReplayRequestByIdempotencyKey`.
- Idempotency-conflict path verified at the repository persistence boundary as `CdcRecoveryPersistenceError` (`code=internal_error`, `statusCode=500`).
- Bounded cleanup: `DELETE FROM public.cdc_failure WHERE failure_id = $1`, scoped to the single synthetic `failure_id`.
- Production-guard repair for the M2-9C dry-run script: replaced an over-broad `currentDb.includes("prod")` substring rule with an explicit allowlist (`M2_9C_ALLOWED_DATABASE`, default `productops`) plus precise production-keyword detection. Documented in `docs/m2_9c_controlled_runtime_dry_run_evidence_kr.md` under "Production Guard False-Positive Repair".
- Dev-only SSL verification bypass through the operator's local SSM port-forward, used solely for the M2-9C connection. Documented qualitatively without recording the literal env var values.

## What Remains NO-GO

- Production DB access — remains NO-GO.
- Unbounded replay or reprocess — remains NO-GO.
- Kafka, Debezium, ClickHouse, full pipeline, or worker-loop execution — remains NO-GO.
- Terraform changes, deployment changes — remain NO-GO.
- Broad rewrites of `apps/api/src/server.js`, `apps/api/src/auth.js`, `apps/api/src/error-response.js`, or main OpenAPI — remain NO-GO.
- Route-level live test of the 409 `idempotency_conflict` envelope — was not in scope for M2-9C and was not performed. Route-level mapping remains covered by `apps/api/src/cdc-recovery/cdc-recovery-production-routes.test.js` and `apps/api/src/cdc-recovery/cdc-recovery-route-level.test.js` with the stub repository.
- Recording DB URLs, hostnames, ports, credentials, tokens, passwords, AWS account IDs, IAM ARNs, raw payloads, full message bodies, issue raw values, prod_change payload or actor values, stack traces, SQL error internals, or persistence internals in any doc — remains forbidden and was not violated.

## Boundary Confirmations

- Sample-count remained 1.
- Time-window remained 10 minutes.
- Cleanup is complete; post-cleanup counts 0/0/0.
- Rollback was not needed and was not executed.
- No production DB was used.
- No external infrastructure command (Kafka, Debezium, ClickHouse, kubectl, Terraform, deployment, AWS write) was run.
- No DB URL, hostname, port, credential, token, password, AWS account ID, IAM ARN, raw payload, full message body, issue raw value, or prod_change payload or actor value is recorded.
- M2-9B schema verification passed before the dry-run; M2-9C did not modify the schema. The M2-4 forward SQL file remains marked `PROPOSAL ONLY - DO NOT APPLY AUTOMATICALLY`.
- M2-9A GO and NO-GO records, M2-9B evidence docs, main OpenAPI (M2-8M merged state), and the M2-5 proposal-only patch are all unchanged.

## Cross-References

- Evidence: `docs/m2_9c_controlled_runtime_dry_run_evidence_kr.md`
- Cleanup report: `docs/m2_9c_runtime_cleanup_report_kr.md`
- Runtime evidence report: `docs/runtime_evidence/m2_9_dev_dry_run_20260504.md`
- Feasibility check: `docs/m2_9c_runtime_feasibility_check_kr.md`
- Synthetic input plan: `docs/m2_9c_synthetic_input_plan_kr.md`
- Operator dry-run script: `scripts/m2_9c_dry_run.js`
- M2-9B SQL apply evidence: `docs/m2_9b_sql_apply_evidence_kr.md`
- M2-9A GO master: `docs/m2_9a_live_db_preflight_go_evidence_kr.md`
