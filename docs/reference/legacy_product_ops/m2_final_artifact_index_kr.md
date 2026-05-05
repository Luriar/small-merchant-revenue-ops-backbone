# M2 Final Artifact Index

## Purpose

Catalog of every M2 artifact at final closure (2026-05-04). Source code, SQL, OpenAPI, validators, evidence docs, and operator scripts.

## Source Code

### CDC Recovery (production wiring)

- `apps/api/src/cdc-recovery/cdc-recovery-routes.js` — M2-8I production route registration (replay request creation, listing, get, approve, cancel; failure listing, get, state log)
- `apps/api/src/cdc-recovery/cdc-recovery-service.js` — service layer
- `apps/api/src/cdc-recovery/cdc-recovery-dto-mapper.js` — safe DTO projection (`pickSafeFields`, `stripForbiddenFields`)
- `apps/api/src/cdc-recovery/cdc-recovery-aurora-repository.js` — M2-8O Aurora repository with injected DB client and `withTransaction` adapter; live-exercised in M2-9C
- `apps/api/src/cdc-recovery/test-support/` — shared in-memory stub repository for M2-8B / M2-8I tests
- `apps/api/src/server.js` — M2-8I minimal route registration through isolated dispatcher (no broader changes)
- `apps/api/src/auth.js` — unchanged in M2
- `apps/api/src/error-response.js` — unchanged in M2

### CDC Recovery Tests

- `apps/api/src/cdc-recovery/cdc-recovery-dto-mapper.test.js` — DTO mapper tests (M2-7)
- `apps/api/src/cdc-recovery/cdc-recovery-service.test.js` — service-layer targeted tests (M2-7)
- `apps/api/src/cdc-recovery/cdc-recovery-route-level.test.js` — M2-8B test-only harness (route-level with stub repository)
- `apps/api/src/cdc-recovery/cdc-recovery-production-routes.test.js` — M2-8I production route registration tests with stub repository
- `apps/api/src/cdc-recovery/cdc-recovery-aurora-repository.test.js` — M2-8O Aurora repository tests with mocked DB client

## SQL

- `infra/sql/aurora/m2_4_dlq_replay_metadata.sql` — forward SQL for the three M2-4 CDC replay metadata tables, ten named indexes, and fifteen named check/unique constraints. Retains its `PROPOSAL ONLY - DO NOT APPLY AUTOMATICALLY` marker at final closure.
- `infra/sql/aurora/m2_4_dlq_replay_metadata_rollback.sql` — narrow, transactional, idempotent rollback (DROPs in reverse FK order, no CASCADE). Created under M2-9B; not executed.

## OpenAPI

- `sources/personal_project_openapi_v0_2.yaml` — main OpenAPI in M2-8M merged state. Contains the CDC Recovery tag, eight CDC routes, safe schemas, `CdcErrorResponse` envelope, and redacted 400/401/403/404/409/500 coverage.
- `sources/openapi_m2_5_dlq_replay_patch.yaml` — proposal-only history. Retains its `PROPOSAL` marker.

## Validators

| Path | NPM script | Coverage |
| --- | --- | --- |
| `scripts/validate_m2_global_safety.py` | `validate:m2:global-safety` | raw-field safety across scoped M2 artifacts |
| `scripts/validate_m2_1_cdc_contract.py` | `validate:m2-1:cdc` and family | M2-1 contract |
| `scripts/validate_m2_2_runtime_package.py` | `validate:m2-2:runtime-package` | M2-2 |
| `scripts/validate_m2_3_observability_contract.py` | `validate:m2-3:observability-contract` | M2-3 |
| `scripts/validate_m2_4_dlq_storage_contract.py` | `validate:m2-4:dlq-storage-contract` | M2-4 |
| `scripts/validate_m2_5_dlq_replay_api_contract.py` | `validate:m2-5:dlq-replay-api-contract` | M2-5 |
| `scripts/validate_m2_6_handler_repository_contract.py` | `validate:m2-6:handler-repository-contract` | M2-6 |
| `scripts/validate_m2_7_skeleton_contract.py` | `validate:m2-7:skeleton-contract` | M2-7 |
| `scripts/validate_m2_8a_route_wiring_readiness.py` | `validate:m2-8a:route-readiness` | M2-8A |
| `scripts/validate_m2_8b_auth_role_reconciliation.py` | `validate:m2-8b-prep:auth-roles` | M2-8B-Prep |
| `scripts/validate_m2_8b_test_only_harness.py` | `validate:m2-8b:test-only-harness` | M2-8B |
| `scripts/validate_m2_8c_error_envelope_integration.py` | `validate:m2-8c-prep:error-envelope` | M2-8C |
| `scripts/validate_m2_8d_repository_strategy.py` | `validate:m2-8d-prep:repository-strategy` | M2-8D |
| `scripts/validate_m2_8e_openapi_merge_ownership.py` | `validate:m2-8e-prep:openapi-ownership` | M2-8E |
| `scripts/validate_m2_8f_route_level_test_contract.py` | `validate:m2-8f-prep:route-tests` | M2-8F |
| `scripts/validate_m2_8g_final_pre_wiring.py` | `validate:m2-8g:final-pre-wiring` | M2-8G |
| `scripts/validate_m2_8h_route_wiring_readiness.py` | `validate:m2-8h:route-wiring-readiness` | M2-8H |
| `scripts/validate_m2_8i_production_route_wiring.py` | `validate:m2-8i:production-route-wiring` | M2-8I |
| `scripts/validate_m2_8j_openapi_merge_readiness.py` | `validate:m2-8j:openapi-readiness` | M2-8J |
| `scripts/validate_m2_8m_openapi_merge.py` | `validate:m2-8m:openapi-merge` | M2-8M |
| `scripts/validate_m2_8n_post_merge_closure.py` | `validate:m2-8n:post-merge-closure` | M2-8N |
| `scripts/validate_m2_8o_aurora_repository.py` | `validate:m2-8o:aurora-repository` | M2-8O |
| `scripts/validate_m2_9a_live_db_preflight.py` | `validate:m2-9a:live-db-preflight` | M2-9A NO-GO history |
| `scripts/validate_m2_9a_live_db_go.py` | `validate:m2-9a:live-db-go` | M2-9A GO |
| `scripts/validate_m2_9b_sql_apply_evidence.py` | `validate:m2-9b:sql-apply-evidence` | M2-9B |
| `scripts/validate_m2_9c_runtime_dry_run_evidence.py` | `validate:m2-9c:runtime-dry-run-evidence` | M2-9C |

