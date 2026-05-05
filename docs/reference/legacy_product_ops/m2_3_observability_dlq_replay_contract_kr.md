# M2-3 Observability / DLQ / Replay Integration Contract

## Purpose

M2-3는 M2 CDC/read-model path의 observability, DLQ, replay, reprocess 통합 contract를 정의한다.

이 contract의 목적은 failure가 발생했을 때 다음을 evidence-safe 방식으로 설명하는 것이다.

- 무엇이 실패했는가
- 어느 layer에서 실패했는가
- 어떤 bounded retry/replay/reprocess가 승인되었는가
- 어떤 safe evidence가 남았는가
- 어떤 raw field를 절대 보관하지 않았는가

This is not production rollout.

## Non-Goals

M2-3는 runtime deployment가 아니다.

M2-3에서 하지 않는 일:

- AWS 연결
- SQL apply
- Kafka topic 생성
- replication slot 생성
- Debezium 배포
- ClickHouse 시작
- raw message replay 구현
- raw payload, full message body, PII 보관
- M2-1 CDC contract 변경

## Relationship To M2-1 And M2-2

M2-1은 minimum CDC vertical slice의 static/dry-validation contract를 닫았다.

M2-2는 future controlled runtime dry run execution package를 만들었다.

M2-3는 그 위에 failure visibility, DLQ metadata, replay/reprocess approval contract를 정의한다.

M2-1 vertical slice는 그대로 유지된다.

```text
public.prod_change
-> public.trace
-> safe public.issue CDC
-> Kafka
-> ClickHouse
```

M2-3는 다음 runtime-only risk를 운영적으로 관찰하고 복구하기 위한 contract다.

- actual Debezium serialization
- Kafka message shape
- ClickHouse `JSONEachRow` parsing
- DELETE behavior under `REPLICA IDENTITY DEFAULT`
- slot lag / WAL pressure
- cleanup evidence

## Failure Classification

| Failure type | Detection signal | Severity | Stop / retry / replay decision | Safe evidence to record | Forbidden evidence to avoid | Likely owner |
| --- | --- | --- | --- | --- | --- | --- |
| Source publication drift | Publication membership or column list differs from `m2_1_traceability_pub` contract | Critical | Stop immediately; no replay until publication is corrected | publication name, table membership, allowed column names, drifted field-name set | raw payloads, full message bodies, DB URLs | Database owner |
| Connector config drift | Connector differs from `m2_1_traceability_connector.json` | Critical | Stop connector rollout; do not start replay | connector config field-name summary, topic routing summary, `publication.autocreate.mode` value | secrets, connector credentials, endpoint values | Platform owner |
| Connector runtime failure | Connector task failed state or repeated restart | High | Stop if unbounded; retry only with bounded owner-approved window | connector name, task id, failure class, first/last seen timestamps | full logs containing raw values, tokens | Platform owner |
| Forbidden field leakage | Forbidden field names detected in publication, connector, Kafka keys, or ClickHouse path | Critical | Stop immediately; no retry/replay; open incident | forbidden field names detected, source layer, yes/no leakage result | forbidden field values, screenshots exposing values | Security + data owner |
| Kafka topic drift | Final topic name differs from `cdc.aurora.prod_change`, `cdc.aurora.trace`, `cdc.aurora.issue` | High | Stop consumer ingestion; fix routing before replay | observed topic names, expected topic names | message bodies | Platform owner |
| Kafka lag / consumer lag | Consumer lag exceeds bounded dry-run threshold or no-message window breached | Medium/High | Retry only if bounded; stop on growth trend | topic, partition count summary, lag bucket, time window | payload values, broker endpoints | Platform owner |
| ClickHouse `JSONEachRow` parse failure | Kafka engine parse errors or rejected rows | High | Stop ingestion for affected topic; DLQ metadata only | parser error class, missing fields, unexpected fields, field-name set | full rejected row, raw message body | Analytics owner |
| ClickHouse MV mapping failure | MV insert failure or target column mismatch | High | Stop MV path; replay only after mapping correction | MV name, target table, column-name mismatch | raw source row, full Kafka value | Analytics owner |
| DELETE rewrite mismatch | DELETE message does not produce expected `op = d` / `_deleted` mapping | High | Stop DELETE replay; inspect under bounded dry run | primary-key presence result, `op` presence, `_deleted` mapping result | deleted row values, full DELETE message | Platform + analytics owner |
| `REPLICA IDENTITY DEFAULT` mismatch | Runtime DELETE is PK-only or partial-row and target path expects non-key values | High | Do not switch to `REPLICA IDENTITY FULL` as quick fix; evaluate safe CDC/outbox or delete-specific strategy | source table, primary-key field names, missing non-key field names | full row before image, raw values | Database + architecture owner |
| Slot lag / WAL pressure | Replication slot lag or WAL growth exceeds agreed threshold | Critical | Stop connector or cleanup; no replay until pressure is resolved | slot name, lag summary, trend window, cleanup status | DB endpoints, credentials | Database owner |
| Cleanup failure | Connector, dry-run slot, temporary topic/table, or samples not cleaned | High | Stop next run; complete cleanup first | cleanup checklist status, owner sign-off, remaining resource names without endpoints | raw samples, connection strings | Run owner |
| Evidence capture violation | Raw payloads, full message bodies, secrets, or PII appear in evidence | Critical | Stop evidence publication; redact by approved process; incident review | violation type, document path, remediation status | the exposed raw values themselves | Security + run owner |

