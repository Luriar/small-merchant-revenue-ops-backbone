# CDC Recovery Handler Contract

Status: proposal-only, not production rollout.

Handler responsibilities:

- Map every M2-5 endpoint to a service method.
- Perform authentication and role checks before service mutation.
- Normalize path/query inputs without logging raw values.
- Map service errors into safe error envelope responses.
- Return only DTO mapper outputs.

Route-to-service mapping:

- `GET /api/v1/cdc/failures` -> `service.listFailures(filter, page)` or repository-backed read service.
- `GET /api/v1/cdc/failures/{failure_id}` -> `service.getFailureDetail(failureId)`.
- `GET /api/v1/cdc/failures/{failure_id}/state-log` -> `service.listFailureStateLog(failureId, page)`.
- `POST /api/v1/cdc/failures/{failure_id}/replay-requests` -> `service.createReplayRequest(failureId, input, actor)` where `actor` is call-site identity only and must not be emitted.
- `GET /api/v1/cdc/replay-requests` -> `service.listReplayRequests(filter, page)`.
- `GET /api/v1/cdc/replay-requests/{replay_request_id}` -> `service.getReplayRequestDetail(replayRequestId)`.
- `POST /api/v1/cdc/replay-requests/{replay_request_id}/approve` -> `service.approveReplayRequest(replayRequestId, input, actor)` where `actor` is call-site identity only and must not be emitted.
- `POST /api/v1/cdc/replay-requests/{replay_request_id}/cancel` -> `service.cancelReplayRequest(replayRequestId, input, actor)` where `actor` is call-site identity only and must not be emitted.

Role checks:

- read endpoints: `readonly_role`, `operator`, `maintainer`
- create replay request: `operator`, `maintainer`
- approve replay request: `maintainer`
- cancel replay request: `maintainer`
- future worker status linkage: `system_worker`

Error mapping:

- `400` validation error
- `401` unauthorized
- `403` forbidden
- `404` not found
- `409` idempotency conflict / invalid state transition
- `500` internal error without raw details

Error envelope behavior:

- Include safe `code`, safe `message`, HTTP `status`, pseudonymous `request_id` when available, and `evidence_report_ref` when safe.
- Do not include request raw values or persistence raw values.

Forbidden field leakage prevention:

- no raw payloads
- no full message bodies
- no issue title/body/payload/reporter values
- no prod_change payload/actor values
- no secret-like or connection values
