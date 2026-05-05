# M2-8C-Prep CDC Error Envelope Integration

## 1. Purpose and Non-Goals

Purpose: M2-8B live route wiring 전에 CDC recovery domain errors를 existing shared API error style과 어떻게 연결할지 contract로 확정한다. Error handling은 structured, traceable, evidence-safe recovery operation을 보존해야 한다.

Non-goals:

- not live route wiring
- `server.js` must not be modified
- `auth.js` must not be modified
- `error-response.js` must not be modified
- no production error behavior change
- no route registration
- no real DB query implementation
- no OpenAPI main merge
- no SQL apply
- no AWS, Kafka, Debezium, ClickHouse, psql, kubectl, deployment, or external infrastructure commands
- no raw payloads
- no full message bodies
- no issue raw values
- no prod_change payload/actor values
- no stack traces
- no SQL details

## 2. Current shared error-response.js Behavior Summary

`apps/api/src/error-response.js` defines the shared API error path:

- `AppError` carries `statusCode`, `code`, `message`, and optional `details`.
- helper constructors exist for `badRequest`, `unauthorized`, `forbidden`, `notFound`, `conflict`, and `configInvalid`.
- `mapErrorToHttpResponse(error)` maps `AppError` into `{ error: { code, message } }`.
- unknown errors are mapped to 500 `{ error: { code: "internal_error", message: "internal server error" } }`.
- route failure logs include method, sanitized path, error kind, code, and status.
- unknown repository-like errors are classified without exposing stack traces, SQL details, raw connection strings, or persistence internals in the response.

This task does not modify shared error behavior.

## 3. Current CDC Recovery Error Helper Summary

`apps/api/src/cdc-recovery/cdc-recovery-errors.js` defines CDC-safe domain helpers:

- `CdcRecoveryError` carries `statusCode`, `code`, `message`, and optional `evidenceReportRef`.
- helpers exist for `validationError`, `unauthorizedError`, `forbiddenError`, `notFoundError`, `conflictError`, and `internalError`.
- `mapCdcRecoveryError()` maps known CDC errors into `{ error: { code, message, status, evidence_report_ref? } }`.
- unknown CDC errors map to 500 with `internal_error` and a generic message.

CDC service helpers already produce safe 409 objects for `idempotency_conflict` and `invalid_state_transition`.

## 4. Integration Options

Option A: adapt CDC recovery errors into shared `AppError` / `error-response.js`.

- Pros: one global route error pipeline.
- Cons: current shared `AppError` body does not include `status` or `evidence_report_ref`; preserving those fields requires either extending shared behavior or adding an adapter.

Option B: use CDC-specific safe adapter at route handler boundary.

- Pros: preserves CDC `status` and `evidence_report_ref` while keeping shared 500 fallback for unknown errors.
- Cons: M2-8B must add a small boundary adapter and route-level tests.

Option C: keep handler-returned safe responses and avoid throwing for expected CDC conflicts.

- Pros: expected validation and conflict flows can stay explicit.
- Cons: route code must consistently distinguish success, expected domain denial, and unknown runtime failure.

## 5. Recommended Decision

Recommended decision: combine Option B and Option C.

Future M2-8B route wiring should:

- treat expected CDC domain errors as safe handler-boundary outcomes
- convert `CdcRecoveryError` and service decision errors into a CDC-safe error envelope
- keep 401 and 403 as auth-layer concerns
- avoid throwing for expected 400/404/409 CDC domain decisions when a safe response can be returned
- pass unknown errors to existing shared 500 handling only after raw detail is stripped or wrapped as a generic internal error
- never include compared request bodies, compared idempotency values, raw failed message values, SQL details, stack traces, persistence internals, or unsafe field values

## 6. Error Code/Status Matrix

