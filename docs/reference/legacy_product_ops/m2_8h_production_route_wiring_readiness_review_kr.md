# M2-8H Production Route Wiring Readiness Review

## 1. Purpose and Non-Goals

Purpose: M2-8B test-only route-level integration harness가 통과한 뒤, production route wiring을 별도 M2-8I 작업으로 조건부 scope할 수 있는지 검토한다. 이 문서는 production route wiring readiness review이며 구현 단계가 아니다.

Non-goals:

- no live route wiring in M2-8H
- no `server.js` modification in M2-8H
- no `auth.js` modification in M2-8H
- no `error-response.js` modification in M2-8H
- no cdc-recovery runtime module modification in M2-8H
- no main OpenAPI merge in M2-8H
- no real DB queries
- no Aurora connection
- no SQL apply
- no AWS, Kafka, Debezium, ClickHouse, psql, kubectl, deployment, or external infrastructure commands
- no direct Aurora repository implementation
- no raw payloads
- no full message bodies
- no issue raw values
- no prod_change payload/actor values
- no stack traces
- no SQL details
- no persistence internals

## 2. Current M2-8B Test-Only Harness Result

M2-8B is complete as a test-only implementation:

- test-only harness implemented under `apps/api/src/cdc-recovery/test-support/`
- in-memory/stub repository implemented for tests
- safe CDC error adapter implemented for tests
- route-level integration tests passed
- auth role mapping tested
- DTO mapper safety tested
- OpenAPI proposal parity checked
- forbidden raw key scanner used on success and error responses
- production `server.js` route wiring was not added
- main OpenAPI was not modified
- M2-5 OpenAPI patch remains proposal-only
- no real DB queries, Aurora connection, SQL apply, or external infrastructure commands were run

## 3. What M2-8B Proved

M2-8B proved:

- all M2-5 CDC route strings can map to CDC handler/service behavior in a test-only harness
- missing auth returns safe 401
- `readonly_role` can read
- `readonly_role` cannot mutate and returns safe 403
- `operator` can create replay requests
- `operator` cannot approve/cancel and returns safe 403
- `maintainer` can approve/cancel
- `system_worker` cannot create arbitrary replay request
- safe 400, safe 403, safe 404, safe 409, and safe 500 behavior are covered
- in-memory/stub repository supports safe list/get, not found, idempotent duplicate, idempotency conflict, invalid state transition, approve/cancel, state log append observation, original failure immutable observation, and original run immutable observation
- success and error outputs pass DTO safety and forbidden-key checks
- OpenAPI proposal parity is checked at safe field level

## 4. What M2-8B Did Not Prove

M2-8B did not prove:

- production `server.js` dispatch registration
- integration with current `auth.js` route policy table
- integration with shared `error-response.js` behavior in production request flow
- production request parsing inside the existing `node:http` server
- production metrics/logging route labels
- live repository behavior
- Aurora-backed transaction behavior
- main OpenAPI merge readiness

These remain separate M2-8I or later concerns.

## 5. Production Route Wiring Risk Analysis

Key risks for production route wiring:

- `server.js` has centralized dispatch logic; careless edits could affect existing API routes.
- `auth.js` currently has only `viewer` and `operator`, while CDC requires `readonly_role`, `operator`, `maintainer`, and `system_worker`.
- CDC error envelopes include `status` and optional `evidence_report_ref`, while shared `error-response.js` has a narrower default shape.
- The repository skeleton has no real persistence and must not become a direct Aurora repository in M2-8I.
- OpenAPI patch remains proposal-only and must not be merged during route wiring.
- Mutation routes require stricter approval and must not expose raw payloads, full message bodies, issue raw values, prod_change payload/actor values, stack traces, SQL details, or persistence internals.

## 6. Protected Files Currently Unchanged

Protected files currently unchanged and still protected in M2-8H:

- `apps/api/src/server.js`
- `apps/api/src/auth.js`
- `apps/api/src/error-response.js`
- `sources/personal_project_openapi_v0_2.yaml`

M2-8H validator confirms these files have no working-tree diff.

## 7. CDC Runtime Module Status

CDC runtime modules remain unchanged in M2-8H:

- `apps/api/src/cdc-recovery/cdc-recovery-handler.js`: handler factory exists and role checks are present.
- `apps/api/src/cdc-recovery/cdc-recovery-service.js`: validation, idempotency, and transition helpers exist.
- `apps/api/src/cdc-recovery/cdc-recovery-dto-mapper.js`: DTO safety boundary exists.
- `apps/api/src/cdc-recovery/cdc-recovery-errors.js`: safe CDC error helpers exist.
- `apps/api/src/cdc-recovery/cdc-recovery-repository.js`: repository remains a non-persistent skeleton.

## 8. Proposed M2-8I Production Wiring Scope

M2-8I may be conditionally scoped as production route wiring only if it stays narrow:

- add a production CDC route module or isolated route factory if needed
- minimally register CDC recovery routes in `server.js` through the isolated route factory
- preserve M2-8B test-only harness
- add production route registration tests
- continue using in-memory/stub repository for route tests
- use safe error adapter only
- maintain auth role behavior from M2-8B-Prep
- maintain DTO safety from M2-8B
- add validators proving no OpenAPI merge, no real DB queries, and no unsafe output

## 9. Files M2-8I May Modify

M2-8I may modify only under explicit scope:

- `apps/api/src/server.js` only for minimal CDC route registration through an isolated route factory
- a new CDC route module/factory if needed
- test files for production route registration
- test-support files if needed to preserve M2-8B behavior
- validator and documentation files
- `package.json` for M2-8I scripts