## Operator Scripts

- `scripts/m2_9c_dry_run.js` — operator-runnable Node.js dry-run that exercises the M2-8O Aurora repository against the dev target. Repaired guard uses an explicit `M2_9C_ALLOWED_DATABASE` allowlist (default `productops`) plus precise production-keyword detection. 10-minute watchdog. Cleanup in `finally`. Sanitized JSON stdout only.

## Documentation

### Top-Level Final Closure (this set)

- `docs/m2_final_closure_summary_kr.md`
- `docs/m2_final_validation_evidence_kr.md`
- `docs/m2_final_runtime_boundary_decision_record_kr.md`
- `docs/m2_final_artifact_index_kr.md`
- `docs/m2_final_commit_plan_kr.md`
- `docs/m2_next_phase_plan_kr.md`

### Live-Gated Closure And Handoff (history)

- `docs/m2_live_gated_closure_summary_kr.md`
- `docs/m2_next_session_handoff_kr.md`
- `docs/m2_8_validation_evidence_ledger_kr.md`
- `docs/m2_8_artifact_index_kr.md`
- `docs/m2_8_commit_plan_kr.md`
- `docs/m2_8_next_session_operator_checklist_kr.md`

### M2-9 Live DB Work

- `docs/m2_9a_live_db_preflight_gate_kr.md` (NO-GO history, preserved)
- `docs/m2_9a_live_db_no_go_decision_record_kr.md` (NO-GO history, preserved)
- `docs/m2_9a_rollback_plan_kr.md` (NO-GO history, preserved)
- `docs/m2_9a_live_db_preflight_go_evidence_kr.md` (GO master)
- `docs/m2_9a_live_db_target_evidence_kr.md`
- `docs/m2_9a_schema_inspection_report_kr.md`
- `docs/m2_9a_sql_apply_go_no_go_decision_kr.md`
- `docs/m2_9a_runtime_dry_run_bounds_kr.md`
- `docs/m2_9a_go_blocked_repair_prompt_kr.md` (history of two earlier attempts)
- `docs/m2_9b_next_sql_apply_prompt_kr.md`
- `docs/m2_9b_rollback_sql_review_kr.md`
- `docs/m2_9b_sql_apply_evidence_kr.md`
- `docs/m2_9b_sql_apply_decision_record_kr.md`
- `docs/m2_9b_schema_verification_report_kr.md`
- `docs/m2_9c_next_controlled_runtime_dry_run_prompt_kr.md`
- `docs/m2_9c_runtime_feasibility_check_kr.md`
- `docs/m2_9c_synthetic_input_plan_kr.md`
- `docs/m2_9c_controlled_runtime_dry_run_evidence_kr.md`
- `docs/m2_9c_runtime_decision_record_kr.md`
- `docs/m2_9c_runtime_cleanup_report_kr.md`
- `docs/runtime_evidence/m2_9_dev_dry_run_20260504.md`

### M2-1 Through M2-8 Records

- M2-1: `docs/m2_1_*` (CDC contract, runtime dry run, alignment, closure)
- M2-2: `docs/m2_2_*`
- M2-3: `docs/m2_3_*` (DLQ message contract, observability/replay contract)
- M2-4: `docs/m2_4_*` (DLQ safe metadata storage design, Kafka DLQ topic contract)
- M2-5: `docs/m2_5_*` (DLQ replay API contract, idempotent replay rules, OpenAPI patch proposal)
- M2-6: `docs/m2_6_*` (handler/repository contract, service flow sequence, closure)
- M2-7: `docs/m2_7_*` (non-wired skeleton, closure)
- M2-8A → M2-8O: `docs/m2_8a_*` through `docs/m2_8o_*`
- Cross-cutting: `docs/m2_authorization_role_permission_matrix_kr.md`, `docs/m2_contract_crosswalk_matrix_kr.md`, `docs/m2_data_retention_cleanup_policy_matrix_kr.md`, `docs/m2_error_envelope_redaction_matrix_kr.md`, `docs/m2_idempotency_conflict_scenario_catalog_kr.md`, `docs/m2_replay_state_transition_matrix_kr.md`, `docs/m2_replay_worker_contract_kr.md`, `docs/m2_runtime_risk_register_kr.md`, `docs/m2_controlled_runtime_dry_run_go_no_go_checklist_kr.md`, `docs/m2_readiness_check_kr.md`, `docs/m2_claude_repair_prompt_kr.md`

## Cross-References

- Closure summary: `docs/m2_final_closure_summary_kr.md`
- Validation evidence: `docs/m2_final_validation_evidence_kr.md`
- Runtime boundary decision record: `docs/m2_final_runtime_boundary_decision_record_kr.md`
- Commit plan: `docs/m2_final_commit_plan_kr.md`
- Next phase plan: `docs/m2_next_phase_plan_kr.md`
