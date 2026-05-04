# M2-4 Kafka DLQ Topic Contract

## Purpose

This document defines the Kafka DLQ topic contract for M2 CDC/read-model failure metadata.

This is not production rollout.

## Proposed Topic

Topic name:

- `cdc.dlq.m2_1_traceability`

The topic is a bounded transport/buffer for metadata-only failure records. It is not the operational source of truth and is not a raw message archive.

## Partitioning Key Recommendation

Recommended partitioning key:

- `failure_id`

Alternative for ordering by source object:

- `source_table + primary key identifier`

Use `failure_id` by default because it keeps repeated observations of the same failure grouped while avoiding raw source values.

## Value JSON Contract

The value must be a JSON object containing safe metadata only.

Required fields:

- `failure_id`
- `failure_type`
- `source_topic`
- `source_table`
- `primary_key`
- `op`
- `ts_ms`
- `observed_field_names`
- `missing_required_fields`
- `unexpected_fields`
- `forbidden_field_names_detected`
- `parser_error_class`
- `parser_error_summary`
- `first_seen_at`
- `last_seen_at`
- `attempt_count`
- `status`
- `owner`
- `evidence_report_ref`

Replay-related records may also include:

- `replay_request_id`
- `requested_action`
- `idempotency_key`
- `source_run_id`
- `new_run_id`
- `bounded_scope`
- `cleanup_status`

## Headers

Allowed headers:

- `failure_id`
- `failure_type`
- `source_topic`
- `schema_version`
- `created_at`

Forbidden headers:

- raw payloads
- full message bodies
- secrets
- DB URLs
- endpoints
- account IDs
- SecretString
- tokens
- passwords
- raw connection strings
- issue title/body/payload/reporter values
- prod_change payload/actor values

## Retention Considerations

Retention should be bounded.

The long-term operational source of truth is Aurora, not the Kafka DLQ topic.

Retention should be long enough to support bounded replay-read and short enough to avoid accumulating stale operational metadata.

## No Raw Message Body Rule

The DLQ topic value must not contain raw failed message content.

The topic may contain:

- field-name sets
- missing field names
- unexpected field names
- forbidden field names detected
- parser error class
- short parser error summary without values

The topic must not contain raw values.

## Bounded Replay-Read Rule

Replay-read from the DLQ topic must be bounded by:

- failure id
- time window
- max records
- owner approval
- cleanup evidence requirement

Replay is not raw message replay by default.

## Sample Records

Safe fixture examples:

- `fixtures/m2_4_dlq_topic/clickhouse_parse_failure.json`
- `fixtures/m2_4_dlq_topic/forbidden_field_leakage.json`
- `fixtures/m2_4_dlq_topic/replay_requested.json`

The fixtures use safe metadata only and do not contain raw payloads or full message bodies.
