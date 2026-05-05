# M2-8J OpenAPI Merge Readiness Review

## 1. Purpose and Non-Goals

Purpose: M2-8I production CDC recovery route wiring 이후, `sources/openapi_m2_5_dlq_replay_patch.yaml` proposal이 future OpenAPI merge 대상으로 준비되었는지 schema parity evidence와 gate 관점에서 검토한다.

Non-goals:

- no main OpenAPI merge in M2-8J
- no `sources/personal_project_openapi_v0_2.yaml` modification in M2-8J
- M2-5 OpenAPI patch remains proposal-only
- no Aurora repository
- no real DB queries
- no SQL apply
- no external infrastructure commands
- no broad route refactor
- no `auth.js` rewrite
- no `error-response.js` rewrite
- no raw payloads
- no full message bodies
- no issue raw values
- no prod_change payload/actor values
- no stack traces
- no SQL details
- no persistence internals

## 2. Current M2-8I Production Route Result

M2-8I registered CDC recovery routes through production `server.js` dispatch using an isolated route factory:

- `apps/api/src/cdc-recovery/cdc-recovery-routes.js`
- `apps/api/src/cdc-recovery/cdc-recovery-production-routes.test.js`
- minimal `server.js` dispatcher registration

M2-8I tests prove production route registration, safe 401/403/404/409/500 behavior, DTO safety, and OpenAPI proposal-only marker preservation. Persistence remains in-memory/stub-backed.

## 3. Current OpenAPI Proposal Status

Proposal file:

- `sources/openapi_m2_5_dlq_replay_patch.yaml`

Status:

- proposal-only
- contains `PROPOSAL ONLY - DO NOT MERGE AUTOMATICALLY`
- not merged into `sources/personal_project_openapi_v0_2.yaml`
- safe metadata intent is documented

## 4. Main OpenAPI Merge Non-Goal

M2-8J does not merge the main OpenAPI. It only produces OpenAPI merge readiness evidence.

The actual future OpenAPI merge must be a separate explicit task after review.

## 5. Route-to-Proposal Coverage Matrix

| Route | Proposal coverage | Production route evidence | Status |
| --- | --- | --- | --- |
| GET /api/v1/cdc/failures | Present | `cdc-recovery-production-routes.test.js` list route | pass |
| GET /api/v1/cdc/failures/{failure_id} | Present | detail route | pass |
| GET /api/v1/cdc/failures/{failure_id}/state-log | Present | state log route | pass |
| POST /api/v1/cdc/failures/{failure_id}/replay-requests | Present | create route with 201/200/400/403/409 coverage | conditional |
| GET /api/v1/cdc/replay-requests | Present | list replay route | pass |
| GET /api/v1/cdc/replay-requests/{replay_request_id} | Present | replay detail route | pass |
| POST /api/v1/cdc/replay-requests/{replay_request_id}/approve | Present | maintainer-only approve route | conditional |
| POST /api/v1/cdc/replay-requests/{replay_request_id}/cancel | Present | maintainer-only cancel route | conditional |

Mutation routes remain conditional because approval gates and schema parity gaps must be resolved before merge.

## 6. Schema-to-DTO Parity Summary

DTO mapper field sets:

- `FAILURE_RESPONSE_FIELDS`
- `STATE_LOG_RESPONSE_FIELDS`
- `REPLAY_REQUEST_RESPONSE_FIELDS`

Parity summary:

- Failure detail and state log schemas align at safe metadata intent level.
- Replay request output schemas need explicit reconciliation because proposal response schemas include role-specific fields such as `approved_by` and `cancelled_by`, while route DTO output currently uses safe replay request DTO fields.
- Create request schema aligns with service validation for core required fields, but future merge should decide whether `target_topic`, `target_table`, `source_run_id`, and requester metadata are documented as optional/omitted consistently.

## 7. Error Envelope Parity Summary

M2-8I route tests cover:

- 400 `validation_error`
- 401 `unauthorized`
- 403 `forbidden`
- 404 `not_found`
- 409 `idempotency_conflict`
- 409 `invalid_state_transition`
- 500 `internal_error`

Proposal currently lists status responses but does not fully define shared safe error schemas. Future OpenAPI merge should add or reference redacted error envelope schemas and preserve `evidence_report_ref` only when safe.

## 8. Auth/Role Documentation Parity Summary

Auth role behavior is covered by M2-8I production route tests:

- missing auth returns safe 401
- `readonly_role` can read
- `readonly_role` cannot mutate
- `operator` can create replay request
- `operator` cannot approve/cancel
- `maintainer` can approve/cancel
- `system_worker` cannot create arbitrary replay request

Future OpenAPI merge should document these roles explicitly and keep mutation route stricter review.

## 9. Versioning/Changelog Readiness

Versioning/changelog is required before future OpenAPI merge:

- add a changelog entry for CDC recovery route registration and safe metadata-only contract
- preserve proposal patch history
- state that persistence remains stub-backed unless a later Aurora repository task changes it
- state that mutation routes require maintainer review

## 10. API Contract Owner Gate

API contract owner gate is required and not yet recorded as approval. The owner must review schema parity, route coverage, and versioning/changelog before future OpenAPI merge.

## 11. Safety Reviewer Gate

Safety reviewer gate is required and not yet recorded as approval. The reviewer must confirm no raw payloads, no full message bodies, no issue raw values, no prod_change payload/actor values, no stack traces, no SQL details, and no persistence internals appear in schemas or examples.

## 12. Final Merge Approver Gate

Final merge approver gate is required and not yet recorded as approval. The approver should review API owner and safety reviewer signoff plus green validation results.

## 13. Stop Conditions

Stop future OpenAPI merge if:

- forbidden raw field appears in the proposal patch or main OpenAPI merge diff
- DTO mapper parity fails
- error envelope parity fails
- auth/role documentation permits under-scoped mutation
- mutation route stricter review is missing
- API contract owner approval is missing
- safety reviewer approval is missing
- final merge approver approval is missing
- production route tests fail
- global safety scanner fails

## 14. Decision: Ready / Not Ready for Future OpenAPI Merge

Decision: future OpenAPI merge is conditionally ready, not automatically ready.

Conditionally ready means M2-8J found route coverage and safe metadata intent strong enough to prepare a separate merge task, but the actual merge remains blocked until schema parity gaps, error schema redaction, auth/role documentation parity, versioning/changelog, API contract owner gate, safety reviewer gate, final merge approver gate, production route tests, and global safety scanner all pass.

## 15. Remaining Blockers

- schema parity gaps for replay request detail/create/approve/cancel outputs must be reconciled
- safe error envelope schemas must be explicit or referenced
- versioning/changelog must be prepared
- API contract owner approval must be recorded
- safety reviewer approval must be recorded
- final merge approver approval must be recorded
- main OpenAPI merge remains a future explicit task
- Aurora repository remains out of scope
