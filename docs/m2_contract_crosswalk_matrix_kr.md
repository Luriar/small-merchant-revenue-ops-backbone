# M2 Contract Crosswalk Matrix

Purpose: M2-4 storage, M2-5 API proposal, M2-6 service/repository contract, M2-7 DTO mapper, fixtures, and optional ClickHouse read model fields stay aligned.

Not part of this crosswalk:

- raw payloads are not part of the crosswalk
- full message bodies are not part of the crosswalk
- issue title/body/payload/reporter values are not part of the crosswalk
- prod_change payload/actor values are not part of the crosswalk

| Field | Source Of Truth | Transport Representation | API Representation | DTO Representation | Nullable/Required | API Expose | Evidence Allowed | Notes |
|---|---|---|---|---|---|---|---|---|
| failure_id | Aurora `cdc_failure` | Kafka DLQ value id | `failure_id` | `failure_id` | required | yes | yes | Primary failure identity |
| failure_type | Aurora `cdc_failure` | safe string | `failure_type` | `failure_type` | required | yes | yes | parse/missing/forbidden category |
| source_topic | Aurora `cdc_failure` | topic name | `source_topic` | `source_topic` | required | yes | yes | Topic name only |
| source_table | Aurora `cdc_failure` | table name | `source_table` | `source_table` | required | yes | yes | Source table name only |
| primary_key | Aurora `cdc_failure` | safe key object | `primary_key` | `primary_key` | required | yes | yes | Identifier object only |
| op | Aurora `cdc_failure` | CDC op code | `op` | `op` | required | yes | yes | c/u/d/r/unknown |
| ts_ms | Aurora `cdc_failure` | CDC timestamp | `ts_ms` | `ts_ms` | required | yes | yes | Debezium timestamp |
| observed_field_names | Aurora `cdc_failure` | field-name array | `observed_field_names` | `observed_field_names` | required | yes | yes | Names only, no values |
| missing_required_fields | Aurora `cdc_failure` | field-name array | `missing_required_fields` | `missing_required_fields` | required | yes | yes | Names only |
| unexpected_fields | Aurora `cdc_failure` | field-name array | `unexpected_fields` | `unexpected_fields` | required | yes | yes | Names only |
| forbidden_field_names_detected | Aurora `cdc_failure` | field-name array | `forbidden_field_names_detected` | `forbidden_field_names_detected` | required | yes | yes | Names only as leakage signal |
| parser_error_class | Aurora `cdc_failure` | safe string | `parser_error_class` | `parser_error_class` | required | yes | yes | Class only |
| parser_error_summary | Aurora `cdc_failure` | bounded summary | `parser_error_summary` | `parser_error_summary` | required | yes | yes | No raw values |
| first_seen_at | Aurora `cdc_failure` | timestamp | `first_seen_at` | `first_seen_at` | required | yes | yes | First observation |
| last_seen_at | Aurora `cdc_failure` | timestamp | `last_seen_at` | `last_seen_at` | required | yes | yes | Last observation |
| attempt_count | Aurora tables | integer | `attempt_count` | `attempt_count` | required | yes | yes | Non-negative |
| status | Aurora tables | safe enum | `status` | `status` | required | yes | yes | Failure or replay request lifecycle |
| owner | Aurora tables | owner ref | `owner` | `owner` | required | yes | yes | Operator/team ref only |
| evidence_report_ref | Aurora tables/ops evidence | evidence ref | `evidence_report_ref` | `evidence_report_ref` | required for mutations | yes | yes | Required link |
| replay_request_id | Aurora `cdc_replay_request` | request id | `replay_request_id` | `replay_request_id` | required for replay | yes | yes | Primary replay request identity |
| requested_action | Aurora `cdc_replay_request` | safe enum | `requested_action` | `requested_action` | required | yes | yes | retry/replay/reprocess |
| idempotency_key | Aurora `cdc_replay_request` | safe key | `idempotency_key` | `idempotency_key` | required for create | yes | yes | Exact dedupe key |
| source_run_id | Aurora `cdc_replay_request` | run id | `source_run_id` | `source_run_id` | nullable | yes | yes | Original run reference only |
| new_run_id | Aurora `cdc_replay_request` | run id | `new_run_id` | `new_run_id` | nullable until worker | yes | yes | Set after new run row |
| bounded_scope | Aurora `cdc_replay_request` | safe object | `bounded_scope` | `bounded_scope` | required | yes | yes | Scope metadata only |
| cleanup_status | Aurora `cdc_replay_request` | safe enum | `cleanup_status` | `cleanup_status` | required | yes | yes | cleanup lifecycle |

Optional read models:

- ClickHouse `cdc_failure_read_model` mirrors safe `cdc_failure` fields.
- ClickHouse `cdc_replay_request_read_model` mirrors safe `cdc_replay_request` fields.
- M2-5 API fixtures and M2-6 service fixtures must use the same field names above.
- M2-7 DTO mapper output must remain a subset of API representation.
