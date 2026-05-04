# M2-8G Final Pre-Wiring Closure

## 1. Purpose and Non-Goals

Purpose: M2-8A through M2-8F prep work를 하나의 final pre-wiring closure로 정리하고, M2-8B start gate를 명확히 정의한다. 이 단계는 route wiring 전에 structured, traceable, evidence-safe recovery operation을 보존하기 위한 최종 go/no-go 요약이다.

Non-goals:

- no live route wiring in M2-8G
- no `server.js` modification in M2-8G
- no `auth.js` modification in M2-8G
- no `error-response.js` modification in M2-8G
- no cdc-recovery runtime module modification in M2-8G
- no production route registration
- no OpenAPI main merge in M2-8G
- no real DB queries
- no Aurora connection
- no SQL apply
- no AWS, Kafka, Debezium, ClickHouse, psql, kubectl, deployment, or external infrastructure commands
- no production runtime behavior change
- no raw payloads
- no full message bodies
- no issue raw values
- no prod_change payload/actor values
- no stack traces
- no SQL details
- no persistence internals

## 2. M2-8A Through M2-8F Completion Summary

M2-8A through M2-8F are complete as contract and readiness artifacts:

- M2-8A route readiness audit complete.
- M2-8B-Prep auth role reconciliation complete.
- M2-8C-Prep error envelope integration complete.
- M2-8D-Prep repository strategy complete.
- M2-8E-Prep OpenAPI merge ownership complete.
- M2-8F-Prep route-level integration test contract complete.

These steps did not modify production route wiring and did not merge the M2-5 OpenAPI proposal into the main OpenAPI.

## 3. What Each Prep Step Resolved

| Prep Step | Resolved Contract Decision | Remaining Implementation Meaning |
|---|---|---|
| M2-8A route readiness audit | Identified live route wiring blockers and protected `server.js` from early changes. | M2-8B must start only after prep blockers are resolved. |
| M2-8B-Prep auth role reconciliation | `viewer` maps only to `readonly_role` candidate; `operator` maps only to `operator`; `maintainer` and `system_worker` are new required roles. | M2-8B must test auth role mapping before service mutation. |
| M2-8C-Prep error envelope integration | Expected CDC errors should be normalized through a safe CDC handler-boundary adapter; 401/403 remain auth-layer concerns. | M2-8B must test safe 400/401/403/404/409/500 behavior. |
| M2-8D-Prep repository strategy | Use an explicit in-memory/stub repository first; direct Aurora repository deferred. | M2-8B must not implement real DB queries. |
| M2-8E-Prep OpenAPI merge ownership | M2-5 OpenAPI patch remains proposal-only and is used as test reference only. | Main OpenAPI merge waits for route tests, parity, safety, and approvals. |
| M2-8F-Prep route-level integration test contract | M2-8B should start with an isolated test-only harness. | M2-8B may implement test-only harness and route-level tests, but not production route wiring. |

## 4. Current Route Wiring Readiness Status

Current status: ready for M2-8B test-only harness implementation, not ready for live production route wiring.

The final pre-wiring status is:

- GO for isolated test-only harness design.
- GO for in-memory/stub repository route tests.
- GO for safe CDC error adapter tests.
- GO for auth role mapping tests.
- GO for DTO mapper safety route-output tests.
- GO for OpenAPI proposal parity checks.
- NO-GO for production `server.js` route wiring.
- NO-GO for main OpenAPI merge.
- NO-GO for direct Aurora repository implementation.

## 5. What Remains Blocked

Blocked until route-level tests pass and follow-up approvals are recorded:

- production `server.js` route registration
- main OpenAPI merge
- direct Aurora repository implementation
- real DB queries
- Aurora connection
- SQL apply
- AWS, Kafka, Debezium, ClickHouse, psql, kubectl, deployment, or external infrastructure commands
- production runtime behavior change

## 6. What Is Allowed in M2-8B

