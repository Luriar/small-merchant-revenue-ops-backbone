# CDC Recovery DTO Mapper Contract

Status: proposal-only, not production rollout.

DTO mapper responsibilities:

- Convert repository records into safe response DTOs.
- Enforce allowed response fields.
- Remove forbidden response fields recursively.
- Prevent forbidden field leakage before handler responses.
- Return safe metadata only.

Allowed response fields:

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
- `replay_request_id`
- `requested_action`
- `idempotency_key`
- `source_run_id`
- `new_run_id`
- `bounded_scope`
- `cleanup_status`
- `created_at`
- `updated_at`
- `approved_at`
- `completed_at`
- `items`
- `next_cursor`

Forbidden response fields:

- `payload`
- `body`
- `title`
- `reporter`
- `actor`
- `raw_message`
- `message_body`
- `full_message`
- `secret`
- `password`
- `token`
- `endpoint`
- `db_url`
- `connection_string`

Recursive stripping rules:

- If a key matches a forbidden response field, drop it and its value.
- If an object contains nested safe metadata, recursively strip before returning.
- If an array contains objects, recursively strip each item.
- If stripping removes evidence-critical metadata, service must raise a safe validation or internal error rather than returning partial raw-derived data.

Do-not-record rules:

- no raw payloads
- no full message bodies
- no issue title/body/payload/reporter values
- no prod_change payload/actor values
- no secrets
- no DB URLs
- no endpoints
- no tokens
- no passwords
- no raw connection strings

DTO output rules:

- Failure DTOs expose only safe metadata and `evidence_report_ref`.
- Replay request DTOs expose idempotency and execution linkage metadata, including `new_run_id` only after a new run row exists.
- State log DTOs expose transition status, safe reason code, owner, and evidence linkage only.