| Error Case | Source Layer | Expected Status | Safe Code | Safe Message Rule | Allowed Fields | Forbidden Fields | evidence_report_ref Allowed | Log Rule | Route-Level Test Expectation |
|---|---|---:|---|---|---|---|---|---|---|
| validation error | CDC handler/service | 400 | `validation_error` | generic validation reason or field-name set only | code, message, status, safe field names, evidence_report_ref | raw values, compared request body, issue raw values | conditional, only when already safe | log route label, status, safe field count | invalid input returns safe 400 |
| unauthorized | auth layer | 401 | `unauthorized` | no credential detail | code, message, status | credentials, tokens, role inventory | no | log route label and status only | missing/invalid auth returns safe 401 |
| forbidden | auth layer | 403 | `forbidden` | no principal raw values | code, message, status | role inventory, principal raw values | no | log role category only | under-scoped role returns safe 403 |
| not found | CDC handler/repository boundary | 404 | `not_found` | record missing only | code, message, status, safe id | raw record details | no | log safe ID only | unknown failure/request returns safe 404 |
| idempotency conflict | CDC service | 409 | `idempotency_conflict` | conflict on normalized intent only | code, message, status, evidence_report_ref, safe field names | compared values, compared request body, compared idempotency values | yes, only safe reference | log key hash/ref only | conflicting replay request returns safe 409 |
| invalid state transition | CDC service | 409 | `invalid_state_transition` | transition not allowed; safe status/action labels only | code, message, status, evidence_report_ref | raw record details, persistence internals | yes, only safe reference | log safe IDs/status labels only | invalid approve/cancel returns safe 409 |
| worker boundary conflict | CDC worker boundary | 409 | `worker_boundary_conflict` | worker action not allowed for current boundary | code, message, status, evidence_report_ref | raw runtime data, worker credential details | conditional, only when already safe | log safe replay_request_id and action label | worker misuse returns safe 409 |
| internal error | shared fallback | 500 | `internal_error` | generic only | code, message, status | stack traces, SQL details, raw connection strings, persistence internals | no by default | classify without raw detail | unexpected error returns safe 500 |

## 7. Route-to-Error Mapping

| Route/Action | Expected Safe Errors |
|---|---|
| GET /api/v1/cdc/failures | 401 unauthorized, 403 forbidden, 500 internal_error |
| GET /api/v1/cdc/failures/{failure_id} | 401 unauthorized, 403 forbidden, 404 not_found, 500 internal_error |
| GET /api/v1/cdc/failures/{failure_id}/state-log | 401 unauthorized, 403 forbidden, 404 not_found, 500 internal_error |
| POST /api/v1/cdc/failures/{failure_id}/replay-requests | 400 validation_error, 401 unauthorized, 403 forbidden, 404 not_found, 409 idempotency_conflict, 409 invalid_state_transition, 500 internal_error |
| GET /api/v1/cdc/replay-requests | 401 unauthorized, 403 forbidden, 500 internal_error |
| GET /api/v1/cdc/replay-requests/{replay_request_id} | 401 unauthorized, 403 forbidden, 404 not_found, 500 internal_error |
| POST /api/v1/cdc/replay-requests/{replay_request_id}/approve | 400 validation_error, 401 unauthorized, 403 forbidden, 404 not_found, 409 invalid_state_transition, 500 internal_error |
| POST /api/v1/cdc/replay-requests/{replay_request_id}/cancel | 400 validation_error, 401 unauthorized, 403 forbidden, 404 not_found, 409 invalid_state_transition, 500 internal_error |
| future worker action: linkNewRunId | 401 unauthorized, 403 forbidden, 404 not_found, 409 worker_boundary_conflict, 409 invalid_state_transition, 500 internal_error |
| future worker action: mark replay running/succeeded/failed | 401 unauthorized, 403 forbidden, 404 not_found, 409 worker_boundary_conflict, 409 invalid_state_transition, 500 internal_error |
| future cleanup action: mark cleanup_complete | 401 unauthorized, 403 forbidden, 404 not_found, 409 worker_boundary_conflict, 409 invalid_state_transition, 500 internal_error |

## 8. Redaction Rules

Error envelopes, logs, fixtures, and tests must not include:

