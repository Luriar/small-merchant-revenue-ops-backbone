-- ============================================================================
-- ClickHouse DDL — Product Ops Traceability Backbone (OLAP Layer)
-- Version: v2.1 (운영 가이드 보강)
-- Database: ClickHouse 24.x
-- Aurora DDL 참조: aurora_ddl_v2.sql
-- ============================================================================
--
-- v2.0 → v2.1 수정 사항:
--   SQL 코드는 동일. 운영 가이드 주석만 8개 항목 추가:
--   [10] Kafka 토픽 파티션 수 전제
--   [11] at-least-once 전달 보장 및 중복 가능성
--   [12] MV 재생성 절차 (스키마 변경 시)
--   [13] Aurora ↔ CH 타입 매핑 불일치 문서화
--   [14] TTL 만료 후 과거 쿼리 재집계 전략
--   [15] anomaly_trace_link TTL 조정 기준
--   [16] Strimzi SMT null 처리 정책
--   [17] 초기 데이터 적재 전략 (snapshot mode)
--
-- v1.0 → v2.0 수정 사항:
--
-- [치명]
--   1. ReplacingMergeTree(version) → (_ts_ms) 변경 (prod_change_cdc, trace_cdc, issue_cdc)
--      - prod_change는 Aurora에 version 없음, 모든 CDC 테이블 통일
--      - ts_ms는 Debezium이 항상 제공
--   2. Debezium SMT(ExtractNewRecordState + add.fields) 전제 명시
--
-- [중요]
--   3. MV의 SELECT * → 명시적 컬럼 나열
--   4. anomaly_trace_link에 bloom filter 인덱스 추가 (역방향 쿼리)
--   5. Kafka engine 전부에 handle_error_mode='stream' 추가
--
-- [개선]
--   6. events_raw.is_error 인덱스 minmax → set(2) 변경
--   7. prod_change_cdc에 target_service 스킵 인덱스 추가 (대시보드 쿼리)
--   8. 운영 가이드 주석 추가 (FINAL/argMax, GDPR, Kafka 재시작 등)
--
-- [설계 의도 명시]
--   9. 각 CDC 테이블에서 PII 및 미복제 필드 제외 이유 주석
--   10. GDPR 물리 삭제 크론 운영 가이드
-- ============================================================================

-- ============================================================================
-- Strimzi Debezium SMT 전제 (KafkaConnector CRD 설정)
-- ============================================================================
--
-- 모든 CDC connector는 다음 SMT 체인을 적용한다:
--
--   transforms: unwrap
--   transforms.unwrap.type: io.debezium.transforms.ExtractNewRecordState
--   transforms.unwrap.drop.tombstones: false
--   transforms.unwrap.delete.handling.mode: rewrite
--   transforms.unwrap.add.fields: op,ts_ms
--
-- 결과: Kafka 메시지가 flat 구조 + op/ts_ms 메타 필드 포함
--   { op: "c|u|d|r", ts_ms: <long>, change_id: ..., title: ..., ... }
--
-- issue connector는 추가로 column.exclude.list 설정:
--   table.include.list: public.issue
--   column.exclude.list: public.issue.body,public.issue.payload,public.issue.reporter,public.issue.title
--   → PII 원천 차단 (CH issue_cdc에도 해당 컬럼 없음)
--
-- Strimzi KafkaConnector YAML 예시는 별도 파일 (strimzi_connectors.yaml).
-- ============================================================================

-- ============================================================================
-- 개발/테스트 teardown (필요 시 주석 해제)
-- ============================================================================
-- DROP VIEW IF EXISTS mv_events_raw_to_target;
-- DROP VIEW IF EXISTS mv_events_agg_1m;
-- DROP VIEW IF EXISTS mv_prod_change_cdc_to_target;
-- DROP VIEW IF EXISTS mv_trace_cdc_to_target;
-- DROP VIEW IF EXISTS mv_issue_cdc_to_target;
-- DROP TABLE IF EXISTS events_raw_kafka;
-- DROP TABLE IF EXISTS prod_change_cdc_kafka;
-- DROP TABLE IF EXISTS trace_cdc_kafka;
-- DROP TABLE IF EXISTS issue_cdc_kafka;
-- DROP TABLE IF EXISTS events_raw;
-- DROP TABLE IF EXISTS events_agg_1m;
-- DROP TABLE IF EXISTS prod_change_cdc;
-- DROP TABLE IF EXISTS trace_cdc;
-- DROP TABLE IF EXISTS issue_cdc;
-- DROP TABLE IF EXISTS anomaly_detection_results;
-- DROP TABLE IF EXISTS anomaly_trace_link;

