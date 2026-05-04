# M2-1 Controlled Runtime Dry Run

## Purpose

이 문서는 M2-1 controlled runtime dry run을 위한 실행 전용 runbook이다. 목적은 실제 production rollout 전에 Aurora publication, Debezium connector, Kafka topic, ClickHouse ingestion이 M2-1 safe-column contract를 지키는지 제한된 환경에서 검증하는 것이다.

M2-1 vertical slice:

```text
public.prod_change -> public.trace -> safe public.issue CDC -> Kafka -> ClickHouse
```

This is not production rollout.

## Non-Goals

이 runbook은 다음을 하지 않는다.

- production CDC 상시 실행
- unbounded connector execution
- raw payload dump 수집
- event analytics 구현
- anomaly detection 구현
- evidence/run/run_state_log CDC 확장
- OpenAPI/runtime API/frontend contract 변경
- `REPLICA IDENTITY FULL` 빠른 전환

## Environment Assumptions

dry run 환경은 다음 전제를 만족해야 한다.

- production과 분리된 controlled environment다.
- Aurora endpoint, account id, SecretString, token, password는 문서나 로그에 기록하지 않는다.
- connector 실행 시간과 sample consume 개수가 사전에 제한되어 있다.
- dry-run owner와 cleanup owner가 정해져 있다.
- replication slot lag와 WAL pressure를 관측할 수 있다.
- ClickHouse 검증은 isolated test database/table 또는 ephemeral 환경에서 수행한다.
- 모든 evidence record는 field name, count, status, safe internal ID 중심으로 남긴다.

## Preflight Checklist

실행 전 확인:

- `python3 scripts/validate_m2_1_cdc_contract.py`
- `npm run validate:m2-1:cdc`
- `npm run validate:m2-1:fixtures`
- `git diff --check`
- `git status --short`
- `docs/m2_1_cdc_runtime_dry_validation_kr.md`의 DELETE caveat 확인
- `fixtures/m2_1_cdc` fixture key와 ClickHouse Kafka table column 정합성 확인
- legacy CDC artifact가 M2-1 contract source가 아님을 확인

## Safe Execution Order

1. Run static validation locally.
2. Review this runbook and assign owner/observer/cleanup owner.
3. Run Aurora prerequisite check SQL.
4. Review publication SQL and decide whether to apply it.
5. Review Debezium connector JSON and decide whether to start a bounded dry run.
6. Start connector only with bounded duration and bounded message sampling.
7. Inspect Kafka message keys, not full message bodies.
8. Check forbidden field leakage.
9. Validate ClickHouse `JSONEachRow` parsing with fixtures and bounded real samples.
10. Verify DELETE rewrite behavior.
11. Verify `REPLICA IDENTITY DEFAULT` DELETE behavior.
12. Stop connector.
13. Confirm slot lag/WAL pressure.
14. Run rollback and cleanup checklist.
15. Record only safe evidence.

## Aurora Prerequisite Check

Use:

```bash
psql "$AURORA_PSQL_TARGET" -f infra/sql/aurora/m2_1_logical_replication_prereq_check.sql
```

Record:

- current database name
- logical replication readiness result
- publication existence/membership result
- publication column-list result
- replication slot status
- primary key and replica identity result

Do not record:

- DB URL
- password
- SecretString
- account ID
- raw row values

## Publication Review And Apply Decision Gate

Review:

- `infra/sql/aurora/m2_1_traceability_publication.sql`

Expected:

- publication name: `m2_1_traceability_pub`
- tables: `public.prod_change`, `public.trace`, `public.issue`
- no `FOR ALL TABLES`
- no `FOR TABLES IN SCHEMA`
- explicit column list per table
- `prod_change.payload` absent
- `prod_change.actor` absent
- issue `title`, `body`, `payload`, `reporter` absent
- `REPLICA IDENTITY DEFAULT` used intentionally

Apply only after review approval. This document does not apply SQL by itself.

## Debezium Connector Dry-Run Gate

Review:

- `infra/connectors/debezium/m2_1_traceability_connector.json`

Expected:

- publication: `m2_1_traceability_pub`
- slot: `m2_1_traceability_slot`
- `publication.autocreate.mode = disabled`
- table include list: `public.prod_change,public.trace,public.issue`
- `column.include.list` present
- final topic route: `cdc.aurora.*`
- `ExtractNewRecordState` unwrap
- `op` and `ts_ms`
- empty add-fields prefix
- `delete.handling.mode = rewrite`

Start the connector only if runtime duration, sample count, and cleanup owner are fixed.

## Bounded Kafka Sample Inspection

Bounded Kafka sample inspection means:

