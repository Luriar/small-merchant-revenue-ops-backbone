# M2 Replay Worker Contract / Execution Boundary

Purpose: Define future replay/reprocess worker behavior before implementation.

## Worker Responsibilities

- read approved replay/reprocess requests only
- verify `idempotency_key`
- verify `bounded_scope`
- create or link a new run row without mutating original run
- call `linkNewRunId(replayRequestId, newRunId)` after the new run row exists
- update replay request status safely
- append failure state log
- record cleanup/evidence status
- stop on forbidden field leakage

## Non-Goals

- no auto-approval
- no raw message replay by default
- no broadening CDC publication
- no REPLICA IDENTITY FULL quick fix
- no raw payload/full message body retention
- no production rollout in M2 planning docs

## Input Source

Worker input is Aurora `cdc_replay_request` rows with status `approved`. It must not read raw failed messages from DLQ as the default source.

## Allowed Statuses To Pick Up

- `approved` only for normal execution
- optionally `failed` for controlled retry after explicit policy

## Idempotency Behavior

- Same approved request must not create multiple new run rows.
- If `new_run_id` is already linked, reuse it.
- If idempotency conflict is detected, stop and mark safe failure.

## New Run Row Creation

- replay/reprocess creates a new run row
- original run remains immutable
- original failure remains immutable except status/linkage

## Status Transition Behavior

1. `approved` -> `running`
2. link `new_run_id`
3. `running` -> `succeeded` or `failed`
4. `succeeded` -> `cleanup_complete` after cleanup evidence

## Cleanup / Evidence Behavior

- `evidence_report_ref` must be present.
- cleanup_status must move through `pending`, `complete`, or `failed`.
- cleanup/evidence report linkage is required for closure.

## Retry Limit And Bounded Scope

- retry limit must be explicit before worker implementation.
- bounded scope must limit target table/topic/key/time window/count.
- broad replay is not allowed by default.

## Failure Handling

- validation failure: no run creation
- runtime execution failure: mark replay request `failed`, append safe state log
- cleanup failure: mark cleanup status `failed`, stop further execution

## Stop Conditions

- forbidden field leakage
- missing `idempotency_key`
- missing `bounded_scope`
- missing `evidence_report_ref`
- replay without new run row
- original failure mutation
- original run mutation
- raw message replay by default
- publication scope broadening
- REPLICA IDENTITY FULL quick fix
