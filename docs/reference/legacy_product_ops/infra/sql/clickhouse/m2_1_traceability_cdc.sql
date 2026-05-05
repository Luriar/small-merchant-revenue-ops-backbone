-- ============================================================================
-- M2-1 ClickHouse DDL Preparation — Traceability CDC Slice
-- ============================================================================
--
-- This SQL is an M2-1 preparation artifact and has not been applied.
-- It does not mean M2 has been implemented or deployed.
--
-- Scope:
--   Aurora prod_change / trace / safe issue
--   -> Debezium CDC topics
--   -> ClickHouse CDC target tables
--
-- Source design reference:
--   sources/clickhouse_ddl_v2_1.sql
--
-- Deliberately excluded from this M2-1 entrypoint:
--   - events_raw
--   - events_agg_1m
--   - anomaly_detection_results
--   - anomaly_trace_link
--   - evidence, run, run_state_log read models
--
-- PII rule:
--   issue.title, issue.body, issue.payload, and issue.reporter are not present
--   in the issue Kafka engine table or issue CDC target table.
--
-- Kafka topic contract:
--   Debezium topic.prefix aurora-productops-m2-1 plus RegexRouter produces:
--     aurora-productops-m2-1.public.prod_change -> cdc.aurora.prod_change
--     aurora-productops-m2-1.public.trace       -> cdc.aurora.trace
--     aurora-productops-m2-1.public.issue       -> cdc.aurora.issue
--
-- Debezium SMT output contract:
--   ExtractNewRecordState unwrap emits flat values with op and ts_ms fields.
--   add.fields.prefix must be empty, so ClickHouse expects op/ts_ms, not
--   __op/__ts_ms. DELETE rewrite events are mapped to _deleted = 1 by each MV.
-- ============================================================================

-- ============================================================================
-- 1. prod_change_cdc — Aurora prod_change CDC target
-- ============================================================================
-- M2-1 keeps the safe change marker columns needed for traceability timeline
-- joins. prod_change payload/actor/rule_scope are intentionally not projected
-- into this ClickHouse target in this smallest slice.

CREATE TABLE IF NOT EXISTS prod_change_cdc (
  change_id          String,
  chgt_cd            LowCardinality(String),
  title              String,
  target_service     LowCardinality(String),
  target_component   Nullable(String),
  variation          LowCardinality(Nullable(String)),
  cohort             Nullable(String),
  source             LowCardinality(String),
  occurred_at        DateTime64(3, 'UTC'),
  received_at        DateTime64(3, 'UTC'),
  created_at         DateTime64(3, 'UTC'),
  updated_at         DateTime64(3, 'UTC'),
  _op                LowCardinality(String) DEFAULT 'c',
  _ts_ms             UInt64 DEFAULT 0,
  _deleted           UInt8 DEFAULT 0,
  _ingested_at       DateTime64(3, 'UTC') DEFAULT now64(3),
  INDEX idx_prod_change_target_service target_service TYPE set(100) GRANULARITY 4,
  INDEX idx_prod_change_occurred_at occurred_at TYPE minmax GRANULARITY 4
) ENGINE = ReplacingMergeTree(_ts_ms)
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (change_id);

CREATE TABLE IF NOT EXISTS prod_change_cdc_kafka (
  op                 LowCardinality(String),
  ts_ms              UInt64,
  change_id          String,
  chgt_cd            String,
  title              String,
  target_service     String,
  target_component   Nullable(String),
  variation          Nullable(String),
  cohort             Nullable(String),
  source             String,
  occurred_at        DateTime64(3, 'UTC'),
  received_at        DateTime64(3, 'UTC'),
  created_at         DateTime64(3, 'UTC'),
  updated_at         DateTime64(3, 'UTC')
) ENGINE = Kafka
SETTINGS
  kafka_broker_list = '${MSK_BOOTSTRAP_SERVERS}',
  kafka_topic_list = 'cdc.aurora.prod_change',
  kafka_group_name = 'clickhouse-m2-1-prod-change-cdc',
  kafka_format = 'JSONEachRow',
  kafka_num_consumers = 1,
  kafka_max_block_size = 65536,
  kafka_skip_broken_messages = 100,
  kafka_handle_error_mode = 'stream',
  input_format_skip_unknown_fields = 1;

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_prod_change_cdc_to_target
TO prod_change_cdc AS
SELECT
  change_id,
  chgt_cd,
  title,
  target_service,
  target_component,
  variation,
  cohort,
  source,
  occurred_at,
  received_at,
  created_at,
  updated_at,
  op AS _op,
  ts_ms AS _ts_ms,
  if(op = 'd', 1, 0) AS _deleted,
  now64(3) AS _ingested_at
FROM prod_change_cdc_kafka
WHERE op IN ('c', 'u', 'd', 'r');

-- ============================================================================
-- 2. trace_cdc — Aurora trace CDC target
-- ============================================================================
-- MVP trace status remains API/UI suspected-only. The Aurora table may contain
-- future statuses, but M2-1 does not introduce a new status contract.

CREATE TABLE IF NOT EXISTS trace_cdc (
  trace_id                String,
  change_id               Nullable(String),
  primary_issue_id        Nullable(String),
  status                  LowCardinality(String),
  confidence              LowCardinality(String),
  anomaly_window_start    DateTime64(3, 'UTC'),
  anomaly_window_end      DateTime64(3, 'UTC'),
  anomaly_type            LowCardinality(String),
  anomaly_metric          LowCardinality(String),
  anomaly_detail          String,
  linked_event_count      UInt32,
  linked_issue_count      UInt32,
  evidence_count          UInt32,
  generated_by_run_id     Nullable(String),
  created_at              DateTime64(3, 'UTC'),
  updated_at              DateTime64(3, 'UTC'),
  _op                     LowCardinality(String) DEFAULT 'c',
  _ts_ms                  UInt64 DEFAULT 0,
  _deleted                UInt8 DEFAULT 0,
  _ingested_at            DateTime64(3, 'UTC') DEFAULT now64(3),
  INDEX idx_trace_target_fields (anomaly_type, status) TYPE set(100) GRANULARITY 4
) ENGINE = ReplacingMergeTree(_ts_ms)
PARTITION BY toYYYYMM(anomaly_window_start)
ORDER BY (trace_id);

