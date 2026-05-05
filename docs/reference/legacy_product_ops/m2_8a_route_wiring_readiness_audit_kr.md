# M2-8A Route Wiring Readiness Audit

## 1. Purpose and Non-Goals

Purpose: M2-8A는 M2-7 non-wired CDC recovery skeleton을 live route로 연결하기 전에 route wiring readiness를 정적으로 감사하는 단계다. structured, traceable, evidence-safe recovery operation을 유지하면서 M2-8B에서 어떤 보강이 필요한지 결정한다.

Non-goals:

- not live route wiring
- `server.js` must not be modified in M2-8A
- no runtime route registration
- no real DB query implementation
- OpenAPI patch must not be merged yet
- no SQL apply
- no AWS, Kafka, Debezium, ClickHouse, psql, kubectl, deployment, or external infrastructure commands
- no raw payloads
- no full message bodies
- no issue raw values: issue title/body/payload/reporter values must not appear in API routes, logs, fixtures, tests, or DTO outputs
- no prod_change payload/actor values

## 2. Current M2-7 Skeleton Status

M2-7 provides a non-wired `apps/api/src/cdc-recovery/` module boundary:

- `cdc-recovery-handler.js` exposes `createCdcRecoveryHandler` and role-aware method wrappers.
- `cdc-recovery-service.js` validates replay request input, handles idempotency conflict 409 decisions, and handles invalid state transition 409 decisions.
- `cdc-recovery-dto-mapper.js` strips forbidden keys recursively and only projects safe DTO fields.
- `cdc-recovery-repository.js` is intentionally not implemented and has no real DB query behavior.
- `cdc-recovery-errors.js` provides CDC-specific safe error envelopes.
- targeted M2-7 tests cover DTO stripping, safe replay request DTO output, idempotency conflict 409, invalid state transition 409, and forbidden field validation.

Status: skeleton is suitable for readiness review, but it is not live route wiring and is not a production route.

## 3. Existing API Server Style Summary

`apps/api/src/server.js` uses `node:http`, a centralized `dispatchRequest` function, regex route matching, explicit handler calls, `attachRequestContext`, `createNoopMetricsEmitter`, and shared `handleRouteError`.

Current server behavior relevant to M2-8B:

- `enforceAuthorization()` runs before existing API routes.
- `auth.js` currently models `viewer` and `operator`, not the M2 CDC roles `readonly_role`, `operator`, `maintainer`, and `system_worker`.
- `error-response.js` maps known `AppError` values into JSON envelopes and maps unknown errors to `internal_error`.
- `server.js` currently does not import `cdc-recovery` and does not register `/api/v1/cdc/*` routes.

Readiness finding: M2-8B must reconcile existing `viewer/operator` auth style with the M2 role matrix before any mutation route is enabled.

## 4. Proposed Route-to-Handler Mapping

The planned route-to-handler mapping remains proposal-only for M2-8A:

| Proposed Route | Method | Handler Method | Required Role Readiness |
|---|---|---|---|
| `/api/v1/cdc/failures` | GET | `listFailures` | `readonly_role`, `operator`, `maintainer` |
| `/api/v1/cdc/failures/{failure_id}` | GET | `getFailureDetail` | `readonly_role`, `operator`, `maintainer` |
| `/api/v1/cdc/failures/{failure_id}/state-log` | GET | `listFailureStateLog` | `readonly_role`, `operator`, `maintainer` |
| `/api/v1/cdc/failures/{failure_id}/replay-requests` | POST | `createReplayRequest` | `operator`, `maintainer` |
| `/api/v1/cdc/replay-requests` | GET | `listReplayRequests` | `readonly_role`, `operator`, `maintainer` |
| `/api/v1/cdc/replay-requests/{replay_request_id}` | GET | `getReplayRequestDetail` | `readonly_role`, `operator`, `maintainer` |
| `/api/v1/cdc/replay-requests/{replay_request_id}/approve` | POST | `approveReplayRequest` | `maintainer` only |
| `/api/v1/cdc/replay-requests/{replay_request_id}/cancel` | POST | `cancelReplayRequest` | `maintainer` only |