-- ============================================================================
-- 1. events_raw — 원본 이벤트 영구 저장소
-- ============================================================================

CREATE TABLE IF NOT EXISTS events_raw (
  event_id            String COMMENT 'Intake 시 발급된 UUID. Aurora cross-reference용.',
  occurred_at         DateTime64(3, 'UTC') COMMENT '이벤트 발생 시각 (ms 정밀도)',
  received_at         DateTime64(3, 'UTC') DEFAULT now64(3) COMMENT '시스템 수신 시각',
  target_service      LowCardinality(String) COMMENT 'checkout, payment 등',
  event_type          LowCardinality(String) COMMENT 'product | support_issue',
  event_subtype       LowCardinality(String) COMMENT 'checkout_error 등 세부',
  variation           LowCardinality(Nullable(String)) COMMENT 'A/B 테스트 variation',
  cohort              Nullable(String),
  duration_ms         Nullable(UInt32) COMMENT '처리 시간',
  retry_count         UInt8 DEFAULT 0,
  is_error            UInt8 DEFAULT 0 COMMENT '0=정상, 1=에러',
  user_id             Nullable(String) COMMENT 'PII. GDPR 삭제 대상',
  session_id          Nullable(String),
  request_id          Nullable(String),
  payload             String DEFAULT '' COMMENT '원본 JSON. 재처리/조사용 보존',
  source              LowCardinality(String),
  ingestion_batch_id  Nullable(String),
  INDEX idx_variation variation TYPE set(100) GRANULARITY 4,
  INDEX idx_user_id user_id TYPE bloom_filter(0.01) GRANULARITY 4,
  INDEX idx_is_error is_error TYPE set(2) GRANULARITY 4
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (target_service, occurred_at, event_subtype, event_id)
TTL occurred_at + INTERVAL 1 YEAR
SETTINGS index_granularity = 8192;

-- ============================================================================
-- 2. events_raw_kafka — Kafka engine for events.raw
-- ============================================================================

CREATE TABLE IF NOT EXISTS events_raw_kafka (
  event_id           String,
  occurred_at        DateTime64(3, 'UTC'),
  received_at        DateTime64(3, 'UTC'),
  target_service     String,
  event_type         String,
  event_subtype      String,
  variation          Nullable(String),
  cohort             Nullable(String),
  duration_ms        Nullable(UInt32),
  retry_count        UInt8,
  is_error           UInt8,
  user_id            Nullable(String),
  session_id         Nullable(String),
  request_id         Nullable(String),
  payload            String,
  source             String,
  ingestion_batch_id Nullable(String)
) ENGINE = Kafka
SETTINGS
  kafka_broker_list = '${MSK_BOOTSTRAP_SERVERS}',
  kafka_topic_list = 'events.raw',
  kafka_group_name = 'clickhouse-events-consumer',
  kafka_format = 'JSONEachRow',
  kafka_num_consumers = 2,
  kafka_max_block_size = 65536,
  kafka_skip_broken_messages = 100,
  kafka_handle_error_mode = 'stream';

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_events_raw_to_target
TO events_raw AS
SELECT
  event_id,
  occurred_at,
  received_at,
  target_service,
  event_type,
  event_subtype,
  variation,
  cohort,
  duration_ms,
  retry_count,
  is_error,
  user_id,
  session_id,
  request_id,
  payload,
  source,
  ingestion_batch_id
FROM events_raw_kafka;

-- ============================================================================
-- 3. events_agg_1m — 1분 집계
-- ============================================================================

CREATE TABLE IF NOT EXISTS events_agg_1m (
  bucket_minute      DateTime('UTC'),
  target_service     LowCardinality(String),
  event_subtype      LowCardinality(String),
  variation          LowCardinality(Nullable(String)),
  event_count        AggregateFunction(count),
  error_count        AggregateFunction(sumIf, UInt64, UInt8),
  retry_sum          AggregateFunction(sum, UInt64),
  duration_avg       AggregateFunction(avg, UInt32),
  unique_users       AggregateFunction(uniq, String)
) ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(bucket_minute)
ORDER BY (target_service, bucket_minute, event_subtype, variation)
TTL bucket_minute + INTERVAL 3 MONTH;

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_events_agg_1m
TO events_agg_1m AS
SELECT
  toStartOfMinute(occurred_at) AS bucket_minute,
  target_service,
  event_subtype,
  variation,
  countState() AS event_count,
  sumIfState(toUInt64(1), is_error = 1) AS error_count,
  sumState(toUInt64(retry_count)) AS retry_sum,
  avgState(duration_ms) AS duration_avg,
  uniqState(user_id) AS unique_users
FROM events_raw
GROUP BY bucket_minute, target_service, event_subtype, variation;

-- ============================================================================
-- 4. prod_change_cdc — Aurora prod_change 복제
-- ============================================================================
-- 복제 제외 필드: created_by, updated_by
--   이유: 분석에 직접 필요하지 않음. 감사 분석은 Aurora 직접 조회.

CREATE TABLE IF NOT EXISTS prod_change_cdc (
  change_id          String,
  chgt_cd            LowCardinality(String),
  title              String,
  target_service     LowCardinality(String),
  target_component   Nullable(String),
  variation          LowCardinality(Nullable(String)),
  cohort             Nullable(String),
  rule_scope         Nullable(String),
  payload            Nullable(String),
  actor              Nullable(String),
  source             LowCardinality(String),
  occurred_at        DateTime64(3, 'UTC'),
  received_at        DateTime64(3, 'UTC'),
  created_at         DateTime64(3, 'UTC'),
  updated_at         DateTime64(3, 'UTC'),
  _op                LowCardinality(String) DEFAULT 'c',
  _ts_ms             UInt64 DEFAULT 0,
  _deleted           UInt8 DEFAULT 0,
  _ingested_at       DateTime64(3, 'UTC') DEFAULT now64(3),
  INDEX idx_target_service target_service TYPE set(100) GRANULARITY 4,
  INDEX idx_occurred_at occurred_at TYPE minmax GRANULARITY 4
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
  rule_scope         Nullable(String),
  payload            Nullable(String),
  actor              Nullable(String),
  source             String,
  occurred_at        DateTime64(3, 'UTC'),
  received_at        DateTime64(3, 'UTC'),
  created_at         DateTime64(3, 'UTC'),
  updated_at         DateTime64(3, 'UTC')
) ENGINE = Kafka
SETTINGS
  kafka_broker_list = '${MSK_BOOTSTRAP_SERVERS}',
  kafka_topic_list = 'cdc.aurora.prod_change',
  kafka_group_name = 'clickhouse-prod-change-cdc',
  kafka_format = 'JSONEachRow',
  kafka_num_consumers = 1,
  kafka_max_block_size = 65536,
  kafka_skip_broken_messages = 100,
  kafka_handle_error_mode = 'stream';

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
  rule_scope,
  payload,
  actor,
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
-- 5. trace_cdc — Aurora trace 복제
-- ============================================================================
-- 복제 제외 필드: created_by, updated_by

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
  INDEX idx_target_fields (anomaly_type, status) TYPE set(100) GRANULARITY 4
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
  kafka_group_name = 'clickhouse-trace-cdc',
  kafka_format = 'JSONEachRow',
  kafka_num_consumers = 1,
  kafka_max_block_size = 65536,
  kafka_skip_broken_messages = 100,
  kafka_handle_error_mode = 'stream';

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
-- 6. issue_cdc — Aurora issue 복제 (PII 제외)
-- ============================================================================
-- 복제 제외: body, payload, reporter, title, created_by, updated_by
--   PII 원천 차단. Strimzi column.exclude.list 설정으로 Kafka에도 아예 전달 안 됨.

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
  kafka_group_name = 'clickhouse-issue-cdc',
  kafka_format = 'JSONEachRow',
  kafka_num_consumers = 1,
  kafka_max_block_size = 65536,
  kafka_skip_broken_messages = 100,
  kafka_handle_error_mode = 'stream';

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
-- 7. anomaly_detection_results — 이상 탐지 결과
-- ============================================================================

CREATE TABLE IF NOT EXISTS anomaly_detection_results (
  detection_id       String COMMENT 'UUID',
  run_id             String COMMENT 'Aurora run_id 참조 (cross-system)',
  target_service     LowCardinality(String),
  event_subtype      LowCardinality(String),
  variation          LowCardinality(Nullable(String)),
  anomaly_type       LowCardinality(String) COMMENT 'volume/error/retry/cohort',
  anomaly_metric     LowCardinality(String),
  severity_score     Float32 COMMENT '0.0~1.0',
  baseline_value     Float64,
  actual_value       Float64,
  delta_pct          Float64,
  threshold          Float64,
  baseline_start     DateTime64(3, 'UTC'),
  baseline_end       DateTime64(3, 'UTC'),
  compare_start      DateTime64(3, 'UTC'),
  compare_end        DateTime64(3, 'UTC'),
  detected_at        DateTime64(3, 'UTC') DEFAULT now64(3),
  detection_config   String DEFAULT '{}' COMMENT '탐지 설정 JSON 스냅샷'
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(detected_at)
ORDER BY (target_service, detected_at, anomaly_type)
TTL detected_at + INTERVAL 6 MONTH;

-- ============================================================================
-- 8. anomaly_trace_link — 탐지 결과 ↔ trace 연결 (M:N)
-- ============================================================================

CREATE TABLE IF NOT EXISTS anomaly_trace_link (
  detection_id       String,
  trace_id           String,
  linked_at          DateTime64(3, 'UTC') DEFAULT now64(3),
  linked_by_run_id   Nullable(String),
  INDEX idx_trace_id trace_id TYPE bloom_filter(0.01) GRANULARITY 4
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(linked_at)
ORDER BY (detection_id, trace_id)
TTL linked_at + INTERVAL 6 MONTH;

-- ============================================================================
-- 운영 가이드
-- ============================================================================
--
-- [1] ReplacingMergeTree 조회 패턴
--   CDC 테이블(prod_change_cdc, trace_cdc, issue_cdc)은 같은 PK의 여러 버전 가질 수 있음.
--   최신값 조회 방법 2가지:
--     A) argMax: SELECT argMax(status, _ts_ms) FROM trace_cdc WHERE trace_id = ?
--        → 빠름, 프로덕션 권장
--     B) FINAL: SELECT * FROM trace_cdc FINAL WHERE trace_id = ?
--        → 쿼리 시 병합, 느림. 개발/디버깅용만.
--   _deleted=1 필터 반드시 추가: WHERE _deleted = 0
--
-- [2] AggregatingMergeTree 조회
--   events_agg_1m은 AggregateFunction 타입 → Merge 함수로 감싸야 값 나옴
--     countMerge(event_count), sumIfMerge(error_count), ...
--   GROUP BY에 bucket_minute, target_service 등 포함 필수
--
-- [3] Kafka Consumer 관리
--   - Consumer 중단/재시작: DETACH TABLE ... ATTACH TABLE
--   - Offset 리셋 필요 시 Kafka 레벨에서 그룹 offset 조정
--   - handle_error_mode='stream' 에러는 system.kafka_engine_errors에 저장
--
-- [4] GDPR / PII 물리 삭제
--   user_id로 특정되는 이벤트 물리 삭제:
--     ALTER TABLE events_raw DELETE WHERE user_id = '<uid>'
--   _deleted=1로 플래그된 레코드 주기 정리 (월 1회 크론):
--     ALTER TABLE issue_cdc DELETE WHERE _deleted = 1 AND _ingested_at < now() - INTERVAL 30 DAY
--   주의: ALTER TABLE DELETE는 mutation으로 비동기
--
-- [5] CDC 파이프라인 운영
--   Strimzi KafkaConnector YAML 설정은 반드시 column.exclude.list 적용 (PII 차단)
--   SMT unwrap 설정: transforms=unwrap, ExtractNewRecordState, add.fields=op,ts_ms
--   정기 감사: 테스트 쿼리로 PII 필드 컬럼 존재 여부 확인
--
-- [6] TTL 정책
--   events_raw:                1 YEAR  (재처리 원천)
--   events_agg_1m:             3 MONTH (raw에서 재생성 가능)
--   anomaly_detection_results: 6 MONTH
--   anomaly_trace_link:        6 MONTH
--   CDC 테이블:                 TTL 없음 (Aurora가 source of truth)
--
-- [7] Skip 인덱스 유지
--   INSERT 시 자동 유지됨
--   기존 데이터에 새 인덱스 적용: ALTER TABLE ... MATERIALIZE INDEX
--
-- [8] 파티션 관리
--   오래된 파티션 수동 drop: ALTER TABLE events_raw DROP PARTITION '202501'
--
-- [9] 분산 트랜잭션 주의 (Aurora ↔ CH)
--   Airflow DAG가 Aurora에 trace INSERT + CH에 anomaly_trace_link INSERT 할 때
--   두 쓰기는 원자적이지 않음. Aurora 먼저 성공 보장 후 CH 쓰기.
--   CH 실패 시 재시도 큐 or 경고 알림.
--
-- [10] Kafka 토픽 파티션 수 전제
--   events_raw_kafka는 kafka_num_consumers=2 설정.
--   이것이 효과를 보려면 events.raw 토픽이 파티션 2개 이상 필요.
--   MSK / Strimzi 쪽에서 파티션 수 설정 확인.
--   전제:
--     events.raw:             >= 2 partitions (처리량 확보)
--     cdc.aurora.prod_change: 1 partition 이상 (CDC는 순서 보장 중요, 보통 1)
--     cdc.aurora.trace:       1 partition 이상
--     cdc.aurora.issue:       1 partition 이상
--   주의: CDC 토픽은 파티션 키를 PK로 설정해야 순서 보장 (Debezium 기본)
--
-- [11] At-least-once 전달 보장과 중복 가능성
--   CH Kafka engine의 메시지 처리:
--     1) Kafka에서 consume
--     2) MV trigger → target 테이블 INSERT
--     3) INSERT 성공 → offset commit
--   2와 3 사이 crash 시 offset 미commit → 재시작 후 같은 메시지 재처리
--   결과:
--     - events_raw (MergeTree): 중복 row 가능. 분석 집계에 미미한 오차.
--     - CDC 테이블 (ReplacingMergeTree): _ts_ms 기준으로 자동 dedup. 영향 없음.
--   보완:
--     - 엄격한 dedup 필요하면 어플리케이션 레이어에서 event_id 기반 검증
--     - MVP 규모에선 허용 가능한 오차로 판단
--
-- [12] 스키마 변경 시 MV 재생성 절차
--   ALTER TABLE로 컬럼 추가 후 MV에도 반영 필요한 경우:
--     1) DETACH TABLE <target_table>  -- MV 연쇄 비활성화
--     2) ALTER TABLE <target_table> ADD COLUMN ...
--     3) DROP VIEW <mv_name>
--     4) CREATE MATERIALIZED VIEW <mv_name> TO <target_table> AS SELECT ... (새 컬럼 포함)
--     5) ATTACH TABLE <target_table>
--   주의: MV 재생성 시 과거 데이터 재처리 안 됨. 필요 시 POPULATE 옵션 또는
--        수동 INSERT INTO <target_table> SELECT ... FROM <source>.
--
-- [13] Aurora ↔ CH 타입 매핑 불일치 (문서화)
--   events_raw.retry_count:
--     Aurora: SMALLINT (최대 32767) → CH: UInt8 (최대 255)
--     실무 retry 횟수는 한 자리라 사실상 문제 없음.
--     만약 255 초과 가능성이 생기면 UInt16으로 ALTER 필요.
--   severity (issue):
--     Aurora: SMALLINT (1~5 CHECK) → CH: UInt8 (1~5 사용)
--     범위 정합 ✅
--   기타 카운터 (linked_event_count 등):
--     Aurora: INTEGER → CH: UInt32 (42억)
--     실무 영향 없음 ✅
--
-- [14] TTL 만료 후 과거 쿼리 재집계 전략
--   events_agg_1m TTL: 3개월. 3개월 초과 쿼리 시 데이터 없음.
--   그러나 events_raw는 1년 보존 → 재집계 가능.
--   쿼리 레이어 분기 권장:
--     IF 조회 범위 <= 3개월: events_agg_1m 사용 (빠름)
--     ELSE: events_raw에서 직접 집계 (느리지만 가능)
--   또는 대시보드에서 "3개월 이내 기간만 집계 차트 제공" 명시.
--
-- [15] anomaly_trace_link TTL 조정 기준
--   현재 6개월. 이 기간 후 detection_id ↔ trace_id 매핑 사라짐.
--   영향:
--     - 최근 6개월 탐지 품질 분석 가능 (anomaly 전환율 등)
--     - 6개월 이전 trace의 근거 anomaly 추적 불가
--   trace를 장기 추적하려면 (예: 연 단위 품질 분석) TTL을 1년 이상으로 연장.
--   판단 기준: "언제까지의 탐지 품질을 측정하고 싶은가"
--   v0.1 튜닝 주기가 3~6개월이면 현재 설정 충분.
--
-- [16] Strimzi SMT null 처리 정책
--   Debezium SMT unwrap 설정:
--     transforms.unwrap.drop.tombstones: false
--     transforms.unwrap.delete.handling.mode: rewrite
--   drop.tombstones=false: DELETE 이벤트도 메시지로 전달 (tombstone 직전 rewrite된 payload)
--   delete.handling.mode=rewrite: 'd' op 메시지에 삭제 직전 값 포함
--   → CH에서 _deleted=1 로우 생성 가능
--   
--   주의사항:
--     - NULL 필드는 JSON에서 "field": null로 직렬화 (Debezium 기본)
--     - SMT가 null 필드를 drop하지 않도록 설정 확인
--     - CH Kafka engine은 JSONEachRow 형식에서 "field": null을 NULL로 파싱
--   감사 쿼리 예시:
--     SELECT count() FROM prod_change_cdc_kafka
--     WHERE change_id IS NULL  -- NULL 파싱 실패 확인용
--
-- [17] 초기 데이터 적재 전략 (snapshot mode)
--   Aurora에 이미 데이터가 있는 상태에서 CDC 시작 시:
--     
--   옵션 A: Debezium snapshot.mode=initial (기본)
--     - Aurora 테이블 전체를 'r' op 메시지로 전송
--     - 대용량일 경우 Kafka/CH 부하 주의
--     - 데모/MVP 규모에선 무난
--
--   옵션 B: snapshot 비활성화 + 수동 backfill
--     - snapshot.mode=never
--     - INSERT INTO <ch_table> SELECT ... FROM postgres(...) 수동 실행
--     - CDC는 incremental만 처리
--     - 대용량 운영 시 권장
--
--   옵션 C: 데모 환경에선 snapshot 없이 새 데이터만
--     - snapshot.mode=schema_only
--     - 기존 데이터는 복제 안 함, 새 변경만 추적
--     - 데모 시작 후 생성되는 데이터만 trace 가능
--
--   현재 MVP 권장: 옵션 A (initial snapshot). 규모 작아 문제 없음.
--   표준 규모 전환 시 옵션 B로 재평가.
--
-- ============================================================================
-- END OF CLICKHOUSE DDL v2.1
-- ============================================================================