- raw payloads
- full message bodies
- issue raw values
- prod_change payload/actor values
- secrets
- tokens
- DB URLs
- endpoints
- raw connection strings
- stack traces
- SQL details
- compared request body
- compared idempotency values
- persistence internals

Safe field-name sets may include names only, never values.

## 9. evidence_report_ref Behavior

`evidence_report_ref` may be included only when it is already safe metadata.

- 400 validation_error: conditional, only if a safe reference is present.
- 401 unauthorized: no.
- 403 forbidden: no.
- 404 not_found: no by default.
- 409 idempotency_conflict: yes, if already safe.
- 409 invalid_state_transition: yes, if already safe.
- 409 worker_boundary_conflict: conditional, if already safe.
- 500 internal_error: no by default.

## 10. Auth Error Relationship

401 unauthorized and 403 forbidden remain auth-layer concerns. CDC service logic must not become the primary source of auth decisions. If a CDC handler boundary needs role-denial adapters for tests, they must emit only safe 401/403 envelopes and role checks must occur before service mutation.

## 11. Idempotency Conflict 409 Behavior

`idempotency_conflict` must describe only that normalized intent conflicts. It must not include compared request body content, compared payload values, compared idempotency values, raw failed message values, issue raw values, or prod_change payload/actor values.

## 12. Invalid State Transition 409 Behavior

`invalid_state_transition` must describe only that the transition is not allowed. It may include safe status/action labels only when route-level tests prove the labels are not raw record details.

## 13. Internal Error 500 Behavior

Unknown errors must return `internal_error` with a generic safe message. 500 responses must not expose stack traces, SQL details, raw connection strings, persistence internals, raw payloads, full message bodies, issue raw values, or prod_change payload/actor values.

## 14. Logging Safety Rules

Logs must not reveal raw values.

Allowed log fields: route label, method, status, safe error code, request_id, safe role category, safe replay_request_id, safe failure_id, safe state label, and aggregate counts.

Forbidden log fields: raw payloads, full message bodies, issue raw values, prod_change payload/actor values, secrets, tokens, DB URLs, endpoints, raw connection strings, stack traces, SQL details, compared request body, compared idempotency values, and persistence internals.

## 15. Stop Conditions

Stop M2-8B route wiring if any of these occur:

- live route wiring attempted in this prep step
- `server.js` modification attempted
- `auth.js` modification attempted
- `error-response.js` modification attempted
- production error behavior change attempted
- OpenAPI main merge attempted
- SQL apply attempted
- external infrastructure command attempted
- 400 validation_error safe envelope is missing
- 401 unauthorized auth-layer safe envelope is missing
- 403 forbidden auth-layer safe envelope is missing
- 404 not_found safe envelope is missing
- 409 idempotency_conflict safe envelope is missing
- 409 invalid_state_transition safe envelope is missing
- 409 worker_boundary_conflict safe envelope is missing
- 500 internal_error redacted envelope is missing
- raw payloads exposed
- full message bodies exposed
- issue raw values exposed
- prod_change payload/actor values exposed
- stack traces exposed
- SQL details exposed
- compared request body exposed
- compared idempotency values exposed
- logs reveal raw values

## 16. Decision: Ready / Not Ready for M2-8B Route Wiring

Decision: CDC error envelope integration is ready as a contract input, but M2-8B route wiring remains not ready.

Accepted error envelope decision: use a CDC handler-boundary safe adapter for expected CDC domain errors and decisions; preserve auth-layer 401/403; route unknown errors through shared 500 behavior only after raw details are stripped or wrapped as generic internal_error.

## 17. Remaining Blockers After Error Envelope Reconciliation

Error envelope blocker is resolved at contract level only. Remaining blockers:

- repository strategy
- OpenAPI patch merge ownership
- route-level integration tests
- future implementation of the M2-8B auth mapping
- future implementation of the CDC safe error adapter without changing production error behavior prematurely

Next blocker reference: M2-8D-Prep in `docs/m2_8d_prep_repository_strategy_kr.md` addresses repository strategy at contract level only. Route wiring remains blocked until OpenAPI ownership and route-level integration tests are resolved.
