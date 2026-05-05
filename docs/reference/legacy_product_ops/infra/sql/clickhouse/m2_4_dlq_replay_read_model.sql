-- PROPOSAL ONLY - DO NOT APPLY AUTOMATICALLY
-- M2-4 optional ClickHouse read model proposal.
-- ClickHouse is for trend/operability queries only and is not the source of truth.
-- Forbidden storage: raw payloads, full message bodies, secrets, issue raw values,
-- prod_change sensitive values, endpoints, tokens, passwords, and connection strings.
-- Retention/TTL should be selected during production rollout planning.

CREATE TABLE IF NOT EXISTS cdc_failure_read_model
(
    failure_id String,
    failure_type LowCardinality(String),
    source_topic LowCardinality(String),
    source_table LowCardinality(String),
    primary_key_json String,
    op LowCardinality(String),
    ts_ms Int64,
    observed_field_names Array(String),
    missing_required_fields Array(String),
    unexpected_fields Array(String),
    forbidden_field_names_detected Array(String),
    parser_error_class LowCardinality(String),
    parser_error_summary String,
    first_seen_at DateTime64(3, 'UTC'),
    last_seen_at DateTime64(3, 'UTC'),
    attempt_count UInt32,
    status LowCardinality(String),
    owner LowCardinality(String),
    evidence_report_ref String,
    source_run_id Nullable(String),
    latest_replay_request_id Nullable(String),
    ingested_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = MergeTree
ORDER BY (status, failure_type, first_seen_at, failure_id);

CREATE TABLE IF NOT EXISTS cdc_replay_request_read_model
(
    replay_request_id String,
    failure_id String,
    requested_action LowCardinality(String),
    requested_by String,
    owner LowCardinality(String),
    reason_summary String,
    target_topic Nullable(String),
    target_table Nullable(String),
    bounded_scope_json String,
    idempotency_key String,
    attempt_count UInt32,
    status LowCardinality(String),
    source_run_id Nullable(String),
    new_run_id Nullable(String),
    evidence_report_ref String,
    cleanup_status LowCardinality(String),
    requested_at DateTime64(3, 'UTC'),
    approved_at Nullable(DateTime64(3, 'UTC')),
    completed_at Nullable(DateTime64(3, 'UTC')),
    ingested_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = MergeTree
ORDER BY (status, requested_action, requested_at, replay_request_id);
