# M2-8J Schema Parity Evidence

## 1. Evidence Method

Evidence was gathered from:

- `sources/openapi_m2_5_dlq_replay_patch.yaml`
- `apps/api/src/cdc-recovery/cdc-recovery-dto-mapper.js`
- `apps/api/src/cdc-recovery/cdc-recovery-routes.js`
- `apps/api/src/cdc-recovery/cdc-recovery-production-routes.test.js`
- `apps/api/src/cdc-recovery/cdc-recovery-route-level.test.js`
- `apps/api/src/cdc-recovery/cdc-recovery-errors.js`

No main OpenAPI merge was performed.

## 2. Proposal Schemas Inspected

- CdcFailureSummary
- CdcFailureDetail
- CdcFailureStateLogEntry
- CdcReplayRequestSummary
- CdcReplayRequestDetail
- CreateCdcReplayRequestRequest
- CreateCdcReplayRequestResponse
- ApproveCdcReplayRequestRequest
- ApproveCdcReplayRequestResponse
- CancelCdcReplayRequestRequest
- CancelCdcReplayRequestResponse

## 3. DTO Mapper Field Sets Inspected

- `FAILURE_RESPONSE_FIELDS`
- `STATE_LOG_RESPONSE_FIELDS`
- `REPLAY_REQUEST_RESPONSE_FIELDS`
- `stripForbiddenFields`
- `containsForbiddenKeys`

## 4. Production Route Outputs Inspected Through Tests

Production route registration tests inspect:

- failure list output
- failure detail output
- state log output
- replay request list output
- replay request detail output
- create replay request output
- approve/cancel output
- safe error output
- OpenAPI proposal-only marker

## 5. Schema Parity Matrix

| Schema | Proposal source | Route or handler path | DTO mapper or service/test reference | Allowed fields | Forbidden fields | Parity status | Evidence note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CdcFailureSummary | OpenAPI proposal components | GET /api/v1/cdc/failures | `FAILURE_RESPONSE_FIELDS`, production route tests | safe failure metadata | raw payloads, full message bodies, issue raw values, prod_change payload/actor values | conditional | DTO field set is broader than summary schema; merge should decide summary/detail split. |
| CdcFailureDetail | OpenAPI proposal components | GET /api/v1/cdc/failures/{failure_id} | `FAILURE_RESPONSE_FIELDS` | safe failure metadata and parser summary | raw payloads, full message bodies, stack traces | pass | Safe detail fields align with DTO safety intent. |
| CdcFailureStateLogEntry | OpenAPI proposal components | GET /api/v1/cdc/failures/{failure_id}/state-log | `STATE_LOG_RESPONSE_FIELDS` | safe state transition metadata | raw values, SQL details, persistence internals | pass | State log DTO is safe metadata only. |
| CdcReplayRequestSummary | OpenAPI proposal components | GET /api/v1/cdc/replay-requests | `REPLAY_REQUEST_RESPONSE_FIELDS` | safe replay request metadata | raw values, compared request bodies | conditional | DTO includes more lifecycle fields than proposal summary. |
| CdcReplayRequestDetail | OpenAPI proposal components | GET /api/v1/cdc/replay-requests/{replay_request_id} | `REPLAY_REQUEST_RESPONSE_FIELDS` | safe replay request metadata | raw values, persistence internals | conditional | Proposal uses `requested_by`; DTO uses `owner` and `requester_ref` is not emitted. |
| CreateCdcReplayRequestRequest | OpenAPI proposal components | POST /api/v1/cdc/failures/{failure_id}/replay-requests | `validateCreateReplayRequest`, production tests | idempotency key, requested action, bounded scope, safe summary, evidence report ref | compared request bodies, compared idempotency values | conditional | Service accepts safe optional fields; proposal required set should be reviewed. |
| CreateCdcReplayRequestResponse | OpenAPI proposal components | POST /api/v1/cdc/failures/{failure_id}/replay-requests | `REPLAY_REQUEST_RESPONSE_FIELDS` | replay request id, failure id, status, idempotency key, evidence report ref | raw values | conditional | DTO emits full safe replay request projection; proposal response is narrower. |
| ApproveCdcReplayRequestRequest | OpenAPI proposal components | POST /api/v1/cdc/replay-requests/{replay_request_id}/approve | production tests `approvalInput` | evidence report ref and safe approval metadata | raw values | conditional | Route currently requires safe evidence ref only in tests; proposal requires approved_by and approval_note. |
| ApproveCdcReplayRequestResponse | OpenAPI proposal components | POST /api/v1/cdc/replay-requests/{replay_request_id}/approve | `REPLAY_REQUEST_RESPONSE_FIELDS` | replay request id, failure id, status, evidence report ref | raw values | conditional | Proposal includes approved_by; DTO emits safe replay request projection. |
| CancelCdcReplayRequestRequest | OpenAPI proposal components | POST /api/v1/cdc/replay-requests/{replay_request_id}/cancel | production tests `approvalInput` | evidence report ref and safe cancel metadata | raw values | conditional | Route currently requires safe evidence ref only in tests; proposal requires cancelled_by and cancel_reason. |
| CancelCdcReplayRequestResponse | OpenAPI proposal components | POST /api/v1/cdc/replay-requests/{replay_request_id}/cancel | `REPLAY_REQUEST_RESPONSE_FIELDS` | replay request id, failure id, status, evidence report ref | raw values | conditional | Proposal includes cancelled_by; DTO emits safe replay request projection. |

