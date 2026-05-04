# M2 Next Session Handoff

현재 상태: M2-1부터 M2-7까지 repo-local contract, dry-run package, DLQ/replay storage/API contract, M2-6 handler/service/repository contract, M2-7 non-wired skeleton과 targeted tests가 완료되었다. M2-8은 runtime route wiring planning only 상태이며, live route wiring은 시작하지 않았다.

Latest completed milestone: M2-9A live DB preflight gate documented NO-GO after M2-8O mocked Aurora repository passed validation.

## M2-8G Final Closure Reference

M2-8G documents the final pre-wiring Go/No-Go decision:

- GO for M2-8B test-only harness and route-level tests.
- GO for in-memory/stub repository, safe CDC error adapter tests, auth role mapping tests, DTO mapper safety tests, and OpenAPI proposal parity checks.
- NO-GO for production `server.js` route wiring, main OpenAPI merge, real DB queries, Aurora connection, SQL apply, external infrastructure commands, and direct Aurora repository implementation.

Recommended next implementation step: review M2-8B test-only harness results and decide whether a separate production wiring task may be scoped. Do not register live production routes until that task is explicitly approved.

## M2-8H Production Wiring Readiness Reference

M2-8H reviews the M2-8B test-only harness result and marks M2-8I as conditionally ready only under narrow scope:

- M2-8I may add production route module/factory if needed.
- M2-8I may minimally modify `server.js` only to register CDC routes through an isolated route factory.
- M2-8I must preserve M2-8B test-only harness and add production route registration tests.
- M2-8I must keep the in-memory/stub repository and safe error adapter behavior.
- M2-8I must not merge the main OpenAPI, implement real DB queries, connect to Aurora, apply SQL, run external infrastructure commands, or implement direct Aurora repository.

Recommended next implementation step: M2-8I production route wiring only if the M2-8H validator passes and the task keeps the exact conditional scope.

## M2-8I Production Route Wiring Reference

M2-8I implemented minimal production CDC recovery route registration:

- added `apps/api/src/cdc-recovery/cdc-recovery-routes.js`
- added `apps/api/src/cdc-recovery/cdc-recovery-production-routes.test.js`
- updated `apps/api/src/server.js` only to register CDC routes through the isolated dispatcher
- kept `auth.js` and `error-response.js` unchanged
- kept main OpenAPI unchanged
- kept `sources/openapi_m2_5_dlq_replay_patch.yaml` proposal-only
- kept direct Aurora repository, SQL apply, and external infrastructure out of scope

Recommended next task: M2-8J OpenAPI merge readiness review. Do not perform the actual OpenAPI main merge until M2-8J gates pass.

## M2-8J OpenAPI Merge Readiness Reference

M2-8J completed OpenAPI merge readiness review and schema parity evidence:

- added `docs/m2_8j_openapi_merge_readiness_review_kr.md`
- added `docs/m2_8j_schema_parity_evidence_kr.md`
- added `docs/m2_8j_openapi_merge_decision_record_kr.md`
- added `docs/m2_8j_next_merge_prompt_kr.md`
- added M2-8J OpenAPI readiness checklists, fixture, and validator
- kept `sources/personal_project_openapi_v0_2.yaml` unchanged
- kept `sources/openapi_m2_5_dlq_replay_patch.yaml` proposal-only

Recommended next task: M2-8M explicit OpenAPI merge implementation task only if the user wants to merge after reviewing M2-8J evidence and approval gates. Do not implement Aurora repository, SQL apply, or external infrastructure.

## M2-8M Explicit OpenAPI Merge Reference

M2-8M merged the CDC recovery API contract into `sources/personal_project_openapi_v0_2.yaml`:

- CDC Recovery tag, CDC paths, safe schemas, and redacted CDC error envelope were added.
- `sources/openapi_m2_5_dlq_replay_patch.yaml` remains proposal-only history.
- Runtime persistence remains in-memory/stub-backed.
- Aurora repository, SQL apply, and external infrastructure commands remain out of scope.

Recommended next task: M2-8N post-merge contract closure and Aurora repository implementation readiness gate. Do not implement Aurora repository or apply SQL until that gate passes.

## M2-8N / M2-8O / M2-9A Reference

