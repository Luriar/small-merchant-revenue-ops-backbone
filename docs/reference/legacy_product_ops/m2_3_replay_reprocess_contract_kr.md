# M2-3 Replay / Reprocess Contract

## Purpose

This document defines replay and reprocess rules for M2 CDC/read-model recovery.

Replay and reprocess must preserve structured, traceable, evidence-safe operational reasoning.

This is not production rollout.

## Core Rules

Replay is not raw message replay by default.

Reprocess should prefer safe metadata and source re-read where possible.

Retry/reprocess should create a new run row and must not mutate the original run.

Replay must preserve idempotency.

Replay output must update evidence-safe status only.

## Replay Request Requirements

Every replay or reprocess request must include:

- reason
- owner
- source failure reference
- target topic or target table
- bounded scope
- bounded max attempt count
- planned start and stop window
- expected safe field-name set
- cleanup owner
- cleanup status requirement
- evidence report reference

## Stop Conditions

Stop replay or reprocess immediately if:

- forbidden field leakage appears
- raw payloads or full message bodies are required
- source publication must be broadened
- connector uses `publication.autocreate.mode=all_tables`
- topic routing drifts from `cdc.aurora.*`
- `__op` or `__ts_ms` appears instead of `op` and `ts_ms`
- ClickHouse mapping requires Debezium envelope fields as data columns
- slot lag / WAL pressure grows unexpectedly
- anyone proposes `REPLICA IDENTITY FULL` as a quick fix
- cleanup evidence cannot be completed

## New Run Row Requirement

Retry and reprocess must create a new run row.

The original run remains immutable as the source of failure history.

The new run row should record:

- source failure id
- run type
- original run id
- attempt count
- reason
- owner
- bounded scope
- idempotency key
- cleanup result
- evidence report reference

This contract does not introduce `retried` as a run status.

## Idempotency Rules

Replay must not create duplicate operational evidence for the same approved replay scope.

Replay requests should have an idempotency key derived from:

- failure id
- requested target
- bounded source scope
- attempt number

If the same replay request is submitted again with the same idempotency key, it should resolve to the same new run row.

## Safe Source Re-Read Preference

When recovery requires row content, prefer a controlled source re-read from safe source columns or a safe CDC/outbox table.

Do not use DLQ as a raw source-of-truth store.

If source re-read cannot provide enough data safely, evaluate:

- safe CDC/outbox table
- nullability/default handling
- delete-specific ingestion strategy
- contract-level schema correction

Do not switch to `REPLICA IDENTITY FULL` as a quick fix.

## Evidence Retention Rules

Record:

- field-name sets
- source topic
- source table
- primary key identifiers
- replay attempt count
- owner approval
- yes/no leakage result
- cleanup evidence
- new run row id

Do not record:

- raw payloads
- full message bodies
- secrets
- DB URLs
- endpoints
- account IDs
- tokens
- passwords
- raw connection strings
- issue title/body/payload/reporter values
- prod_change payload/actor values

## Relationship To Existing Run Direction

The existing product direction says retry and reprocess create new run rows rather than rewinding an existing run.

M2-3 follows that direction for CDC/read-model recovery. Recovery evidence explains what happened without converting the CDC pipeline into a raw data dump.