## 6. Request Schema Parity Matrix

| Request schema | Source | Runtime/test reference | Parity status | Evidence note |
| --- | --- | --- | --- | --- |
| CreateCdcReplayRequestRequest | Proposal patch | `validateCreateReplayRequest`, production tests | conditional | Core fields are validated; future merge should align optional safe metadata fields. |
| ApproveCdcReplayRequestRequest | Proposal patch | production approve tests | conditional | Proposal requires approval actor/note labels not currently required by route tests. |
| CancelCdcReplayRequestRequest | Proposal patch | production cancel tests | conditional | Proposal requires cancel actor/reason labels not currently required by route tests. |

## 7. Response Schema Parity Matrix

| Response schema | Source | Runtime/test reference | Parity status | Evidence note |
| --- | --- | --- | --- | --- |
| CdcFailureSummary | Proposal patch | failure list DTO tests | conditional | Summary field width should be reconciled. |
| CdcFailureDetail | Proposal patch | failure detail DTO tests | pass | Safe metadata fields align. |
| CdcFailureStateLogEntry | Proposal patch | state log DTO tests | pass | Safe state metadata aligns. |
| CdcReplayRequestSummary | Proposal patch | replay list DTO tests | conditional | Summary/detail field width should be reconciled. |
| CdcReplayRequestDetail | Proposal patch | replay detail DTO tests | conditional | Requested-by naming mismatch requires decision. |
| CreateCdcReplayRequestResponse | Proposal patch | create output tests | conditional | DTO emits broader safe replay projection. |
| ApproveCdcReplayRequestResponse | Proposal patch | approve output tests | conditional | Approved-by field mismatch requires decision. |
| CancelCdcReplayRequestResponse | Proposal patch | cancel output tests | conditional | Cancelled-by field mismatch requires decision. |

## 8. Error Schema Parity Matrix

| Error case | Runtime/test reference | Proposal status | Parity status | Evidence note |
| --- | --- | --- | --- | --- |
| 400 validation_error | `cdc-recovery-errors.js`, production tests | status listed | conditional | Future merge should define redacted error envelope schema. |
| 401 unauthorized | route-local auth adapter, production tests | status listed | conditional | Auth-layer envelope should remain safe. |
| 403 forbidden | route-local auth adapter, production tests | status listed | conditional | Role-denial envelope should remain safe. |
| 404 not_found | CDC error helper, production tests | status listed | conditional | Envelope schema should be explicit. |
| 409 idempotency_conflict | service/helper tests | status listed | conditional | Do not expose compared request bodies or idempotency values. |
| 409 invalid_state_transition | service/helper tests | status listed | conditional | Do not expose persistence internals. |
| 500 internal_error | safe adapter, production tests | not explicit in proposal paths | conditional | Future merge should add generic redacted 500 response. |

## 9. Auth/Role Parity Evidence

M2-8I tests and route adapter document:

- `readonly_role` read allowed
- `readonly_role` mutation forbidden
- `operator` create allowed
- `operator` approve/cancel forbidden
- `maintainer` approve/cancel allowed
- `system_worker` arbitrary replay creation forbidden

Future OpenAPI merge must document these roles and keep mutation route stricter review.

## 10. Gaps and Limitations

- Summary/detail schema field width differs from current DTO projections.
- Proposal names such as `requested_by`, `approved_by`, and `cancelled_by` need alignment with current safe DTO output.
- Error envelope schemas are not explicit enough for merge.
- Approval gates are not recorded yet.
- OpenAPI merge remains separate.

## 11. Decision

Decision: schema parity is sufficient for a future explicit OpenAPI merge task to be scoped, but actual merge is conditional and blocked until identified parity gaps and approval gates are resolved.
