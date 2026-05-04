# M2-5 Idempotent Replay Request Rules

## Purpose

This document defines idempotency rules for DLQ replay/reprocess API requests.

Replay is not raw message replay by default.

This is not production rollout.

## Idempotency Key Derivation

`idempotency_key` is required for replay/reprocess request creation.

Recommended derivation inputs:

- `failure_id`
- `requested_action`
- `bounded_scope`
- `attempt_count`
- owner or requester
- target topic or target table

Suggested canonical form:

```text
cdc-replay:{failure_id}:{requested_action}:{scope_hash}:{attempt_count}:{requester_or_owner}
```

The scope hash should be derived from normalized safe metadata only.

## Active Duplicate Request Handling

An active replay request is any request in:

- `requested`
- `approved`
- `running`

If an active request exists for the same `failure_id`, `requested_action`, target, and bounded scope, the API should return `409` unless the incoming request is an exact idempotent replay with the same `idempotency_key`.

## Same Key Replay Behavior

Same key and same request body:

- return the existing replay request
- do not create a duplicate request
- do not create a duplicate new run row

Same key and different request body:

- return `409`
- include a safe conflict summary
- do not include raw values

## Conflict Behavior When Target Or Scope Differs

If the same `idempotency_key` is reused with a different target or bounded scope, return `409`.

If a different `idempotency_key` is used for the same active target and bounded scope, return `409` unless a maintainer explicitly cancels or closes the prior request first.

## `new_run_id` Timing

Replay request creation may return `new_run_id = null`.

`new_run_id` should be assigned only when a future runtime worker creates the new run row.

Once assigned, the same idempotent request must return the same `new_run_id`.

## Relation To Existing Retry / Reprocess Direction

Retry/reprocess creates a new run row.

The original failure remains immutable.

The original run remains immutable.

The API must never rewrite the original run to look successful after a replay.

## Required Request Fields

Replay request creation must include:

- `failure_id`
- `requested_action`
- `bounded_scope`
- `attempt_count`
- owner or requester
- `idempotency_key`
- `evidence_report_ref`

## Cleanup / Evidence Report Linkage

Each replay request must have cleanup/evidence report linkage.

The API response must include `evidence_report_ref`.

Future runtime completion must record cleanup status before closure.

## Stop Conditions

Stop if:

- `idempotency_key` is missing
- request requires raw payloads or full message bodies
- forbidden field leakage appears
- replay is raw message replay by default
- request would mutate the original failure or original run
- request would avoid creating a new run row
- `evidence_report_ref` is missing
- cleanup status cannot be recorded
- `REPLICA IDENTITY FULL` is proposed as a quick fix