CREATE TABLE IF NOT EXISTS trace_cdc_kafka (
  op                      LowCardinality(String),
  ts_ms                   UInt64,
  trace_id                String,
  change_id               Nullable(String),
  primary_issue_id        Nullable(String),
  status                  String,
  confidence              String,
  anomaly_window_start    DateTime64(3, 'UTC'),
  anomaly_window_end      DateTime64(3, 'UTC'),
  anomaly_type            String,
  anomaly_metric          String,
  anomaly_detail          String,
  linked_event_count      UInt32,
  linked_issue_count      UInt32,
  evidence_count          UInt32,
  generated_by_run_id     Nullable(String),
  created_at              DateTime64(3, 'UTC'),
  updated_at              DateTime64(3, 'UTC')
) ENGINE = Kafka
SETTINGS
  kafka_broker_list = '${MSK_BOOTSTRAP_SERVERS}',
  kafka_topic_list = 'cdc.aurora.trace',
  kafka_group_name = 'clickhouse-m2-1-trace-cdc',
  kafka_format = 'JSONEachRow',
  kafka_num_consumers = 1,
  kafka_max_block_size = 65536,
  kafka_skip_broken_messages = 100,
  kafka_handle_error_mode = 'stream',
  input_format_skip_unknown_fields = 1;

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_trace_cdc_to_target
TO trace_cdc AS
SELECT
  trace_id,
  change_id,
  primary_issue_id,
  status,
  confidence,
  anomaly_window_start,
  anomaly_window_end,
  anomaly_type,
  anomaly_metric,
  anomaly_detail,
  linked_event_count,
  linked_issue_count,
  evidence_count,
  generated_by_run_id,
  created_at,
  updated_at,
  op AS _op,
  ts_ms AS _ts_ms,
  if(op = 'd', 1, 0) AS _deleted,
  now64(3) AS _ingested_at
FROM trace_cdc_kafka
WHERE op IN ('c', 'u', 'd', 'r');

-- ============================================================================
-- 3. issue_cdc — Aurora issue CDC target, safe projection only
-- ============================================================================
-- Excluded by design:
--   issue.title, issue.body, issue.payload, issue.reporter
--
-- The source logical replication SQL and Strimzi connector should keep these
-- fields out before ClickHouse consumes the topic.

CREATE TABLE IF NOT EXISTS issue_cdc (
  issue_id             String,
  external_id          Nullable(String),
  source               LowCardinality(String),
  issue_family         LowCardinality(String),
  severity             UInt8,
  status               LowCardinality(String),
  keywords             Array(String),
  affected_variation   LowCardinality(Nullable(String)),
  occurred_at          DateTime64(3, 'UTC'),
  received_at          DateTime64(3, 'UTC'),
  resolved_at          Nullable(DateTime64(3, 'UTC')),
  created_at           DateTime64(3, 'UTC'),
  updated_at           DateTime64(3, 'UTC'),
  _op                  LowCardinality(String) DEFAULT 'c',
  _ts_ms               UInt64 DEFAULT 0,
  _deleted             UInt8 DEFAULT 0,
  _ingested_at         DateTime64(3, 'UTC') DEFAULT now64(3),
  INDEX idx_issue_family_status (issue_family, status) TYPE set(200) GRANULARITY 4
) ENGINE = ReplacingMergeTree(_ts_ms)
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (issue_id);

CREATE TABLE IF NOT EXISTS issue_cdc_kafka (
  op                   LowCardinality(String),
  ts_ms                UInt64,
  issue_id             String,
  external_id          Nullable(String),
  source               String,
  issue_family         String,
  severity             UInt8,
  status               String,
  keywords             Array(String),
  affected_variation   Nullable(String),
  occurred_at          DateTime64(3, 'UTC'),
  received_at          DateTime64(3, 'UTC'),
  resolved_at          Nullable(DateTime64(3, 'UTC')),
  created_at           DateTime64(3, 'UTC'),
  updated_at           DateTime64(3, 'UTC')
) ENGINE = Kafka
SETTINGS
  kafka_broker_list = '${MSK_BOOTSTRAP_SERVERS}',
  kafka_topic_list = 'cdc.aurora.issue',
  kafka_group_name = 'clickhouse-m2-1-issue-cdc',
  kafka_format = 'JSONEachRow',
  kafka_num_consumers = 1,
  kafka_max_block_size = 65536,
  kafka_skip_broken_messages = 100,
  kafka_handle_error_mode = 'stream',
  input_format_skip_unknown_fields = 1;

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_issue_cdc_to_target
TO issue_cdc AS
SELECT
  issue_id,
  external_id,
  source,
  issue_family,
  severity,
  status,
  keywords,
  affected_variation,
  occurred_at,
  received_at,
  resolved_at,
  created_at,
  updated_at,
  op AS _op,
  ts_ms AS _ts_ms,
  if(op = 'd', 1, 0) AS _deleted,
  now64(3) AS _ingested_at
FROM issue_cdc_kafka
WHERE op IN ('c', 'u', 'd', 'r');

-- ============================================================================
-- END OF M2-1 CLICKHOUSE DDL PREPARATION
-- ============================================================================
