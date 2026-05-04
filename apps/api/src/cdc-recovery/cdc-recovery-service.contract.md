# CDC Recovery Service Contract

Status: proposal-only, not production rollout.

Service responsibilities:

- Validate replay/reprocess request input.
- Enforce `idempotency_key` behavior before creation.
- Enforce state transition behavior before repository mutation.
- Build safe DTOs only through the DTO mapper.
- Preserve original failure and original run immutability.
- Treat `new_run_id` as a future worker linkage after a new run row exists.

Required methods:

- `validateCreateReplayRequest(input)`
- `createReplayRequest(failureId, input, actor)` where `actor` is call-site identity only and must not be serialized, stored as a raw value, or emitted in DTO output.
- `approveReplayRequest(replayRequestId, input, actor)` where `actor` is call-site identity only and must not be serialized, stored as a raw value, or emitted in DTO output.
- `cancelReplayRequest(replayRequestId, input, actor)` where `actor` is call-site identity only and must not be serialized, stored as a raw value, or emitted in DTO output.
- `enforceIdempotency(input)`
- `enforceStateTransition(currentStatus, action)`
- `buildSafeFailureDto(record)`
- `buildSafeReplayRequestDto(record)`

Idempotency behavior:

- Exact replay with the same `idempotency_key` and same normalized intent returns the existing replay request.
- Same `idempotency_key` with different bounded scope, target, action, attempt count, owner, or requester identity returns `409`.
- Same failure and active bounded scope with a different key returns `409` unless business rules later permit a new attempt after completion.

State transition behavior:

- Invalid transition returns `409`.
- Missing required safe fields returns `400`.
- Missing target record returns `404`.
- Unauthorized and forbidden decisions are handled by the handler before mutation.

DTO mapper:

- `buildSafeFailureDto(record)` must strip forbidden response fields recursively.
- `buildSafeReplayRequestDto(record)` must strip forbidden response fields recursively.

Forbidden field leakage prevention:

- no raw payloads
- no full message bodies
- no issue title/body/payload/reporter values
- no prod_change payload/actor values
- forbidden field leakage is a stop condition

Evidence requirements:

- `evidence_report_ref` is required for mutating service operations.
- State changes append safe state log entries.
