# M2-3 DLQ Message Contract

## Purpose

This document defines the metadata-only DLQ record contract for the M2 CDC/read-model path.

DLQ is for evidence-safe failure metadata. DLQ is not a raw message archive.

This is not production rollout.

## Non-Goals

The DLQ contract does not create Kafka topics, database tables, ClickHouse tables, replay workers, or infrastructure.

The DLQ contract does not authorize raw message replay.

## Safe Metadata Contract

DLQ records should contain safe operational metadata only.

Required safe fields:

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

Recommended statuses:

- `open`
- `triaged`
- `replay_approved`
- `reprocess_approved`
- `resolved`
- `closed_no_replay`

## Forbidden DLQ Content

DLQ must not store:

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
- screenshots or logs exposing raw values

DLQ may record forbidden field names detected, but never their values.

## Failure Type Examples

Allowed `failure_type` examples:

- `clickhouse_json_each_row_parse_failure`
- `forbidden_field_leakage`
- `delete_shape_mismatch`
- `publication_drift`
- `connector_config_drift`
- `topic_drift`
- `slot_lag_wal_pressure`
- `cleanup_failure`
- `evidence_capture_violation`

## Primary Key Rules

The `primary_key` object should include only key identifiers required to locate the affected source row or recovery run.

Examples:

- `change_id`
- `trace_id`
- `issue_id`

Do not include source raw field values in `primary_key`.

## Parser Error Summary Rules

`parser_error_summary` should be a short class-level explanation.

Allowed:

- missing required field names
- unexpected field names
- parse error class
- target table name

Forbidden:

- full failed message
- raw row value
- raw payload value
- issue title/body/reporter value
- prod_change actor value

## Sample Fixtures

Safe DLQ fixture files:

- `fixtures/m2_3_dlq/clickhouse_parse_failure.json`
- `fixtures/m2_3_dlq/forbidden_field_leakage.json`
- `fixtures/m2_3_dlq/delete_shape_mismatch.json`

These fixtures are safe metadata only and exist for static validation of the M2-3 contract.

## Evidence-Safe Retention

Retain:

- failure id
- failure type
- field-name sets
- source topic
- source table
- primary key identifiers
- attempt count
- owner
- evidence report reference
- cleanup evidence

Do not retain raw payloads or full message bodies.
