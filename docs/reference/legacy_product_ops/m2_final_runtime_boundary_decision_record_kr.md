# M2 Final Runtime Boundary Decision Record

## Decision

The runtime behavior of the CDC recovery API surface is verified at final M2 closure under the following bounded scope. The bounds were chosen deliberately and are not artifacts of incomplete work — they record the specific layer, environment, sample size, and time-window at which M2 ran live, and what remains explicitly out of scope for M2 closure.

## What Is Verified Live At Final M2 Closure

- **Repository layer** of the CDC recovery API (M2-8O Aurora repository) was exercised against the **dev** target `product-ops-dev-aurora` once, under M2-9C, with **sample-count 1** and **time-window 10 minutes** (observed 671 ms).
- **Schema layer** of the M2-4 DLQ replay metadata was applied once under M2-9B against the dev target. Schema verification confirmed 3/3 tables, 10/10 named indexes, 15/15 named check/unique constraints, plus 9 expected implicit primary-key and foreign-key constraints.
- **Identity** at the dev target was confirmed read-only: `current_database=productops`, `current_user=postgres`, `current_schema=public`, server `PostgreSQL 15.17`.
- **Idempotency conflict** behavior was verified at the **repository persistence boundary**: the duplicate INSERT raised the unique-violation that the M2-8O repository wraps as `CdcRecoveryPersistenceError` (`code=internal_error`, `statusCode=500`).
- **State transition rejection** was verified at the **repository write-guard boundary**: an UPDATE with a `from_status` that no longer matches the current row state returns `null` (UPDATE 0 rows). The repository preserves the original failure / replay request status in this case.
- **Cleanup** is bounded by a single synthetic `failure_id`. CASCADE FKs from `cdc_replay_request.failure_id` and `cdc_failure_state_log.failure_id` remove dependents in the same `DELETE`. Post-cleanup row counts are 0/0/0.

## What Is Verified Non-Live (Tests / Mocks)

- **Route layer** (`apps/api/src/cdc-recovery/cdc-recovery-routes.js`) is verified by `apps/api/src/cdc-recovery/cdc-recovery-production-routes.test.js` and `apps/api/src/cdc-recovery/cdc-recovery-route-level.test.js` against a stub repository, including the route-level 409 `idempotency_conflict` envelope mapping. The route layer is registered in `apps/api/src/server.js` via the M2-8I isolated dispatcher.
- **OpenAPI contract** in `sources/personal_project_openapi_v0_2.yaml` is verified by the M2-8M / M2-8N validators (CDC Recovery tag, paths, safe schemas, redacted `CdcErrorResponse` envelope, redacted 400/401/403/404/409/500 coverage).
- **Auth role mapping** is verified by `validate:m2-8b-prep:auth-roles` and the route-level tests.
- **Error envelope shape** is verified by `validate:m2-8c-prep:error-envelope` and `docs/m2_error_envelope_redaction_matrix_kr.md`.
- **DTO mapper safety** (no raw payload, no full message body, no issue raw value, no prod_change payload/actor value) is verified by the M2-7 / M2-8O / M2-8N validators.
- **Repository SQL shape and parameter binding** is verified by `apps/api/src/cdc-recovery/cdc-recovery-aurora-repository.test.js` against a mocked DB client.

## What Is Out Of Scope For M2 Closure

These items are deliberately deferred to a future phase. They are not blockers for M2 closure under the agreed bounded scope:

- **Live wiring of the Aurora repository into production routes.** Currently the production routes registered through the M2-8I dispatcher use the stub repository. Wiring the Aurora repository at the route layer would require broadening `apps/api/src/server.js` and is forbidden in M2-9C. A future phase may do this.
- **Staging or production schema apply.** SQL apply was limited to the confirmed dev target. Promoting the M2-4 schema to staging or production is a future-phase task with its own GO gate.
- **Live runtime against production data** of any shape.
- **Worker / pipeline runtime.** Kafka, Debezium, ClickHouse, replay/reprocess workers, and the full pipeline were not live-tested. The M2-9C dry-run intentionally stayed at the repository layer.
- **Multi-sample / concurrency stress testing** of idempotency-key contention. Sample-count was 1 by design.
- **TLS validation** in non-dev environments. The M2-9C dev dry-run used a dev-only SSL verification bypass through a local SSM port-forward; production-grade TLS is a future-phase concern.
- **Removal of the `PROPOSAL ONLY - DO NOT APPLY AUTOMATICALLY` marker** on `infra/sql/aurora/m2_4_dlq_replay_metadata.sql`. Removal would require a project-level convention for applying proposal-marked SQL and is not in M2 scope.

## Why These Bounds Were Chosen

- **Sample-count 1 + time-window 10 minutes.** Aligns with the M2-9A bounds the operator filed under the GO record. Smallest provable bound that still exercises the full repository surface end-to-end on the live schema.
- **Repository-level over route-level.** Route-level dry-run would have required broadening `apps/api/src/server.js` to wire the Aurora repository as the live dependency, which the M2 prompt forbids. The 409 envelope is already covered by route-level stub tests under M2-8B / M2-8I.
- **Dev-only.** Production safety is the binding constraint. The operator-supplied evidence under M2-9A explicitly classified the target as dev and confirmed it is not shared with production.
- **Single-transaction apply with stop-on-first-error.** Minimizes blast radius if apply fails partially. The forward SQL uses `IF NOT EXISTS` for tables and indexes, so re-apply after a partial failure is idempotent at those object types.
- **Bounded cleanup by `failure_id`.** Avoids touching unrelated rows. CASCADE FKs handle the dependent rows safely without `CASCADE` on the `DELETE`.
- **Reviewed rollback prepared but not executed.** Rollback is an emergency path. Preparing it before apply is the gate; executing it is only justified by an actual apply failure or an approved rollback request.

## Boundary Confirmations

- M2 closure does **not** claim live verification of the route layer with the Aurora repository.
- M2 closure does **not** claim live verification on staging or production.
- M2 closure does **not** claim live verification of multi-sample concurrency.
- M2 closure does **not** claim live verification of full-pipeline (Kafka / Debezium / ClickHouse) replay.
- M2 closure **does** claim that the M2-8O Aurora repository works against the live M2-4 schema for the verified set of methods (createReplayRequest, findReplayRequestByIdempotencyKey, appendFailureStateLog, updateFailureStatus, updateReplayRequestStatus) under the bounded sample.
- M2 closure **does** claim that the M2-9B schema verification reflects the on-disk state at the confirmed dev target as of 2026-05-04.
- M2 closure **does** claim that cleanup is complete and no orphan synthetic rows remain.

## Cross-References

- Closure summary: `docs/m2_final_closure_summary_kr.md`
- Validation evidence: `docs/m2_final_validation_evidence_kr.md`
- Artifact index: `docs/m2_final_artifact_index_kr.md`
- M2-9A GO master: `docs/m2_9a_live_db_preflight_go_evidence_kr.md`
- M2-9B SQL apply evidence: `docs/m2_9b_sql_apply_evidence_kr.md`
- M2-9C controlled runtime dry-run evidence: `docs/m2_9c_controlled_runtime_dry_run_evidence_kr.md`
- Runtime evidence report: `docs/runtime_evidence/m2_9_dev_dry_run_20260504.md`
- State transition matrix: `docs/m2_replay_state_transition_matrix_kr.md`
- Error envelope matrix: `docs/m2_error_envelope_redaction_matrix_kr.md`
