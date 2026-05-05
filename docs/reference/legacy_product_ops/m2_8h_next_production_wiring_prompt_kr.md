# M2-8H Next Production Wiring Prompt

Copy-paste prompt for the next Codex session:

```text
Goal:
Implement M2-8I production CDC recovery route wiring under the M2-8H conditional readiness decision.

Read first:
- docs/m2_8h_production_route_wiring_readiness_review_kr.md
- docs/m2_8h_route_wiring_decision_record_kr.md
- docs/m2_8b_test_only_harness_implementation_kr.md
- docs/m2_8g_final_pre_wiring_closure_kr.md
- apps/api/src/server.js
- apps/api/src/auth.js
- apps/api/src/error-response.js
- apps/api/src/cdc-recovery/*.js
- apps/api/src/cdc-recovery/test-support/*.js
- apps/api/src/cdc-recovery/cdc-recovery-route-level.test.js

Allowed M2-8I scope:
- production route module/factory if needed
- minimal server.js route registration if needed
- preserve M2-8B test-only harness
- add production route registration tests
- use stub repository only
- use safe error adapter only
- maintain auth role behavior
- maintain DTO safety
- add or update validators

Forbidden M2-8I scope:
- real DB queries
- Aurora connection
- SQL apply
- AWS, Kafka, Debezium, ClickHouse, psql, kubectl, deployment, or external infrastructure commands
- main OpenAPI merge
- direct Aurora repository
- raw field exposure
- broad refactor unrelated to CDC route wiring

Required behavior:
- register production CDC routes only through an isolated route factory
- keep M2-5 OpenAPI patch proposal-only
- keep main OpenAPI unchanged
- preserve all M2-8B route-level tests
- add production route registration tests
- stop if server.js requires broad refactor or if auth/error integration cannot remain minimal and tested
```
