# M2-8E-Prep OpenAPI Patch Merge Ownership

## 1. Purpose and Non-Goals

Purpose: M2-8B live route wiring 전에 `sources/openapi_m2_5_dlq_replay_patch.yaml`의 ownership, merge gates, schema parity, and deferral rules를 contract로 확정한다. OpenAPI merge ownership은 structured, traceable, evidence-safe recovery operation을 보존해야 한다.

Non-goals:

- not live route wiring
- no `server.js` modification
- no `auth.js` modification
- no `error-response.js` modification
- no cdc-recovery runtime module modification
- no OpenAPI main merge in this step
- no production runtime behavior change
- no real DB queries
- no Aurora connection
- no SQL apply
- no AWS, Kafka, Debezium, ClickHouse, psql, kubectl, deployment, or external infrastructure commands
- no raw payloads
- no full message bodies
- no issue raw values
- no prod_change payload/actor values
- no stack traces
- no SQL details
- no persistence internals

## 2. Current OpenAPI Patch Proposal Summary

Current proposal file: `sources/openapi_m2_5_dlq_replay_patch.yaml`.

The patch is marked `PROPOSAL ONLY - DO NOT MERGE AUTOMATICALLY` and proposes:

- CDC failure read APIs
- CDC failure state-log read API
- CDC replay request create/list/detail APIs
- CDC replay request approve/cancel APIs
- safe metadata schemas
- 401/403/404/409 response expectations
- idempotency conflict and invalid state transition behavior

The patch remains proposal-only in M2-8E.

## 3. Main OpenAPI Merge Non-Goal

M2-8E must not merge the M2-5 OpenAPI patch into `sources/personal_project_openapi_v0_2.yaml` or any other main OpenAPI artifact. The proposal patch remains separate and is used only as a reference for route-level integration test design.

## 4. Ownership Model

| Ownership Role | Responsibility | Required Before Merge |
|---|---|---|
| API contract owner | Owns schema naming, path shape, versioning, and changelog alignment | assigned |
| route implementation owner | Owns route behavior, handler mapping, stub repository integration, and route-level tests | assigned |
| security/safety reviewer | Reviews raw-field exclusion, role gates, error redaction, and safe DTO parity | assigned |
| product/ops reviewer | Reviews operational workflow, evidence_report_ref semantics, and recovery usability | assigned |
| final merge approver | Approves main OpenAPI merge after gates pass | assigned |

No single implementation owner should merge the patch without API contract owner, safety reviewer, and final merge approver sign-off.

## 5. Merge Gate Options

Option A: merge OpenAPI patch before route-level tests.

- Pros: creates a visible contract early.
- Cons: risks documenting unimplemented or unsafe behavior before route/auth/error/DTO tests prove parity.

Option B: route-level tests with proposal patch only, merge later.

- Pros: keeps the proposal separate while using it as the test reference; allows test-proven schema parity before merge.
- Cons: main OpenAPI remains behind until tests and reviews pass.

Option C: merge minimal read-only subset first, mutation routes later.

- Pros: read routes have lower operational risk than mutation routes.
- Cons: creates split contract rollout and still requires strict safety review.

## 6. Recommended Decision

Recommended decision: use Option B.

Do not merge `sources/openapi_m2_5_dlq_replay_patch.yaml` into the main OpenAPI during M2-8E. M2-8B should use the proposal patch as the route-level integration test reference. Main OpenAPI merge is deferred until:

- M2-8B route-level integration tests pass
- auth role mapping implementation is tested
- CDC error envelope adapter implementation is tested
- in-memory/stub repository route tests pass
- DTO mapper response fields match schemas
- global safety scanner passes
- API contract owner approves
- safety reviewer approves
- final merge approver approves

Mutation routes require stricter approval than read routes because they create replay/reprocess requests or change approval/cancel state.

## 7. Schema Parity Requirements

