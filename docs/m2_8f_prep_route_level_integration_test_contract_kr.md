# M2-8F-Prep Route-Level Integration Test Contract

## 1. Purpose and Non-Goals

Purpose: M2-8B live route wiring before any production route registration, define the route-level integration test contract for CDC recovery routes. The tests must prove structured, traceable, evidence-safe recovery behavior across auth, handler, service, DTO mapper, safe error envelope, and an explicit in-memory/stub repository.

Non-goals:

- not live route wiring
- no `server.js` modification in this step
- no `auth.js` modification in this step
- no `error-response.js` modification in this step
- no cdc-recovery runtime module modification in this step
- no route registration
- no OpenAPI main merge in this step
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

## 2. Current M2-7 Test Baseline

M2-7 has a non-wired CDC recovery skeleton and targeted pure unit tests:

- `cdc-recovery-handler.js` exposes handler methods and role authorization hooks but is not registered through `server.js`.
- `cdc-recovery-service.js` validates create replay request input, idempotency decisions, and state transition decisions without real persistence.
- `cdc-recovery-dto-mapper.js` strips forbidden response fields and projects safe DTO fields.
- `cdc-recovery-repository.js` is intentionally a `NotImplementedError` skeleton with no real DB queries.
- `*.test.js` verifies DTO safety, idempotency duplicate/conflict, invalid state transition, and forbidden field rejection.

The M2-7 baseline does not prove route parsing, auth-layer behavior, route error envelopes, OpenAPI proposal parity, or combined route outputs.

## 3. M2-8B Future Route Test Objective

Future M2-8B route tests must prove the CDC route surface is safe before production route wiring:

- every M2-5 route maps to the intended handler action
- auth checks happen before service mutation
- read routes allow `readonly_role`, `operator`, and `maintainer`
- mutation routes enforce `operator` create and maintainer-only approve/cancel
- `system_worker` cannot create arbitrary replay request and remains a future worker boundary
- expected 400, 401, 403, 404, 409, and 500 outcomes return safe error envelopes
- success and error responses contain no raw payloads, no full message bodies, no issue raw values, no prod_change payload/actor values, no stack traces, no SQL details, and no persistence internals
- route outputs match `sources/openapi_m2_5_dlq_replay_patch.yaml` at the safe field level while the patch remains proposal-only

## 4. Stub Repository Requirement

M2-8B route-level integration tests must use an explicit in-memory/stub repository first. The stub must implement the M2-6 repository contract without Aurora, SQL, or external infrastructure.

Required simulated behaviors:

- safe list/get behavior
- not found
- create replay request success
- exact idempotent duplicate
- idempotency conflict
- invalid state transition
- approve/cancel state transitions
- unknown internal error path
- `linkNewRunId` as a future worker-only boundary, not a human route action

Stub output must be safe metadata only and must be passed through the DTO mapper.

## 5. Test Harness Options

Option A: test handler factory directly without `server.js`.

- Pros: avoids route registration and isolates handler/service/DTO behavior.
- Cons: does not prove HTTP route parsing or auth/error integration shape.

Option B: create isolated test-only router/server harness.

- Pros: proves route parsing, auth adapter behavior, error adapter behavior, DTO output, and stub repository decisions without modifying `server.js`.
- Cons: requires a small test-only harness in M2-8B and strict checks that it is not production route wiring.

Option C: wire `server.js` routes directly.

- Pros: closest to live runtime.
- Cons: violates this prep boundary and should not happen until route-level safety gates are defined and accepted.

## 6. Recommended Decision

Recommended decision: use Option B for M2-8B.

M2-8B should start with an isolated test-only harness around the CDC handler, service, DTO mapper, safe CDC error adapter, and explicit in-memory/stub repository. M2-8F does not modify `server.js` and does not register live routes.

The test-only harness should use the M2-5 OpenAPI proposal as the route-level integration test reference, not as a merged main OpenAPI contract. Read routes and mutation routes may be tested together, but mutation routes require stricter maintainer-only, idempotency, evidence, and state transition assertions.

