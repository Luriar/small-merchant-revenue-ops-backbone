# M2-1 Aurora CDC Prerequisite Alignment

## Purpose

M2-1B는 M2-1A에서 만든 ClickHouse DDL entrypoint 앞단의 Aurora CDC boundary를 정리한다.

이 프로젝트의 본체는 단순한 CDC 파이프가 아니라 release-to-issue traceability 기반 AI knowledge operations backbone이다. 따라서 Kafka와 ClickHouse에 도착하는 데이터는 raw payload 덤프가 아니라, 운영 추론과 근거 연결에 필요한 구조화된 safe column이어야 한다.

M2-1B 역시 production rollout이 아니다. 이 문서와 SQL/connector/script는 contract/alignment artifact이며 M2가 적용되었다는 뜻이 아니다.

## Why This Slice

M2-1은 다음 최소 vertical slice에서 시작한다.

```text
prod_change -> trace -> safe issue CDC -> ClickHouse
```

이 순서가 가장 작은 이유:

- `prod_change`는 release/flag/rule change marker source다.
- `trace`는 MVP 물리 모델에서 `primary_issue_id` 중심으로 change와 issue를 연결한다.
- `issue`는 raw PII를 제외한 safe projection만 ClickHouse read model에 필요하다.
- event analytics, evidence CDC, run reliability read model은 M2-1에서 검증해야 할 최소 경로가 아니다.

## Aurora Logical Replication Prerequisites

사전 확인 SQL:

- `infra/sql/aurora/m2_1_logical_replication_prereq_check.sql`

확인 항목:

- `rds.logical_replication`
- `wal_level`
- `max_replication_slots`
- `max_wal_senders`
- current database name
- `m2_1_traceability_pub` publication 존재 여부
- publication table membership
- publication column list
- `m2_1_traceability_slot` replication slot 상태
- `public.prod_change`, `public.trace`, `public.issue` primary key와 replica identity
- `prod_change.payload` 또는 `prod_change.actor`가 publication column list에 들어갔는지 여부

이 SQL은 read-only다. replication slot을 만들지 않고, table이나 publication을 변경하지 않는다.

## Publication And Connector Filtering

Publication SQL:

- `infra/sql/aurora/m2_1_traceability_publication.sql`

Connector config:

- `infra/connectors/debezium/m2_1_traceability_connector.json`

M2-1은 publication과 connector 양쪽에서 필터를 둔다.

Publication filtering이 필요한 이유:

- Aurora에서 Kafka로 나가기 전 첫 boundary다.
- PostgreSQL 15+ publication column list를 사용하면 raw column이 logical replication stream에 포함되는 범위를 줄일 수 있다.
- `FOR ALL TABLES`나 `FOR TABLES IN SCHEMA`는 M2-1의 명시적 traceability contract와 맞지 않는다.

Connector filtering이 필요한 이유:

- Debezium config 자체가 Kafka event value의 허용 column contract를 문서화한다.
- publication이 잘못 변경되거나 재생성되더라도 connector의 `column.include.list`가 두 번째 방어선이 된다.
- 이 프로젝트에서는 금지 목록보다 허용 목록이 더 적합하다. 운영 근거로 허용되는 column을 명시해야 downstream reasoning이 추적 가능하다.

## Safe Column Contract

`public.prod_change` 허용 column:

- `change_id`
- `chgt_cd`
- `title`
- `target_service`
- `target_component`
- `variation`
- `cohort`
- `source`
- `occurred_at`
- `received_at`
- `created_at`
- `updated_at`

`public.trace` 허용 column:

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
- `created_at`
- `updated_at`

`public.issue` 허용 column:

- `issue_id`
- `external_id`
- `source`
- `issue_family`
- `severity`
- `status`
- `keywords`
- `affected_variation`
- `occurred_at`
- `received_at`
- `resolved_at`
- `created_at`
- `updated_at`

## Why prod_change.payload And prod_change.actor Are Excluded

