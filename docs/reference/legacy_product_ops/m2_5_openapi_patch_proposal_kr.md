# M2-5 OpenAPI Patch Proposal

## Purpose

This document explains the proposed OpenAPI patch for M2-5 DLQ/replay APIs.

This is not production rollout.

The patch is proposal only and must not be merged automatically.

Patch file:

- `sources/openapi_m2_5_dlq_replay_patch.yaml`

## Scope

The patch proposes:

- failure inspection endpoints
- failure state-log endpoint
- replay request creation endpoint
- replay request list/detail endpoints
- replay request approve/cancel endpoints
- safe metadata schemas
- 401/403 auth responses
- 409 conflict behavior for idempotency and invalid state transitions

## Safe Schema Rules

Schemas contain safe metadata only.

The patch must not define fields for raw payloads, full message bodies, issue raw values, prod_change sensitive values, secrets, endpoints, account IDs, DB URLs, tokens, passwords, or raw connection strings.

Allowed schema fields include:

- `failure_id`
- `failure_type`
- `source_topic`
- `source_table`
- `primary_key`
- `op`
- `ts_ms`
- field-name sets
- parser error class
- parser error summary without raw values
- `status`
- `owner`
- `attempt_count`
- `idempotency_key`
- `replay_request_id`
- `new_run_id`
- `evidence_report_ref`

## Proposal Handling

The patch must remain separate until reviewed against:

- main OpenAPI conventions
- Aurora repository contract
- run/retry/reprocess implementation direction
- PII/raw field exclusion rules

## Stop Conditions

Stop if:

- forbidden field leakage appears in schema fields or examples
- request/response schema includes raw payloads or full message bodies
- replay request creation does not require `idempotency_key`
- replay does not create a new run row
- `new_run_id` behavior mutates the original run
- `evidence_report_ref` is missing
- 409 conflict behavior is absent
