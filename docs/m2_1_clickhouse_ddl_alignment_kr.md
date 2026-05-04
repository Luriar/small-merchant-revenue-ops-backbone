# M2-1 ClickHouse DDL Alignment

## Purpose

이 문서는 M2-1A 작업의 산출물로, 가장 작은 M2-1 vertical slice에 필요한 ClickHouse DDL 적용 경로를 정리한다.

M2-1의 목적은 Aurora 운영 정본을 유지하면서 `prod_change`, `trace`, safe `issue` CDC를 ClickHouse read-model 준비물로 분리하는 것이다. 이 문서와 SQL은 준비 artifact이며 실제 ClickHouse, CDC, MSK, EKS, Airflow, Argo, Karpenter, Strimzi를 실행하거나 적용하지 않는다.

**This document and SQL do not mean M2 has been applied.**

## M2-1 Scope

포함 범위:

- Aurora `prod_change` CDC target
- Aurora `trace` CDC target
- Aurora `issue` safe CDC target
- 위 3개 CDC topic을 읽는 ClickHouse Kafka engine table
- 위 3개 Kafka engine table에서 target table로 적재하는 materialized view

제외 범위:

- OpenAPI 변경
- backend/frontend runtime code 변경
- Aurora baseline DDL 변경
- Terraform apply
- ClickHouse/CDC/MSK/EKS/Airflow/Argo/Karpenter/Strimzi 실행
- event analytics, anomaly detection, reliability read model

## Source Files Inspected

- `sources/clickhouse_ddl_v2_1.sql`
- `sources/aurora_ddl_v2.sql`
- `sources/aurora_logical_replication.sql`
- `sources/strimzi_connectors.yaml`
- `infra/sql/clickhouse/README.md`
- `docs/m2_readiness_check_kr.md`

## Tables Included

새 entrypoint:

- `infra/sql/clickhouse/m2_1_traceability_cdc.sql`

포함된 ClickHouse target tables:

- `prod_change_cdc`
- `trace_cdc`
- `issue_cdc`

포함된 ClickHouse Kafka engine tables:

- `prod_change_cdc_kafka`
- `trace_cdc_kafka`
- `issue_cdc_kafka`

포함된 materialized views:

- `mv_prod_change_cdc_to_target`
- `mv_trace_cdc_to_target`
- `mv_issue_cdc_to_target`

## Tables Deferred

이번 M2-1A SQL entrypoint에 넣지 않은 기존 broader M2 asset:

- `events_raw`
- `events_raw_kafka`
- `events_agg_1m`
- `mv_events_raw_to_target`
- `mv_events_agg_1m`
- `anomaly_detection_results`
- `anomaly_trace_link`

보류 이유:

- `event_intake` CDC와 direct event ingestion path 중 어느 쪽을 사용할지 아직 결정하지 않았다.
- `events_raw.payload`, `user_id`, `session_id`, `request_id`의 PII/safe projection 기준이 M2-1 범위를 넘는다.
- anomaly detection과 `anomaly_trace_link`는 Airflow/후행 분석 job이 필요하며, M2-1 첫 vertical slice가 아니다.
- `evidence`, `run`, `run_state_log`는 M2-1에서 Aurora read path를 유지한다.

## Aurora -> ClickHouse Column Alignment Notes

### prod_change

Aurora source columns inspected:

- `change_id`
- `chgt_cd`
- `title`
- `target_service`
- `target_component`
- `variation`
- `cohort`
- `rule_scope`
- `payload`
- `actor`
- `source`
- `occurred_at`
- `received_at`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`

M2-1 ClickHouse projection:

- includes `change_id`, `chgt_cd`, `title`, `target_service`, `target_component`, `variation`, `cohort`, `source`, timestamps
- excludes `created_by`, `updated_by`
- excludes `rule_scope`, `payload`, `actor` from the ClickHouse target in this smallest slice

Alignment note:

- 기존 `sources/clickhouse_ddl_v2_1.sql`의 `prod_change_cdc`는 `rule_scope`, `payload`, `actor`까지 포함한다.
- 이번 M2-1 entrypoint는 `docs/m2_readiness_check_kr.md`의 raw operational fact 목록에 맞춰 더 작은 projection을 사용한다.
- 현재 `sources/strimzi_connectors.yaml`의 prod_change connector는 full table CDC이다. ClickHouse Kafka engine에는 `input_format_skip_unknown_fields = 1`을 명시해 target에서 제외한 field를 소비 중 무시하도록 준비했다.
- 다만 Kafka topic 자체에서 `payload`/`actor`를 원천 제외하려면 M2-1 적용 전 connector column filter를 별도로 검토해야 한다.

### trace

Aurora source columns inspected:

- `trace_id`
- `change_id`
- `primary_issue_id`
- `status`
- `confidence`
- `anomaly_window_start`
- `anomaly_window_end`
- `anomaly_type`
- `anomaly_metric`
- `anomaly_detail`
- `linked_event_count`
- `linked_issue_count`
- `evidence_count`
- `generated_by_run_id`
- `version`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`

M2-1 ClickHouse projection:

- includes trace identity, change/primary issue links, status/confidence, anomaly fields, counters, generated run id, timestamps
- excludes `version`, `created_by`, `updated_by`

Alignment note:

- `trace.primary_issue_id` 중심 연결 원칙과 정합한다.
- Aurora `version`은 ClickHouse `ReplacingMergeTree(_ts_ms)`가 Debezium timestamp 기반으로 최신 row를 정리하므로 target projection에는 포함하지 않았다.
- `anomaly_detail`은 Aurora `JSONB`이고 ClickHouse source DDL과 동일하게 `String`으로 둔다. 실제 Debezium JSONB 직렬화 형태는 CDC dry validation에서 확인해야 한다.

### issue

Aurora source columns inspected:

- `issue_id`
- `external_id`
- `source`
- `title`
- `body`
- `issue_family`
- `severity`
- `status`
- `keywords`
- `affected_variation`
- `payload`
- `reporter`
- `occurred_at`
- `received_at`
- `resolved_at`
- `version`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`

M2-1 ClickHouse projection:

- includes `issue_id`, `external_id`, `source`, `issue_family`, `severity`, `status`, `keywords`, `affected_variation`, timestamps
- excludes `title`, `body`, `payload`, `reporter`
- excludes `version`, `created_by`, `updated_by`

Alignment note:

- `sources/aurora_logical_replication.sql`의 `aurora_issue_pub`는 publication column filter로 raw issue PII field를 제외한다.
- `sources/strimzi_connectors.yaml`의 issue connector도 `column.exclude.list`로 `body`, `payload`, `reporter`, `title`을 제외한다.
- ClickHouse `issue_cdc`와 `issue_cdc_kafka`에도 해당 raw PII field가 없다.
- Aurora issue `severity SMALLINT CHECK (1~5)`는 ClickHouse `UInt8`로 충분하다.
- Aurora issue `keywords TEXT[]`는 ClickHouse `Array(String)`로 정렬된다. 실제 Debezium JSON array 형태는 CDC dry validation에서 확인해야 한다.

## PII Exclusion Notes

M2-1 SQL에서 issue raw PII field는 제외했다.

- excluded: `issue.title`
- excluded: `issue.body`
- excluded: `issue.payload`
- excluded: `issue.reporter`

End-to-end issue PII 방어선:

- Aurora publication column filter
- Debezium connector `column.exclude.list`
- ClickHouse Kafka engine table schema
- ClickHouse target table schema
- validation query against `system.columns`

남는 PII 주의점:

- `prod_change.actor`는 이메일/이름 가능성이 있어 이번 ClickHouse target projection에서 제외했다.
- `prod_change.payload`는 raw JSONB 성격이라 이번 ClickHouse target projection에서 제외했다.
- 현재 prod_change connector는 full table CDC이므로, SQL만으로 Kafka topic 단계의 `payload`/`actor` 유입을 막지는 못한다. 적용 전 connector column filter 여부를 별도 M2-1 작업으로 결정해야 한다.
- `trace.anomaly_detail`은 JSONB 기반 문자열이다. raw payload나 identifier가 들어가지 않는다는 생성 규칙을 유지해야 한다.

## Open Questions

1. `prod_change` connector도 M2-1 적용 전에 `column.exclude.list` 또는 publication column filter로 `payload`/`actor`/`rule_scope`를 제외할지 결정해야 한다.
2. `trace.anomaly_detail` Debezium JSONB 출력이 ClickHouse `String`으로 안정적으로 들어오는지 dry validation이 필요하다.
3. `issue.keywords TEXT[]`가 ClickHouse `Array(String)`으로 정상 파싱되는지 dry validation이 필요하다.
4. Kafka engine table의 `input_format_skip_unknown_fields = 1` 설정을 운영 표준으로 둘지, connector에서 source column을 더 엄격히 줄일지 결정해야 한다.
5. M2-2에서 event path를 Aurora `event_intake` CDC로 할지, direct `events.raw` ingestion으로 할지 결정해야 한다.

## Validation Checklist

Static validation:

- `git diff --check`
- `git status --short`
- changed files only review

Pre-apply review checklist:

- SQL에 실제 endpoint, account id, token, password, SecretString, DB URL이 없는지 확인한다.
- `issue_cdc`와 `issue_cdc_kafka`에 `title`, `body`, `payload`, `reporter`가 없는지 확인한다.
- broader M2 tables가 `m2_1_traceability_cdc.sql`에 포함되지 않았는지 확인한다.
- `events_raw`, `events_agg_1m`, `anomaly_detection_results`, `anomaly_trace_link`는 deferred로만 남아 있는지 확인한다.

Post-apply validation candidate, not executed in this task:

```sql
SELECT name
FROM system.columns
WHERE table = 'issue_cdc'
  AND name IN ('body', 'payload', 'reporter', 'title');
```

Expected result:

- 0 rows

CDC validation candidate, not executed in this task:

- `prod_change_cdc` row count
- `trace_cdc` row count
- `issue_cdc` row count
- latest `_ts_ms`
- `_deleted = 0` filter behavior
- duplicate handling through `ReplacingMergeTree(_ts_ms)`

## Final Statement

This document and SQL do not mean M2 has been applied.