`prod_change.payload`는 raw JSONB다. upstream system의 원문 구조가 섞일 수 있고, traceability reasoning에 필요한 구조화된 필드인지 보장할 수 없다.

`prod_change.actor`는 이메일이나 이름처럼 개인 식별 가능 값이 들어올 수 있다고 Aurora DDL 주석에 명시되어 있다.

따라서 두 column은 ClickHouse target에서만 무시하는 것으로 부족하다. Debezium/Kafka event value에 들어가지 않도록 publication column list와 connector `column.include.list` 양쪽에서 제외한다.

## Evidence-Safe Operational Columns

ClickHouse read model은 운영 추론을 빠르게 조회하기 위한 분석/read layer다. 이 layer에 raw opaque payload를 넣으면 다음 문제가 생긴다.

- downstream query가 어떤 근거 column을 사용했는지 추적하기 어렵다.
- raw payload가 장기 보존 또는 재처리 경로에 섞일 수 있다.
- 민감 정보나 고용량 필드가 operational evidence처럼 오해될 수 있다.
- trace/evidence 생성 원칙이 구조화된 판단 근거가 아니라 raw dump 보존으로 흐를 수 있다.

M2-1에서는 change marker, trace link, issue status/family/severity 같은 명시적 operational column만 ClickHouse로 보낸다.

## Known Limitation

Publication column list는 완전한 security boundary가 아니다.

- DB superuser나 migration owner가 publication을 바꾸면 노출 범위가 달라질 수 있다.
- connector 설정이 drift되면 Kafka event value가 바뀔 수 있다.
- replica identity와 DELETE behavior는 실제 CDC dry validation으로 확인해야 한다.

장기적으로 더 강한 통제는 source-side safe CDC table 또는 outbox table이다. 즉, raw `prod_change`/`issue`에서 직접 CDC하지 않고, 애플리케이션 또는 DB layer가 safe projection table을 만들고 그 table만 CDC하는 방식이 더 명확한 security boundary다.

## Legacy Artifact Warning

아래 legacy artifact는 과거 CDC 설계 참고 자료로 남긴다.

- `sources/aurora_logical_replication.sql`
- `sources/strimzi_connectors.yaml`

이 파일들은 M2-1 contract source가 아니다. M2-1에 적용하지 않는다.

M2-1에서 사용할 contract source:

- `infra/sql/aurora/m2_1_traceability_publication.sql`
- `infra/connectors/debezium/m2_1_traceability_connector.json`

legacy 파일에는 separate publication, old publication name, `REPLICA IDENTITY FULL`, 또는 `prod_change.payload`/`prod_change.actor` boundary가 증명되지 않은 connector 설정이 남아 있을 수 있다. future execution은 반드시 M2-1 전용 publication SQL과 connector JSON을 기준으로 검증해야 한다.

## Validation Checklist

Static validation:

```bash
python3 scripts/validate_m2_1_cdc_contract.py
npm run validate:m2-1:cdc
git diff --check
git status --short
```

Aurora prerequisite check, not executed in this task:

```bash
psql "$AURORA_PSQL_TARGET" -f infra/sql/aurora/m2_1_logical_replication_prereq_check.sql
```

Publication apply candidate, not executed in this task:

```bash
psql "$AURORA_PSQL_TARGET" -f infra/sql/aurora/m2_1_traceability_publication.sql
```

Connector contract checks:

- `publication.name` is `m2_1_traceability_pub`
- `publication.autocreate.mode` is `disabled`
- `slot.name` is `m2_1_traceability_slot`
- `table.include.list` is exactly `public.prod_change,public.trace,public.issue`
- `column.include.list` is present
- `public.prod_change.payload` is absent
- `public.prod_change.actor` is absent
- `FOR ALL TABLES` is absent from publication SQL
- `FOR TABLES IN SCHEMA` is absent from publication SQL

## Final Statement

This document and SQL do not mean M2 has been applied.