M2-8N completed post-merge contract closure.

M2-8O added a mocked Aurora repository:

- `apps/api/src/cdc-recovery/cdc-recovery-aurora-repository.js`
- `apps/api/src/cdc-recovery/cdc-recovery-aurora-repository.test.js`
- injected DB client only
- parameterized SQL intent
- transaction-aware writes
- safe metadata projections only
- redacted persistence errors

M2-9A documented a NO-GO live DB preflight because no explicit dev/staging target, cleanup owner, evidence_report_ref, bounded sample-count, bounded time-window, or live rollback/verification evidence was provided.

A 2026-05-04 first re-attempt to convert M2-9A to GO was held closed because the task input did not supply the required operator evidence and the prompt's own critical rule forbade inventing it. Phase 0 baseline regression passed; Phase 1 was blocked at the gate; Phases 2–4 (SQL apply, runtime dry-run, final closure) were not entered. The detailed list of missing operator inputs and the re-entry procedure are in `docs/m2_9a_go_blocked_repair_prompt_kr.md`.

A 2026-05-04 second re-attempt was held closed for the same reason — the operator-evidence template was returned with all eleven groups still as `[FILL: ...]` placeholders.

A 2026-05-04 third re-attempt converted M2-9A to **GO** under explicit operator-supplied evidence. All eleven evidence groups arrived structurally complete and non-production-safe. The session recorded the GO state into `docs/m2_9a_live_db_preflight_go_evidence_kr.md`, `docs/m2_9a_live_db_target_evidence_kr.md`, `docs/m2_9a_schema_inspection_report_kr.md`, `docs/m2_9a_sql_apply_go_no_go_decision_kr.md`, and `docs/m2_9a_runtime_dry_run_bounds_kr.md`, added `scripts/validate_m2_9a_live_db_go.py` and `package.json` script `validate:m2-9a:live-db-go`, and produced `docs/m2_9b_next_sql_apply_prompt_kr.md`. SQL apply was **not** performed and runtime dry-run was **not** executed in this M2-9A task; the GO covers the preflight gate only. The earlier NO-GO records were preserved for audit.

A 2026-05-04 M2-9B SQL apply session executed the apply against `product-ops-dev-aurora`. Phase 0 baseline rerun was green, the rollback SQL (`infra/sql/aurora/m2_4_dlq_replay_metadata_rollback.sql`) was prepared and reviewed before apply, the apply ran under one minute as a single transaction with stop-on-first-error, and post-apply verification confirmed 3 of 3 tables, 10 of 10 named indexes, and 15 of 15 named constraints (plus 9 expected implicit PK/FK constraints; 24 total). Rollback was not needed and was not executed. Runtime dry-run was not executed. The constraint verification query distributed in M2-9A was corrected (the `conrelid::regclass::text` form returns unqualified names under default `search_path`); the corrected and a schema-agnostic alternative are recorded in `docs/m2_9b_schema_verification_report_kr.md` for use by M2-9C and beyond.

Latest milestone: **M2-9B SQL apply completed and verified**. M2-9C controlled runtime dry-run against the confirmed `product-ops-dev-aurora` dev target is the next task, with bounded sample-count `1` and bounded time-window `10 minutes`. Use the prompt at `docs/m2_9c_next_controlled_runtime_dry_run_prompt_kr.md`. Do not run dry-run until that prompt's Phase 0 + M2-9B baseline rerun is green and the operator has prepared a synthetic dev-only failure row payload, a writable evidence_report_ref destination, and reviewed cleanup commands bounded by `failure_id`.

## M2-9C And Final M2 Closure (2026-05-04)

A 2026-05-04 session executed M2-9C against `product-ops-dev-aurora` via `scripts/m2_9c_dry_run.js`. Repository-level controlled dry-run exercised the M2-8O Aurora repository against the live M2-9B schema for sample-count 1, time-window 10 minutes (observed 671 ms). All assertions passed: replay request creation, idempotency duplicate lookup, idempotency conflict rejected at the repository persistence boundary, state log append, valid and invalid failure transitions, valid and invalid replay request transitions. Cleanup complete; post-cleanup row counts 0/0/0 across the three M2-4 tables. Rollback not needed and not executed. The dry-run script's production-name guard was repaired in place to fix a `productops` false positive (`currentDb.includes("prod")` → explicit `M2_9C_ALLOWED_DATABASE` allowlist with precise production-keyword detection); production safety is preserved. A dev-only SSL verification bypass through a local SSM port-forward was used scoped to the M2-9C connection only.

