# M2-8G Next Implementation Prompt

Copy-paste prompt for the next Codex session:

```text
Goal:
Implement M2-8B as test-only route-level integration harness work.

Context:
M2-8A through M2-8G are complete at contract level.
M2-8G final decision is GO for test-only harness + route-level tests and NO-GO for live production route wiring.

Read first:
- docs/m2_8g_final_pre_wiring_closure_kr.md
- docs/m2_8g_go_no_go_summary_kr.md
- docs/m2_8f_prep_route_level_integration_test_contract_kr.md
- docs/m2_8e_prep_openapi_merge_ownership_kr.md
- docs/m2_8d_prep_repository_strategy_kr.md
- docs/m2_8c_prep_error_envelope_integration_kr.md
- docs/m2_8b_prep_auth_role_reconciliation_kr.md
- docs/m2_8a_route_wiring_readiness_audit_kr.md
- apps/api/src/cdc-recovery/*.js
- sources/openapi_m2_5_dlq_replay_patch.yaml

Implement only:
- isolated test-only harness
- in-memory/stub repository for tests
- safe CDC error adapter for tests
- route-level integration tests
- validation script if needed

Explicitly forbidden:
- server.js production route registration
- main OpenAPI merge
- real DB queries
- Aurora connection
- SQL apply
- AWS, Kafka, Debezium, ClickHouse, psql, kubectl, deployment, or external infrastructure commands
- direct Aurora repository implementation
- raw payloads, full message bodies, issue raw values, prod_change payload/actor values, stack traces, SQL details, persistence internals, compared request bodies, or compared idempotency values

M2-8B acceptance:
- test-only harness proves auth role mapping, safe CDC error adapter behavior, DTO mapper safety, in-memory/stub repository behavior, OpenAPI proposal parity, and mutation route stricter approval together
- M2-8B may implement test-only harness and route-level tests, but must not register live production routes
- stop if protected runtime files are modified outside the approved test-only harness scope

Validation chain:
- npm run validate:m2-8g:final-pre-wiring
- npm run validate:m2-8f-prep:route-tests
- npm run validate:m2-8e-prep:openapi-ownership
- npm run validate:m2-8d-prep:repository-strategy
- npm run validate:m2-8c-prep:error-envelope
- npm run validate:m2-8b-prep:auth-roles
- npm run validate:m2-8a:route-readiness
- npm run validate:m2-7:skeleton-contract
- npm run validate:m2:global-safety
- npm run test:m2-7:cdc-recovery
- M2-8B route-level integration test command once added
- git diff --check
- git status --short
```