## 7. Route-Level Test Case Matrix

| Route | Kind | Required Scenarios | Expected Safe Outcomes |
|---|---|---|---|
| GET /api/v1/cdc/failures | read | auth missing safe 401; readonly_role read allowed; list failures returns safe DTO list; success responses contain no forbidden raw keys | 200, 401, 403, 500 |
| GET /api/v1/cdc/failures/{failure_id} | read | readonly_role can read; failure detail not found returns safe 404; DTO mapper safety | 200, 401, 403, 404, 500 |
| GET /api/v1/cdc/failures/{failure_id}/state-log | read | state log returns safe DTO list; schema parity; no raw field regression | 200, 401, 403, 404, 500 |
| GET /api/v1/cdc/replay-requests | read | readonly_role can read; list replay requests returns safe DTO list | 200, 401, 403, 500 |
| GET /api/v1/cdc/replay-requests/{replay_request_id} | read | readonly_role can read; not found returns safe 404; DTO mapper safety | 200, 401, 403, 404, 500 |
| POST /api/v1/cdc/failures/{failure_id}/replay-requests | mutation | readonly_role mutation forbidden; operator create allowed; system_worker cannot create arbitrary replay request; create replay request validation error returns safe 400; create replay request success returns safe 201; exact idempotent duplicate returns safe 200; idempotency conflict returns safe 409 | 200, 201, 400, 401, 403, 404, 409, 500 |
| POST /api/v1/cdc/replay-requests/{replay_request_id}/approve | mutation | operator cannot approve/cancel; maintainer can approve/cancel; approve invalid state transition returns safe 409; mutation routes require stricter approval tests | 200, 400, 401, 403, 404, 409, 500 |
| POST /api/v1/cdc/replay-requests/{replay_request_id}/cancel | mutation | operator cannot approve/cancel; maintainer can approve/cancel; cancel invalid state transition returns safe 409; mutation routes require stricter approval tests | 200, 400, 401, 403, 404, 409, 500 |

Every route-level test case must also assert route outputs match proposal schemas at the safe field level and that the global safety scanner passes after route tests are added.

## 8. Auth/Role Test Cases

Required auth/role cases:

- auth missing safe 401
- `readonly_role` read allowed
- `readonly_role` mutation forbidden with safe 403
- `operator` create allowed
- `operator` approve/cancel forbidden with safe 403
- `maintainer` approve/cancel allowed
- `system_worker` cannot create arbitrary replay request
- role checks before service mutation

Authorization failures must not reveal raw values. Logs may include route label, status, request_id, and safe role label only.

## 9. Error Envelope Test Cases

Required safe error cases:

- safe 400 `validation_error`
- safe 401 `unauthorized`
- safe 403 `forbidden`
- safe 404 `not_found`
- safe 409 `idempotency_conflict`
- safe 409 `invalid_state_transition`
- safe 500 `internal_error`

Error responses must contain no forbidden raw keys and must not include raw payloads, full message bodies, issue raw values, prod_change payload/actor values, stack traces, SQL details, compared request values, or persistence internals.

## 10. DTO Safety Test Cases

DTO mapper safety tests must cover:

- failure summary list
- failure detail
- failure state log list
- replay request summary list
- replay request detail
- create replay request response
- approve replay request response
- cancel replay request response
- success responses contain no forbidden raw keys
- error responses contain no forbidden raw keys

DTO mapper safety means allowed field names only, safe metadata only, and `evidence_report_ref` only as a safe reference string.

## 11. Repository Behavior Simulation Cases

The in-memory/stub repository must simulate:

