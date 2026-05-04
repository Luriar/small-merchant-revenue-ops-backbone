# CDC Recovery Repository Contract

Status: proposal-only, not production rollout.

Repository responsibilities:

- Define the persistence boundary for M2-4 proposed Aurora tables.
- Keep original failure history immutable except controlled status/linkage fields.
- Never mutate original run records.
- Support future new run row linkage through `linkNewRunId`.
- Append state history with safe metadata only.
- Avoid real DB queries in this M2-6 contract file.

Required methods:

- `listFailures(filter, page)`
- `getFailureById(failureId)`
- `listFailureStateLog(failureId, page)`
- `listReplayRequests(filter, page)`
- `getReplayRequestById(replayRequestId)`
- `findReplayRequestByIdempotencyKey(idempotencyKey)`
- `createReplayRequest(input)`
- `appendFailureStateLog(input)`
- `updateFailureStatus(failureId, transition)`
- `updateReplayRequestStatus(replayRequestId, transition)`
- `linkNewRunId(replayRequestId, newRunId)`

Contract notes:

- `createReplayRequest(input)` stores only safe metadata and requires `evidence_report_ref`.
- `appendFailureStateLog(input)` records safe reason code, status transition, owner, and evidence reference only.
- `updateFailureStatus(failureId, transition)` must not rewrite root failure metadata.
- `updateReplayRequestStatus(replayRequestId, transition)` must reject invalid state transition at service level before repository mutation.
- `linkNewRunId(replayRequestId, newRunId)` is called only after a future worker creates a new run row.
- `idempotency_key` lookup must be exact and unique.

Forbidden field leakage prevention:

- no raw payloads
- no full message bodies
- no issue title/body/payload/reporter values
- no prod_change payload/actor values
- no secrets, DB URLs, endpoints, tokens, passwords, or raw connection strings
