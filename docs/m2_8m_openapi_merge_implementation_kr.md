# M2-8M OpenAPI Merge Implementation

## Purpose And Non-Goals

M2-8M explicitly merges the CDC recovery API contract into `sources/personal_project_openapi_v0_2.yaml` after M2-8J readiness evidence. The merge documents the production route surface that M2-8I already registered through the isolated CDC dispatcher.

Non-goals:

- no Aurora repository
- no real DB queries
- no SQL apply
- no external infrastructure commands
- no runtime persistence change
- no broad `server.js`, `auth.js`, or `error-response.js` rewrite

## Files Modified

- `sources/personal_project_openapi_v0_2.yaml`: CDC Recovery tag, CDC paths, safe CDC schemas, CDC safe error envelopes, and version note.
- `package.json`: added `validate:m2-8m:openapi-merge`.
- Prior validators: added narrow M2-8M compatibility so historical readiness validators accept only the approved CDC OpenAPI merge diff.

## Exact OpenAPI Merge Scope

The merge is limited to the CDC recovery API contract and a safe metadata-only changelog line. The proposal patch remains preserved at `sources/openapi_m2_5_dlq_replay_patch.yaml` as proposal/history.

## Route List Merged

- `GET /api/v1/cdc/failures`
- `GET /api/v1/cdc/failures/{failure_id}`
- `GET /api/v1/cdc/failures/{failure_id}/state-log`
- `POST /api/v1/cdc/failures/{failure_id}/replay-requests`
- `GET /api/v1/cdc/replay-requests`
- `GET /api/v1/cdc/replay-requests/{replay_request_id}`
- `POST /api/v1/cdc/replay-requests/{replay_request_id}/approve`
- `POST /api/v1/cdc/replay-requests/{replay_request_id}/cancel`

## Schema List Merged

- `CdcFailureSummary`
- `CdcFailureDetail`
- `CdcFailureStateLogEntry`
- `CdcReplayRequestSummary`
- `CdcReplayRequestDetail`
- `CreateCdcReplayRequestRequest`
- `CreateCdcReplayRequestResponse`
- `ApproveCdcReplayRequestRequest`
- `ApproveCdcReplayRequestResponse`
- `CancelCdcReplayRequestRequest`
- `CancelCdcReplayRequestResponse`
- CDC list wrappers and `CdcErrorResponse`

## Parity Gap Resolution Summary

M2-8J identified summary/detail width and role-ref naming gaps. M2-8M resolves them by anchoring the main OpenAPI to the current safe DTO mapper outputs:

- failure summary/detail use the safe `FAILURE_RESPONSE_FIELDS` projection
- replay summary/detail use the safe `REPLAY_REQUEST_RESPONSE_FIELDS` projection
- create request uses the service-validated safe input fields
- approve/cancel request requires only `evidence_report_ref`
- proposal-only fields not emitted by runtime are not required in main OpenAPI

## Safe Error Envelope Summary

CDC routes reference a redacted `CdcErrorResponse` envelope:

- `error.code`
- `error.message`
- `error.status`
- optional `error.evidence_report_ref`

Supported safe codes are `validation_error`, `unauthorized`, `forbidden`, `not_found`, `idempotency_conflict`, `invalid_state_transition`, and `internal_error`.

## Auth/Role Documentation Summary

The merged route descriptions document:

- `readonly_role` can read and cannot mutate
- `operator` can create replay requests
- `operator` cannot approve/cancel
- `maintainer` is required for approve/cancel
- `system_worker` cannot create arbitrary replay requests or approve/cancel

## Versioning/Changelog Note

The main OpenAPI info description now records that the CDC recovery API contract was added with safe metadata-only responses.

## Boundary Statements

The proposal patch file was preserved and remains proposal-only.

Aurora repository was not implemented. SQL apply and external infrastructure commands were not used. The merge does not add raw payloads, full message bodies, issue raw values, prod_change payload/actor values, stack traces, SQL details, or persistence internals.

## Validation Results

- `python3 scripts/validate_m2_8m_openapi_merge.py`: 18 PASS, 0 FAIL
- `npm run validate:m2-8m:openapi-merge`: 18 PASS, 0 FAIL
- `npm run validate:m2-8j:openapi-readiness`: 69 PASS, 0 FAIL
- `npm run test:m2-8i:production-routes`: PASS
- M2-8I, M2-8B, M2-8H, M2-8G, M2-8F, M2-8E, M2-8D, M2-8C, M2-8B-Prep, M2-8A, M2-7, and global safety validators: PASS
- `python3 -m py_compile scripts/validate_m2_8m_openapi_merge.py scripts/m2_8m_validator_compat.py`: PASS
- `git diff --check`: PASS

## Rollback Strategy

Rollback is limited to removing the CDC Recovery tag, CDC paths, CDC parameters/responses, CDC schemas, and the CDC changelog line from `sources/personal_project_openapi_v0_2.yaml`, plus removing the M2-8M validator/script wiring. Runtime route wiring can remain independently controlled by the M2-8I rollback plan.
