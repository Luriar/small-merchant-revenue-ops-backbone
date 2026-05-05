# M2-8M Post-Merge Schema Parity

## Proposal Source

Source proposal: `sources/openapi_m2_5_dlq_replay_patch.yaml`.

The proposal remains preserved as proposal-only history.

## Main OpenAPI Merge Target

Merge target: `sources/personal_project_openapi_v0_2.yaml`.

M2-8M merges the CDC route contract into the main OpenAPI and resolves M2-8J parity gaps against the runtime DTO mapper.

## Route-To-Main-OpenAPI Coverage Matrix

| Route | Main OpenAPI status | Runtime reference | Evidence note |
| --- | --- | --- | --- |
| `GET /api/v1/cdc/failures` | merged | `cdc-recovery-routes.js`, production route tests | Safe list DTO. |
| `GET /api/v1/cdc/failures/{failure_id}` | merged | handler `getFailureDetail` | Safe failure DTO. |
| `GET /api/v1/cdc/failures/{failure_id}/state-log` | merged | handler `listFailureStateLog` | Append-only safe state metadata. |
| `POST /api/v1/cdc/failures/{failure_id}/replay-requests` | merged | handler `createReplayRequest` | Operator/maintainer mutation with idempotency. |
| `GET /api/v1/cdc/replay-requests` | merged | handler `listReplayRequests` | Safe replay list DTO. |
| `GET /api/v1/cdc/replay-requests/{replay_request_id}` | merged | handler `getReplayRequestDetail` | Safe replay detail DTO. |
| `POST /api/v1/cdc/replay-requests/{replay_request_id}/approve` | merged | handler `approveReplayRequest` | Maintainer-only mutation. |
| `POST /api/v1/cdc/replay-requests/{replay_request_id}/cancel` | merged | handler `cancelReplayRequest` | Maintainer-only mutation. |

## Schema-To-DTO Parity Matrix After Merge

| Schema | DTO or service anchor | Parity status | Evidence note |
| --- | --- | --- | --- |
| `CdcFailureSummary` | `FAILURE_RESPONSE_FIELDS` | pass | Main OpenAPI follows runtime safe field width. |
| `CdcFailureDetail` | `FAILURE_RESPONSE_FIELDS` | pass | Detail aliases the same safe projection used by runtime. |
| `CdcFailureStateLogEntry` | `STATE_LOG_RESPONSE_FIELDS` | pass | State log fields match DTO projection. |
| `CdcReplayRequestSummary` | `REPLAY_REQUEST_RESPONSE_FIELDS` | pass | Main OpenAPI follows runtime safe replay projection. |
| `CdcReplayRequestDetail` | `REPLAY_REQUEST_RESPONSE_FIELDS` | pass | Detail aliases the same safe projection used by runtime. |

## Request Schema Parity Matrix After Merge

| Request schema | Runtime/test anchor | Parity status | Evidence note |
| --- | --- | --- | --- |
| `CreateCdcReplayRequestRequest` | `CREATE_REPLAY_REQUIRED_FIELDS`, `CREATE_REPLAY_ALLOWED_FIELDS` | pass | Required fields are `idempotency_key`, `requested_action`, `bounded_scope`, and `evidence_report_ref`. |
| `ApproveCdcReplayRequestRequest` | production approve tests | pass | Requires safe evidence reference only. |
| `CancelCdcReplayRequestRequest` | production cancel tests | pass | Requires safe evidence reference only. |

## Response Schema Parity Matrix After Merge

| Response schema | Runtime/test anchor | Parity status | Evidence note |
| --- | --- | --- | --- |
| `CreateCdcReplayRequestResponse` | `toSafeReplayRequestDto` | pass | Uses safe replay detail projection. |
| `ApproveCdcReplayRequestResponse` | `toSafeReplayRequestDto` | pass | Uses safe replay detail projection. |
| `CancelCdcReplayRequestResponse` | `toSafeReplayRequestDto` | pass | Uses safe replay detail projection. |

## Error Envelope Parity Matrix After Merge

| Status | Safe code | Main OpenAPI status | Runtime/test anchor |
| --- | --- | --- | --- |
| 400 | `validation_error` | merged | `validationError`, route tests |
| 401 | `unauthorized` | merged | route-local auth adapter |
| 403 | `forbidden` | merged | route-local auth adapter |
| 404 | `not_found` | merged | `notFoundError`, route tests |
| 409 | `idempotency_conflict` | merged | idempotency conflict tests |
| 409 | `invalid_state_transition` | merged | transition conflict tests |
| 500 | `internal_error` | merged | safe adapter internal error tests |

## Remaining Limitations

- Persistence remains stub-backed.
- The main OpenAPI now documents the CDC recovery contract, but Aurora repository behavior is still not implemented.
- Runtime dry-run behavior remains gated.
- Future repository work must preserve the same safe DTO projection and redacted error envelope.

## Decision

Post-merge schema parity passes for the current M2-8M scope. The merge is accepted as a contract merge only, not as approval for Aurora repository, SQL apply, or external infrastructure commands.