## Observability Signals

The detailed signal catalog is in `docs/m2_3_observability_signal_catalog_kr.md`.

M2-3 minimum signal groups:

- Debezium connector status
- connector task failed state
- publication membership drift
- slot lag / WAL pressure
- Kafka topic message count / no-message window
- consumer lag
- ClickHouse Kafka engine parse errors
- MV insert failure
- forbidden field leakage detection
- replay attempt count
- cleanup completion
- evidence report completion

Signals must record field names, counts, status values, timestamps, and owner decisions. Signals must not record raw payloads, full message bodies, secrets, endpoints, account IDs, DB URLs, or PII.

## DLQ Contract

The DLQ contract is metadata-only. See `docs/m2_3_dlq_message_contract_kr.md`.

DLQ records may describe the failure and the safe field-name set. DLQ records must not store the raw failed message.

Allowed DLQ evidence includes:

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

Forbidden DLQ evidence includes:

- raw payloads
- full message bodies
- secrets
- issue title/body/payload/reporter values
- prod_change payload/actor values
- endpoints
- DB URLs
- account IDs
- tokens
- passwords
- raw connection strings

## Replay / Reprocess Contract

Replay and reprocess are described in `docs/m2_3_replay_reprocess_contract_kr.md`.

Rules:

- replay is not raw message replay by default
- reprocess should prefer safe metadata and source re-read where possible
- retry/reprocess creates a new run row and does not mutate the original run
- replay preserves idempotency
- replay has a bounded scope, owner, reason, target, attempt count, approval record, and cleanup status
- replay stops if forbidden field leakage appears
- replay must not broaden publication scope
- replay must not switch to `REPLICA IDENTITY FULL` as a quick fix
- replay output updates evidence-safe status only

## Run / Recovery State Model Alignment

This contract follows the existing run/retry/reprocess direction:

- retry or reprocess never rewinds the original run
- retry or reprocess creates a new run row
- the new run records the reason, source failure reference, attempt count, owner, target, bounded scope, and cleanup result
- append-only evidence remains evidence-safe
- recovery status explains operational reasoning without preserving raw failed messages

The contract does not introduce `retried` as a run status.

## Topic And Field-Safety Rules

Allowed source tables:

- `public.prod_change`
- `public.trace`
- `public.issue`

Allowed final Kafka topics:

- `cdc.aurora.prod_change`
- `cdc.aurora.trace`
- `cdc.aurora.issue`

Expected post-SMT shape:

- flat JSON
- `op`
- `ts_ms`
- no `__op`
- no `__ts_ms`
- no Debezium envelope fields as ClickHouse data columns

Forbidden fields:

- `prod_change.payload`
- `prod_change.actor`
- `issue.title`
- `issue.body`
- `issue.payload`
- `issue.reporter`

Field-name sets may be recorded for detection. Field values for forbidden fields must not be recorded.

## Stop Conditions

Stop immediately if any of these occur:

- forbidden field leakage appears in publication, connector, Kafka message keys, DLQ metadata, evidence, or ClickHouse path
- publication contains `FOR ALL TABLES`
- publication contains `FOR TABLES IN SCHEMA`
- connector uses `publication.autocreate.mode=all_tables`
- connector emits `__op` or `__ts_ms`
- Debezium envelope fields appear as ClickHouse data columns
- topic names drift from `cdc.aurora.*`
- unbounded connector execution or replay is required
- slot lag / WAL pressure grows unexpectedly
- anyone proposes `REPLICA IDENTITY FULL` as a quick fix
- evidence capture includes raw payloads, full message bodies, secrets, or PII
- cleanup evidence cannot be completed

## Not Production Rollout

M2-3 is a contract and template step only.

It does not deploy observability, create DLQ topics, create replay workers, modify Aurora DDL, modify OpenAPI, apply ClickHouse SQL, or run infrastructure commands.

## Next-Step Options After M2-3

Possible next steps:

- M2-4: DLQ table/topic DDL and safe metadata storage design
- M2-4: replay/reprocess worker API contract and idempotency checks
- M2-4: observability dashboard/query contract for CDC/read-model health
- M2-4: safe outbox table design for stronger source-side privacy control

Recommended next step:

- M2-4 should start with DLQ table/topic DDL and safe metadata storage design.

Reason:

- M2-1 closed CDC path safety.
- M2-2 packaged future runtime dry-run execution.
- M2-3 defines how failures and recovery decisions should be classified.
- The next concrete step is to define the durable metadata shape for failures without storing raw messages.

M2-4 safe metadata storage design reference:

- `docs/m2_4_dlq_safe_metadata_storage_design_kr.md`
- `docs/m2_4_kafka_dlq_topic_contract_kr.md`
- `infra/sql/aurora/m2_4_dlq_replay_metadata.sql`
- `infra/sql/clickhouse/m2_4_dlq_replay_read_model.sql`
- `ops/m2_4_dlq_safe_metadata_storage/`