- consume only a small fixed number of messages per topic
- inspect message keys/field names first
- avoid printing full values
- do not store raw message bodies
- stop after the fixed sample count

Topics:

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

## Forbidden Field Leakage Check

Check message keys and connector config for forbidden fields.

Forbidden:

- `prod_change.payload`
- `prod_change.actor`
- `issue.title`
- `issue.body`
- `issue.payload`
- `issue.reporter`

Record only:

- topic name
- sampled message count
- observed field names
- forbidden field presence: yes/no
- `op`/`ts_ms` presence: yes/no

Do not record raw values.

## ClickHouse JSONEachRow Parsing Plan

Use fixtures first:

- `fixtures/m2_1_cdc/prod_change_create.json`
- `fixtures/m2_1_cdc/prod_change_delete.json`
- `fixtures/m2_1_cdc/trace_create.json`
- `fixtures/m2_1_cdc/trace_delete.json`
- `fixtures/m2_1_cdc/issue_create.json`
- `fixtures/m2_1_cdc/issue_delete.json`

Verify:

- Kafka engine table accepts fixture keys
- `op AS _op`
- `ts_ms AS _ts_ms`
- `op = 'd'` maps to `_deleted = 1`
- `op = 'c'` maps to `_deleted = 0`
- no `SELECT *` dependency

Then repeat with bounded real sample keys only. Do not persist full raw messages.

## DELETE Rewrite Verification

Verify:

- DELETE event emits flat JSON
- DELETE event uses `op = "d"`
- DELETE event includes primary key
- ClickHouse MV computes `_deleted = 1`
- current-state queries filter `_deleted = 0`

The existing `*_delete.json` fixtures are parsing target-shape fixtures. They are not proof that runtime Debezium DELETE messages include all non-key columns.

## REPLICA IDENTITY DEFAULT Verification

M2-1 intentionally uses `REPLICA IDENTITY DEFAULT`.

Verify:

- `prod_change.change_id` appears in DELETE messages
- `trace.trace_id` appears in DELETE messages
- `issue.issue_id` appears in DELETE messages
- PK-only or partial-row DELETE messages do not break the chosen ingestion strategy

If runtime DELETE shape is PK-only or partial-row, do not switch to `REPLICA IDENTITY FULL` by default. Evaluate:

- source-side safe CDC/outbox table
- nullability/default handling in ClickHouse Kafka engine tables
- delete-specific ingestion strategy
- `_deleted` query rules

## Stop Conditions

Stop immediately if publication contains FOR ALL TABLES.

Stop immediately if publication contains FOR TABLES IN SCHEMA.

Stop immediately if prod_change.payload or prod_change.actor appears in publication/connector/message keys.

Stop immediately if issue.title/body/payload/reporter appears in connector/message keys.

Stop immediately if connector uses publication.autocreate.mode=all_tables.

Stop immediately if connector emits __op/__ts_ms instead of op/ts_ms.

Stop immediately if Debezium envelope fields appear as ClickHouse data columns.

Stop immediately if unbounded connector execution is required.

Stop immediately if replication slot lag or WAL pressure grows unexpectedly.

Stop immediately if anyone proposes REPLICA IDENTITY FULL as a quick fix without review.

## Rollback And Cleanup Checklist

Rollback and cleanup checklist:

- stop Debezium connector
- verify connector stopped state
- check `m2_1_traceability_slot` active status
- check replication slot lag
- drop unused dry-run slot only through approved runbook
- delete dry-run-only Kafka topics only if they were explicitly created for the dry run
- detach/drop isolated ClickHouse dry-run tables only in non-production environment
- remove temporary local sample files
- verify no raw payloads or full message bodies were retained
- record cleanup completion with owner and timestamp

## Evidence To Record

Use the evidence report template:

- `docs/m2_1_runtime_dry_run_evidence_report_template_kr.md`

Record:

- validation command results
- publication name and table membership
- publication allowed column names
- connector name, publication name, slot name
- topic names
- message field-name sets
- sampled message counts
- forbidden field leakage result
- `op`/`ts_ms` presence result
- DELETE primary-key presence result
- `_deleted` mapping result
- replication slot lag summary
- cleanup completion

## Evidence NOT To Record

Do not record raw payloads.

Do not record full message bodies.

Do not record secrets, DB URLs, SecretString, tokens, account IDs, endpoints, passwords, or raw connection strings.

Do not record issue title, issue body, issue payload, issue reporter, prod_change payload, or prod_change actor values.

Do not record screenshots or logs that expose raw message values.

## Final Statement

This runbook is not production rollout. It is a controlled dry-run checklist for a future execution gate.