M2-8A does not add these routes to `server.js`.

## 5. Auth/Role Enforcement Readiness

Required M2 role mapping:

- `readonly_role`: read-only failure and replay request inspection.
- `operator`: read actions and create replay/reprocess request.
- `maintainer`: read actions, create request, approve request, and cancel request.
- `system_worker`: future runtime execution status updates only.

Readiness gaps:

- `auth.js` currently has `viewer` and `operator` role precedence only.
- M2-8B must decide whether `viewer` maps to `readonly_role`, whether new token variables are required, and how `maintainer` and `system_worker` are represented.
- Role checks must happen before service mutation.
- Maintainer-only approve/cancel review is required before route registration.
- Authorization failures must use safe envelopes and must not reveal raw values.

Readiness finding: blocked until auth/role enforcement is explicitly designed and tested for `readonly_role`, `operator`, `maintainer`, and `system_worker`.

## 6. Error Envelope Readiness

Required error mapping review for M2-8B:

- 401 unauthorized
- 403 forbidden
- 404 not found
- 409 idempotency conflict
- 409 invalid state transition
- 500 internal error

Current readiness:

- Existing `error-response.js` supports generic route-level 401/403/404/409/500 mapping through `AppError`.
- CDC skeleton has `mapCdcRecoveryError()` with `status`, safe `code`, safe `message`, and optional `evidence_report_ref`.
- M2-8B must decide whether CDC errors are converted to shared `AppError` or written through a CDC-specific safe adapter.

Stop condition: any error envelope that exposes raw payloads, full message bodies, issue raw values, prod_change payload/actor values, SQL details, credentials, or compared idempotency values blocks route wiring.

## 7. DTO Mapper Safety Readiness

The safe DTO mapper is present and recursively strips forbidden keys before projection. M2-8B route responses must call safe DTO methods only:

- `toSafeFailureDto`
- `toSafeReplayRequestDto`
- `toSafeStateLogDto`
- `toSafeListDto`

Readiness requirements:

- Route-level tests must prove no raw payloads.
- Route-level tests must prove no full message bodies.
- Route-level tests must prove no issue raw values.
- Route-level tests must prove no prod_change payload/actor values.
- Responses must carry safe IDs, safe status, field-name sets, and `evidence_report_ref` only where already safe.

Readiness finding: mapper is ready as a safety boundary, but route-level enforcement is not yet tested.

## 8. OpenAPI Patch Merge Readiness

`sources/openapi_m2_5_dlq_replay_patch.yaml` remains proposal-only. OpenAPI patch must not be merged yet in M2-8A.

Merge prerequisites for M2-8B or later:

- M2-6, M2-7, M2-8A, and global safety validators pass.
- Auth/role mapping is finalized.
- Error envelope mapping is finalized for 401/403/404/409/500.
- DTO output field sets match OpenAPI schemas.
- Idempotency conflict 409 and invalid state transition 409 are represented safely.
- Maintainer-only approve/cancel behavior is tested.
- Main OpenAPI ownership and versioning are approved.

Readiness finding: not ready to merge into the main OpenAPI in M2-8A.

## 9. Repository Implementation Readiness

`CdcRecoveryRepository` is a named method boundary only. It does not implement real DB queries.

M2-8B repository readiness gaps:

- Aurora-backed repository behavior is not implemented.
- Transactions for replay request creation and safe state log transitions are not implemented.
- `appendFailureStateLog(input)` behavior must preserve append-only state history.
- `linkNewRunId(replayRequestId, newRunId)` must wait for a future worker-created new run row.
- Original failure and original run mutation must remain forbidden.

Readiness finding: live route wiring is blocked unless M2-8B uses explicit stubs for integration tests or implements a repository with local tests and no external infrastructure execution.