The session then created the final M2 closure docs: `docs/m2_final_closure_summary_kr.md`, `docs/m2_final_validation_evidence_kr.md`, `docs/m2_final_runtime_boundary_decision_record_kr.md`, `docs/m2_final_artifact_index_kr.md`, `docs/m2_final_commit_plan_kr.md`, and rewrote `docs/m2_next_phase_plan_kr.md`.

Latest milestone: **M2 final closure recorded**. M2 is complete at the agreed live-DB-bounded scope.

Recommended next task: **staging schema apply** (work item 1 in `docs/m2_next_phase_plan_kr.md`). Reuse the M2-9B prompt structure with a new evidence set scoped to a confirmed staging target. Production apply remains out of scope until staging is in place and verified. Live wiring of the Aurora repository into production routes (work item 2) is the natural follow-on once staging is verified.

Validator results at final M2 closure:

- `npm run validate:m2-9c:runtime-dry-run-evidence` → 114 PASS, 0 FAIL
- `npm run validate:m2-9b:sql-apply-evidence` → 97 PASS, 0 FAIL
- `npm run validate:m2-9a:live-db-go` → 64 PASS, 0 FAIL
- `npm run validate:m2-9a:live-db-preflight` → 29 PASS, 0 FAIL (NO-GO history preserved)
- `npm run validate:m2:global-safety` → 6 PASS, 0 FAIL
- all M2-7 / M2-8 validators and tests → green
- `git diff --check` → exit 0

Validation results to rerun:

- `npm run validate:m2-6:handler-repository-contract`
- `npm run validate:m2-7:skeleton-contract`
- `npm run validate:m2:global-safety`
- `npm run test:m2-7:cdc-recovery`
- `python3 -m py_compile scripts/validate_m2_6_handler_repository_contract.py scripts/validate_m2_7_skeleton_contract.py scripts/validate_m2_global_safety.py`
- `git diff --check`

Recommended next Codex model: coding-focused GPT-5 class model with medium or high reasoning.

Recommended next task: M2-8 route wiring review plan execution, starting with auth/role matrix review and integration test design. Do not wire routes until the plan is approved.

Updated recommended next task: implement M2-8B test-only harness and route-level integration tests only, using `docs/m2_8g_final_pre_wiring_closure_kr.md` and `docs/m2_8g_go_no_go_summary_kr.md` as the start gate.

What not to do:

- do not start live route wiring
- do not implement real DB queries
- do not apply SQL
- do not merge the OpenAPI patch
- do not run AWS, psql, kubectl, Kafka, Debezium, ClickHouse, replication slot, or deployment commands
- do not introduce raw data capture

Copy-paste starter prompt:

```text
Continue in /home/lunar/projects/product-ops-backbone.
Read AGENTS.md and the M2-6/M2-7 closure summaries first.
M2-7 passed. Do not run external infrastructure commands.
Start M2-8 planning execution only: review route wiring strategy, auth/role gate, OpenAPI patch merge gate, repository implementation plan, and integration test plan. Do not wire live routes, do not implement real DB queries, do not apply SQL, and do not merge the OpenAPI patch.
Rerun M2-6/M2-7/global safety validators before any new change.
```

Updated copy-paste starter prompt:

```text
Continue in /home/lunar/projects/product-ops-backbone.
Read AGENTS.md and docs/m2_8g_final_pre_wiring_closure_kr.md first.
Implement M2-8B test-only harness and route-level integration tests only.
Use an in-memory/stub repository, safe CDC error adapter tests, auth role mapping tests, DTO mapper safety tests, and OpenAPI proposal parity checks.
Do not modify server.js for production route wiring, do not merge the main OpenAPI, do not implement real DB queries, do not apply SQL, and do not run external infrastructure commands.
Run the M2-8G/M2-8F/M2-8E/M2-8D/M2-8C/M2-8B-Prep/M2-8A/M2-7/global safety validators.
```