- `listFailures` safe list result
- `getFailureById` success and not found
- `listFailureStateLog` safe list result
- `listReplayRequests` safe list result
- `getReplayRequestById` success and not found
- `findReplayRequestByIdempotencyKey` duplicate and conflict setup
- `createReplayRequest` success
- `appendFailureStateLog` append-only behavior
- `updateFailureStatus` approved/cancelled transition support
- `updateReplayRequestStatus` approved/cancelled transition support
- `linkNewRunId` future worker-only boundary

The stub must not expose raw persistence errors or persistence internals.

## 12. OpenAPI Proposal Parity Checks

M2-8B route tests should compare route outputs against the proposal patch only:

- `sources/openapi_m2_5_dlq_replay_patch.yaml` remains proposal-only.
- no OpenAPI main merge occurs before tests pass.
- read route output fields match safe schemas.
- mutation request/response fields match safe schemas.
- error envelope redaction matches M2-8C.
- auth/role documentation parity matches M2-8B.
- DTO mapper safety matches M2-8E schema parity expectations.

Any schema parity mismatch should update the proposal patch through a separate reviewed contract change, not through an implicit main OpenAPI merge.

## 13. Mutation Route Stricter Approval Tests

Mutation routes require stricter tests than read routes because they create recovery intent or change approval/cancel state.

Required stricter checks:

- maintainer-only approve/cancel
- operator approve/cancel forbidden
- readonly_role mutation forbidden
- system_worker cannot create arbitrary replay request
- idempotency_key required for create
- evidence_report_ref required for create/approve/cancel where the contract requires it
- idempotency conflict returns safe 409
- invalid state transition returns safe 409
- state log append-only expectation is asserted through stub observation
- original failure immutable and original run immutable expectations are asserted through stub observation

## 14. Global Safety Regression Requirement

After future M2-8B route tests are added:

- `npm run validate:m2:global-safety` must pass.
- Route success fixtures must contain no raw payloads, no full message bodies, no issue raw values, and no prod_change payload/actor values.
- Route error fixtures must contain no stack traces, no SQL details, and no persistence internals.
- Test-only harness code must not log or serialize forbidden raw values.

## 15. Stop Conditions

Stop if any of these occur:

- live route wiring in this step
- `server.js` modification in this step
- `auth.js` modification in this step
- `error-response.js` modification in this step
- cdc-recovery runtime module modification in this step
- OpenAPI main merge in this step
- SQL apply attempted
- external infrastructure commands attempted
- test-only harness is replaced by production route registration before gates pass
- in-memory/stub repository is bypassed by real DB queries
- auth missing safe 401 is not tested
- `readonly_role` can mutate
- `operator` can approve/cancel
- `maintainer` approve/cancel allowed path is not tested
- `system_worker` can create arbitrary replay request
- safe 400, safe 403, safe 404, safe 409, or safe 500 is missing
- DTO mapper safety is not tested
- schema parity is not tested
- raw payloads exposed
- full message bodies exposed
- issue raw values exposed
- prod_change payload/actor values exposed
- stack traces exposed
- SQL details exposed
- persistence internals exposed

## 16. Decision: Ready / Not Ready for M2-8B Route Wiring

Decision: route-level integration test contract is ready as a contract input, but M2-8B live route wiring remains not ready.

Accepted route-level integration test strategy: M2-8B should first implement an isolated test-only harness with an explicit in-memory/stub repository. The harness must test auth/role mapping, CDC safe error adapter behavior, DTO mapper safety, repository simulation decisions, mutation route stricter approvals, and OpenAPI proposal parity before any production route wiring.

## 17. Remaining Blockers After Route-Level Test Contract

The route-level test blocker is resolved at contract level only. Remaining implementation blockers before live route wiring:

- implement the isolated test-only harness in M2-8B
- implement route-level integration tests and pass them
- implement auth mapping without changing production behavior prematurely
- implement CDC safe error adapter without raw detail propagation
- implement explicit in-memory/stub repository for route tests
- keep the M2-5 OpenAPI patch proposal-only until route tests and approvals pass
- defer direct Aurora repository until migration and controlled runtime gates pass