Allowed M2-8B scope:

- isolated test-only harness
- in-memory/stub repository for tests
- safe CDC error adapter for tests
- auth role mapping tests
- DTO mapper safety route-output tests
- OpenAPI proposal parity checks
- route-level integration tests for all M2-5 CDC recovery routes
- validators that prove protected files remain unchanged

M2-8B may implement test-only harness and route-level tests, but must not register live production routes.

## 7. What Is Still Forbidden in M2-8B

Still forbidden in M2-8B unless a later approved task explicitly changes the boundary:

- production `server.js` route wiring
- main OpenAPI merge
- real DB queries
- Aurora connection
- SQL apply
- external infrastructure commands
- direct Aurora repository implementation
- raw payloads
- full message bodies
- issue raw values
- prod_change payload/actor values
- stack traces
- SQL details
- persistence internals
- compared request bodies
- compared idempotency values

## 8. Validation Command Map

Required validation chain:

- `python3 scripts/validate_m2_8g_final_pre_wiring.py`
- `npm run validate:m2-8g:final-pre-wiring`
- `npm run validate:m2-8f-prep:route-tests`
- `npm run validate:m2-8e-prep:openapi-ownership`
- `npm run validate:m2-8d-prep:repository-strategy`
- `npm run validate:m2-8c-prep:error-envelope`
- `npm run validate:m2-8b-prep:auth-roles`
- `npm run validate:m2-8a:route-readiness`
- `npm run validate:m2-7:skeleton-contract`
- `npm run validate:m2:global-safety`
- `npm run test:m2-7:cdc-recovery`
- `python3 -m py_compile scripts/validate_m2_8g_final_pre_wiring.py`
- `git diff --check`
- `git status --short`

## 9. Protected Files

Protected files that must remain unchanged until an approved implementation task explicitly permits changes:

- `apps/api/src/server.js`
- `apps/api/src/auth.js`
- `apps/api/src/error-response.js`
- `sources/personal_project_openapi_v0_2.yaml`

M2-8G also protects cdc-recovery runtime modules from modification.

## 10. Proposal-Only Files

Proposal-only file:

- `sources/openapi_m2_5_dlq_replay_patch.yaml`

This file must retain `PROPOSAL ONLY - DO NOT MERGE AUTOMATICALLY`. It remains the M2-8B route-level test reference only and must not be merged into the main OpenAPI in M2-8G.

## 11. Safe-Data Boundary Summary

The CDC recovery route surface must remain safe metadata only:

- safe IDs, safe status labels, safe role labels, safe action labels, safe field-name sets, and safe `evidence_report_ref` are allowed.
- raw payloads are forbidden.
- full message bodies are forbidden.
- issue raw values are forbidden.
- prod_change payload/actor values are forbidden.
- stack traces are forbidden.
- SQL details are forbidden.
- persistence internals are forbidden.
- compared request bodies and compared idempotency values are forbidden.

No route, test, fixture, doc, DTO, error envelope, or log may become a raw data dump path.

## 12. Final Decision

Final decision: GO for M2-8B as test-only harness plus route-level tests; NO-GO for live production route wiring.

M2-8B start gate: implement only the isolated test-only harness, in-memory/stub repository for tests, safe CDC error adapter for tests, auth role mapping tests, DTO mapper safety tests, OpenAPI proposal parity checks, and route-level integration tests. Stop if protected runtime files are modified outside the approved test-only harness scope.

M2-8B implementation reference: `docs/m2_8b_test_only_harness_implementation_kr.md` records the test-only harness and route-level tests. If M2-8B validation passes, this satisfies the approved test-only start gate while production `server.js` route wiring remains forbidden.

M2-8H review reference: `docs/m2_8h_production_route_wiring_readiness_review_kr.md` reviews the M2-8B test-only results before any production wiring. M2-8I may be conditionally scoped only after M2-8H validation passes.