## 10. Integration Test Readiness

Required integration tests before live route registration:

- auth 401
- auth 403
- safe list failure success path
- failure detail 404
- create replay request validation 400
- idempotent duplicate 200
- new request 201 with safe DTO
- idempotency conflict 409
- invalid state transition 409
- maintainer-only approve/cancel review
- readonly/operator/maintainer/system_worker role mapping review
- recursive DTO stripping at route level
- no raw payloads
- no full message bodies
- no issue raw values
- no prod_change payload/actor values

Readiness finding: M2-7 has targeted unit tests, but M2-8B still needs route-level integration tests.

## 11. Stop Conditions

M2-8B route wiring must stop if any of these occur:

- live route wiring attempted during M2-8A
- `server.js` modification attempted during M2-8A
- OpenAPI main merge attempted during M2-8A
- SQL apply attempted
- external infrastructure command attempted
- raw payloads exposed
- full message bodies exposed
- issue raw values exposed
- prod_change payload/actor values exposed
- auth role mapping unclear
- role check occurs after service mutation
- maintainer-only approve/cancel rule is missing
- 401/403/404/409/500 error mapping is incomplete
- idempotency conflict 409 is not safe
- invalid state transition 409 is not safe
- repository implementation would mutate original failure or original run
- replay/reprocess path lacks a future new run row plan

## 12. Decision: Ready / Not Ready for M2-8B Route Wiring

Decision: not ready for M2-8B live route wiring.

Reason: M2-7 skeleton and DTO safety are ready for review, but auth role mapping, error envelope integration, repository implementation strategy, OpenAPI merge ownership, and route-level integration tests are not complete.

Permitted next step: M2-8B may start only as a scoped implementation task after the blockers below are resolved or explicitly accepted with stubs and tests.

## 13. Remaining Blockers

- Define how existing `viewer/operator` auth maps to `readonly_role`, `operator`, `maintainer`, and `system_worker`.
- Decide whether CDC errors adapt into shared `error-response.js` or stay behind a CDC-specific safe response adapter.
- Add route-level integration tests using in-memory or stub repositories before any live route registration.
- Define repository implementation boundaries without external infrastructure execution.
- Confirm OpenAPI patch ownership and schema parity before main OpenAPI merge.
- Confirm maintainer-only approve/cancel and system_worker future actions.
- Keep `server.js` unchanged for M2-8A.

M2-8B-Prep follow-up: `docs/m2_8b_prep_auth_role_reconciliation_kr.md` resolves the auth role reconciliation blocker at contract level only. M2-8B route wiring remains blocked until the remaining error envelope, repository, OpenAPI ownership, and route-level integration test blockers are resolved.

M2-8C-Prep follow-up: `docs/m2_8c_prep_error_envelope_integration_kr.md` resolves the CDC error envelope integration blocker at contract level only. M2-8B route wiring remains blocked until repository strategy, OpenAPI ownership, and route-level integration test blockers are resolved.

M2-8D-Prep follow-up: `docs/m2_8d_prep_repository_strategy_kr.md` resolves the repository strategy blocker at contract level only. M2-8B route wiring remains blocked until OpenAPI ownership and route-level integration test blockers are resolved.

M2-8E-Prep follow-up: `docs/m2_8e_prep_openapi_merge_ownership_kr.md` resolves the OpenAPI patch merge ownership blocker at contract level only. M2-8B route wiring remains blocked until route-level integration tests are resolved.

M2-8F-Prep follow-up: `docs/m2_8f_prep_route_level_integration_test_contract_kr.md` resolves the route-level integration test blocker at contract level only. M2-8B live route wiring remains blocked until the test-only harness and route-level integration tests are implemented and pass.

M2-8G final closure: `docs/m2_8g_final_pre_wiring_closure_kr.md` summarizes M2-8A through M2-8F and defines the M2-8B start gate. The next permitted implementation step is a test-only harness with route-level integration tests, not production `server.js` route wiring.