| Schema | Source Proposal File | Route/Handler Request or Response | DTO Mapper or Service Contract Reference | Allowed Fields | Forbidden Fields | Parity Test Needed | Merge Gate Status |
|---|---|---|---|---|---|---|---|
| `CdcFailureSummary` | `sources/openapi_m2_5_dlq_replay_patch.yaml` | GET /api/v1/cdc/failures response | `toSafeFailureDto`, `toSafeListDto` | failure_id, failure_type, source_topic, source_table, primary_key, op, ts_ms, first_seen_at, last_seen_at, attempt_count, status, owner, evidence_report_ref | raw payloads, full message bodies, issue raw values, prod_change payload/actor values | yes | deferred |
| `CdcFailureDetail` | `sources/openapi_m2_5_dlq_replay_patch.yaml` | GET /api/v1/cdc/failures/{failure_id} response | `toSafeFailureDto` | summary fields, observed_field_names, missing_required_fields, unexpected_fields, forbidden_field_names_detected, parser_error_class, parser_error_summary, source_run_id, latest_replay_request_id | raw payloads, full message bodies, issue raw values, prod_change payload/actor values | yes | deferred |
| `CdcFailureStateLogEntry` | `sources/openapi_m2_5_dlq_replay_patch.yaml` | GET /api/v1/cdc/failures/{failure_id}/state-log response | `toSafeStateLogDto`, `toSafeListDto` | state_log_id, failure_id, replay_request_id, from_status, to_status, reason_code, owner, safe_metadata, evidence_report_ref, created_at | raw payloads, full message bodies, unsafe reason details | yes | deferred |
| `CdcReplayRequestSummary` | `sources/openapi_m2_5_dlq_replay_patch.yaml` | GET /api/v1/cdc/replay-requests response | `toSafeReplayRequestDto`, `toSafeListDto` | replay_request_id, failure_id, requested_action, owner, idempotency_key, attempt_count, status, new_run_id, evidence_report_ref, cleanup_status | raw payloads, full message bodies, issue raw values, prod_change payload/actor values | yes | deferred |
| `CdcReplayRequestDetail` | `sources/openapi_m2_5_dlq_replay_patch.yaml` | GET /api/v1/cdc/replay-requests/{replay_request_id} response | `toSafeReplayRequestDto` | summary fields, bounded_scope, reason_summary, target_topic, target_table, source_run_id, requested_at, approved_at, completed_at | raw payloads, full message bodies, unsafe reason values | yes | deferred |
| `CreateCdcReplayRequestRequest` | `sources/openapi_m2_5_dlq_replay_patch.yaml` | POST /api/v1/cdc/failures/{failure_id}/replay-requests request | `validateCreateReplayRequest`, `CREATE_REPLAY_REQUIRED_FIELDS`, `CREATE_REPLAY_ALLOWED_FIELDS` | requested_action, reason_summary, bounded_scope, attempt_count, owner, idempotency_key, evidence_report_ref, target_topic, target_table | raw payloads, full message bodies, issue raw values, prod_change payload/actor values | yes | deferred |
| `CreateCdcReplayRequestResponse` | `sources/openapi_m2_5_dlq_replay_patch.yaml` | POST /api/v1/cdc/failures/{failure_id}/replay-requests response | `toSafeReplayRequestDto` | replay_request_id, failure_id, status, idempotency_key, new_run_id, evidence_report_ref | raw payloads, full message bodies, compared values | yes | deferred |
| `ApproveCdcReplayRequestRequest` | `sources/openapi_m2_5_dlq_replay_patch.yaml` | POST /api/v1/cdc/replay-requests/{replay_request_id}/approve request | `approveReplayRequest` service contract | approved_by, approval_note, evidence_report_ref | raw payloads, full message bodies, unsafe approval text | yes | deferred |
| `ApproveCdcReplayRequestResponse` | `sources/openapi_m2_5_dlq_replay_patch.yaml` | POST /api/v1/cdc/replay-requests/{replay_request_id}/approve response | `toSafeReplayRequestDto` and transition decision | replay_request_id, failure_id, status, approved_by, new_run_id, evidence_report_ref | raw payloads, full message bodies, original run mutation fields | yes | deferred |
| `CancelCdcReplayRequestRequest` | `sources/openapi_m2_5_dlq_replay_patch.yaml` | POST /api/v1/cdc/replay-requests/{replay_request_id}/cancel request | `cancelReplayRequest` service contract | cancelled_by, cancel_reason, evidence_report_ref | raw payloads, full message bodies, unsafe cancel text | yes | deferred |
| `CancelCdcReplayRequestResponse` | `sources/openapi_m2_5_dlq_replay_patch.yaml` | POST /api/v1/cdc/replay-requests/{replay_request_id}/cancel response | `toSafeReplayRequestDto` and transition decision | replay_request_id, failure_id, status, cancelled_by, evidence_report_ref | raw payloads, full message bodies, original run mutation fields | yes | deferred |

## 8. DTO Mapper Parity Requirements

DTO mapper parity required before merge:

- OpenAPI response schemas must be equal to or broader than safe DTO outputs only where explicitly approved.
- DTO outputs must not include fields absent from the accepted schema unless the schema is updated through review.
- Schema fields must not include raw payloads, full message bodies, issue raw values, prod_change payload/actor values, stack traces, SQL details, or persistence internals.
- `toSafeFailureDto`, `toSafeReplayRequestDto`, `toSafeStateLogDto`, and `toSafeListDto` must be covered by route-level integration tests.

## 9. Error Envelope Schema Parity Requirements

Error envelope redaction parity required before merge:

- 400 validation_error safe envelope
- 401 unauthorized auth-layer safe envelope
- 403 forbidden auth-layer safe envelope
- 404 not_found safe envelope
- 409 idempotency_conflict safe envelope
- 409 invalid_state_transition safe envelope
- 500 internal_error redacted envelope

Error schemas must not expose raw values, compared request content, stack traces, SQL details, or persistence internals.

## 10. Auth/Role Documentation Parity Requirements

Auth/role documentation parity required before merge:

- read routes: readonly_role, operator, maintainer
- create replay request: operator, maintainer
- approve/cancel mutation routes: maintainer-only
- future worker actions: system_worker-only and not part of human API merge without separate review
- 401/403 behavior remains auth-layer safe envelope behavior

## 11. Repository/Stub Strategy Dependency

OpenAPI merge depends on M2-8D repository strategy. Route-level tests should use the in-memory/stub repository first. Direct Aurora repository remains deferred until migration gate, rollback plan, and controlled runtime dry-run approval.

## 12. Route-Level Integration Test Dependency

Main OpenAPI merge must wait until route-level integration tests prove:

- safe DTO output
- auth 401/403 behavior
- validation 400 behavior
- not_found 404 behavior
- idempotency conflict 409 behavior
- invalid state transition 409 behavior
- maintainer-only approve/cancel behavior
- no raw payloads
- no full message bodies
- no issue raw values
- no prod_change payload/actor values

## 13. Versioning and Changelog Requirements

Before main OpenAPI merge:

- API contract owner records versioning impact.
- changelog/release note identifies CDC recovery APIs as metadata-only recovery operation endpoints.
- mutation routes are called out separately from read routes.
- proposal-only marker is removed only in the reviewed final OpenAPI change, not in M2-8E.

## 14. Rollback/Deferral Strategy

- Keep `sources/openapi_m2_5_dlq_replay_patch.yaml` separate until gates pass.
- If read routes are approved earlier, document a read-only subset decision record before any main OpenAPI merge.
- If mutation routes fail safety review, defer them while preserving the proposal patch.
- If route-level tests reveal DTO/schema mismatch, update the proposal patch and rerun validators before merge approval.

## 15. Stop Conditions

Stop if any of these occur:

- live route wiring in this step
- `server.js` modification in this step
- `auth.js` modification in this step
- `error-response.js` modification in this step
- cdc-recovery runtime module modification in this step
- OpenAPI main merge in this step
- proposal patch loses proposal-only marker
- API contract owner is not assigned
- safety reviewer is not assigned
- final merge approver is not assigned
- route-level integration tests are not complete
- DTO mapper parity is not reviewed
- error envelope redaction parity is not reviewed
- auth/role documentation parity is not reviewed
- mutation routes lack stricter approval
- raw payloads appear in schemas
- full message bodies appear in schemas
- issue raw values appear in schemas
- prod_change payload/actor values appear in schemas
- stack traces, SQL details, or persistence internals appear in schemas

## 16. Decision: Ready / Not Ready for M2-8B Route Wiring

Decision: OpenAPI patch merge ownership is ready as a contract input, but M2-8B route wiring remains not ready.

Accepted OpenAPI merge ownership decision: keep the M2-5 patch proposal-only and separate in M2-8E; use it as the M2-8B route-level integration test reference; defer main OpenAPI merge until route tests, auth/error/stub repository parity, DTO mapper parity, global safety validation, API contract owner approval, safety reviewer approval, and final merge approver approval pass.

## 17. Remaining Blockers After OpenAPI Ownership

OpenAPI ownership blocker is resolved at contract level only. Remaining blocker before M2-8B route wiring:

- route-level integration tests

Future implementation blockers remain:

- implement auth mapping
- implement CDC safe error adapter
- implement stub-backed route tests
- defer direct Aurora repository until migration gate

Next blocker reference: M2-8F-Prep in `docs/m2_8f_prep_route_level_integration_test_contract_kr.md` addresses the route-level integration test contract only. Route wiring remains blocked until the test-only harness and route-level integration tests are implemented and pass.