Any `server.js` modification must be small, reviewed, and covered by tests.

## 10. Files M2-8I Must Not Modify

M2-8I must not modify:

- `sources/personal_project_openapi_v0_2.yaml`
- `sources/openapi_m2_5_dlq_replay_patch.yaml` except preserving proposal-only status
- SQL files
- deployment or infrastructure files
- direct Aurora repository implementation files
- unrelated API handlers

M2-8I should avoid modifying `auth.js` and `error-response.js` unless the explicit M2-8I scope is revised and tests prove minimal auth/error integration. If changed, the task must stop and be re-scoped.

## 11. Required M2-8I Test Expansion

M2-8I must add or preserve:

- all M2-8B route-level tests
- production route registration tests required
- auth role behavior tests through the production route path
- safe error adapter tests through the production route path
- DTO safety tests through production route outputs
- no raw payloads / no full message bodies / no issue raw values / no prod_change payload/actor values checks
- safe 400/401/403/404/409/500 route tests
- `server.js` registration tests proving CDC routes are reachable only through approved route factory behavior
- regression tests proving existing non-CDC routes are not broken

## 12. Auth Integration Readiness

Auth integration is conditionally ready. M2-8B proved safe role behavior in the test harness, but production `auth.js` still has a `viewer`/`operator` baseline. M2-8I must keep auth integration minimal and tested:

- readonly compatibility must not mutate
- operator must not approve/cancel
- maintainer-only approve/cancel must be enforced
- system_worker must not create arbitrary replay requests
- role checks must happen before service mutation
- authorization errors must remain safe

## 13. Error Adapter Integration Readiness

Error adapter integration is conditionally ready. M2-8B proved a safe error adapter in tests. M2-8I must integrate only safe error adapter behavior:

- validation errors return safe 400
- missing auth returns safe 401
- forbidden roles return safe 403
- missing records return safe 404
- idempotency conflict returns safe 409
- invalid state transition returns safe 409
- unknown errors return safe 500
- no stack traces, SQL details, persistence internals, compared request bodies, or compared idempotency values

## 14. Handler Factory Integration Readiness

Handler factory integration is conditionally ready. M2-8I should reuse `createCdcRecoveryHandler()` through an isolated route factory rather than embedding route behavior directly in `server.js`.

The isolated route factory should keep route parsing, handler context creation, safe response writing, and safe error adaptation localized.

## 15. Repository Boundary Readiness

Repository boundary is conditionally ready for stub-backed production route tests only.

M2-8I must keep the in-memory/stub repository for tests and must not implement direct Aurora repository behavior. Direct Aurora repository remains separate until migration review, rollback strategy, controlled runtime gate, and persistence-specific tests are approved.

## 16. OpenAPI Merge Status

OpenAPI merge remains not ready. The M2-5 patch remains proposal-only:

- `sources/openapi_m2_5_dlq_replay_patch.yaml`
- marker: `PROPOSAL ONLY - DO NOT MERGE AUTOMATICALLY`

M2-8I must keep the M2-5 OpenAPI patch proposal-only and must not merge `sources/personal_project_openapi_v0_2.yaml`.

## 17. Rollback Strategy

M2-8I must include rollback strategy:

- CDC route registration must be isolated and removable as one small `server.js` dispatch block or route factory call.
- New CDC route module/factory must be self-contained.
- No schema migration, SQL apply, or persistence rollout may be coupled to route registration.
- If route tests fail or safety scanner fails, remove the CDC registration and keep the M2-8B test-only harness intact.
- Main OpenAPI remains unchanged, so rollback does not require contract merge reversal.

## 18. Stop Conditions

Stop M2-8I or any production wiring attempt if any of these occur:

- broad `server.js` refactor is needed
- `auth.js` modification is required without an approved scope change
- `error-response.js` modification is required without an approved scope change
- cdc-recovery runtime module modification is required outside an isolated route factory need
- main OpenAPI merge is attempted
- real DB queries are introduced
- Aurora connection is introduced
- SQL apply is attempted
- external infrastructure commands are attempted
- direct Aurora repository implementation is started
- OpenAPI patch loses proposal-only marker
- raw payloads, full message bodies, issue raw values, prod_change payload/actor values, stack traces, SQL details, or persistence internals are exposed

## 19. Decision: Ready / Not Ready for M2-8I Production Route Wiring

Decision: M2-8I production route wiring is conditionally ready.

The readiness is conditional because M2-8I may only perform minimal production route registration through an isolated route factory, continue using in-memory/stub repository tests, preserve the M2-8B harness, add production route registration tests, keep the M2-5 OpenAPI patch proposal-only, avoid real persistence, and avoid all external infrastructure.

## 20. Remaining Blockers

Remaining blockers before live production confidence:

- M2-8I production route registration is implemented through `apps/api/src/cdc-recovery/cdc-recovery-routes.js` and one minimal `server.js` dispatcher registration.
- M2-8I production route registration tests are implemented in `apps/api/src/cdc-recovery/cdc-recovery-production-routes.test.js`.
- Production CDC auth integration is route-local and minimal; `auth.js` remains unchanged.
- Production CDC safe error adapter behavior is route-local; `error-response.js` remains unchanged.
- Direct Aurora repository remains blocked.
- Main OpenAPI merge remains blocked.
- SQL migration and rollback gates remain blocked.

M2-8I implementation reference: `docs/m2_8i_production_route_wiring_implementation_kr.md`.
