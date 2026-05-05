# M2-1 Closure Summary

## Purpose

M2-1은 최소 CDC vertical slice에 대한 static contract와 dry-validation readiness를 닫는 단계다.

이 문서는 M2-1A부터 M2-1F까지의 산출물을 한 곳에 묶어, future runtime dry run이 어떤 contract를 따라야 하는지 정리한다.

This is not production rollout.

## M2-1 Vertical Slice

```text
public.prod_change
-> public.trace
-> safe public.issue CDC
-> Kafka
-> ClickHouse
```

## Completed Steps

- M2-1A: ClickHouse CDC DDL alignment
- M2-1B: Aurora publication / Debezium connector safe boundary
- M2-1B Guardrail: legacy CDC artifact warning
- M2-1C: Kafka topic / SMT / ClickHouse ingestion mapping
- M2-1D: post-SMT fixtures / runtime dry-validation readiness
- M2-1D Delete Guardrail: `REPLICA IDENTITY DEFAULT` DELETE caveat
- M2-1E: controlled runtime dry-run runbook / stop conditions
- M2-1F: runtime dry-run evidence report template

## Files Created Or Modified

### Aurora SQL

- `infra/sql/aurora/m2_1_logical_replication_prereq_check.sql`
- `infra/sql/aurora/m2_1_traceability_publication.sql`

### Debezium Connector

- `infra/connectors/debezium/m2_1_traceability_connector.json`

### ClickHouse SQL

- `infra/sql/clickhouse/m2_1_traceability_cdc.sql`

### Fixtures

- `fixtures/m2_1_cdc/prod_change_create.json`
- `fixtures/m2_1_cdc/prod_change_delete.json`
- `fixtures/m2_1_cdc/trace_create.json`
- `fixtures/m2_1_cdc/trace_delete.json`
- `fixtures/m2_1_cdc/issue_create.json`
- `fixtures/m2_1_cdc/issue_delete.json`

### Docs

- `docs/m2_1_clickhouse_ddl_alignment_kr.md`
- `docs/m2_1_aurora_cdc_prereq_alignment_kr.md`
- `docs/m2_1_clickhouse_ingestion_alignment_kr.md`
- `docs/m2_1_cdc_runtime_dry_validation_kr.md`
- `docs/m2_1_controlled_runtime_dry_run_kr.md`
- `docs/m2_1_runtime_dry_run_evidence_report_template_kr.md`
- `docs/m2_1_closure_summary_kr.md`

### Validator / Scripts

- `scripts/validate_m2_1_cdc_contract.py`

### Package Scripts

- `package.json`
  - `validate:m2-1:cdc`
  - `validate:m2-1:fixtures`
  - `validate:m2-1:runbook`
  - `validate:m2-1:evidence`

### Legacy Warning Artifacts

- `sources/aurora_logical_replication.sql`
- `sources/strimzi_connectors.yaml`

These legacy artifacts are not M2-1 contract sources and must not be applied for M2-1.

## Final Contract Summary

Publication:

- `m2_1_traceability_pub`

Replication slot:

- `m2_1_traceability_slot`

Source tables:

- `public.prod_change`
- `public.trace`
- `public.issue`

Final Kafka topics:

- `cdc.aurora.prod_change`
- `cdc.aurora.trace`
- `cdc.aurora.issue`

Post-SMT shape:

- flat JSON
- `op`
- `ts_ms`
- no `__op`
- no `__ts_ms`
- no Debezium envelope fields as ClickHouse data columns

ClickHouse MV mapping:

- `op AS _op`
- `ts_ms AS _ts_ms`
- `if(op = 'd', 1, 0) AS _deleted`
- explicit column lists
- no `SELECT *`

DELETE handling:

- Debezium `delete.handling.mode = rewrite`
- DELETE message expected to use `op = "d"`
- ClickHouse target rows mark deletes with `_deleted = 1`
- current-state reads must filter `_deleted = 0`
- runtime DELETE shape under `REPLICA IDENTITY DEFAULT` remains runtime-only verification

Forbidden fields:

- `prod_change.payload`
- `prod_change.actor`
- `issue.title`
- `issue.body`
- `issue.payload`
- `issue.reporter`

## Validation Commands

```bash
python3 scripts/validate_m2_1_cdc_contract.py
npm run validate:m2-1:cdc
npm run validate:m2-1:fixtures
npm run validate:m2-1:runbook
npm run validate:m2-1:evidence
python3 -m py_compile scripts/validate_m2_1_cdc_contract.py
git diff --check
```

Current expected result:

- M2-1 validator: 98 PASS, 0 FAIL
- `git diff --check`: pass

## What Remains Runtime-Only

The following cannot be proven by static artifacts alone:

- actual Debezium runtime serialization
- Kafka sample inspection
- ClickHouse `JSONEachRow` runtime parsing
- DELETE behavior under `REPLICA IDENTITY DEFAULT`
- replication slot lag / WAL pressure observation
- cleanup completion evidence

These must be verified through a controlled runtime dry run using:

- `docs/m2_1_controlled_runtime_dry_run_kr.md`
- `docs/m2_1_runtime_dry_run_evidence_report_template_kr.md`

## Stop Conditions Preserved

Stop immediately if any of these occur:

- publication contains `FOR ALL TABLES`
- publication contains `FOR TABLES IN SCHEMA`
- forbidden fields appear in publication, connector, Kafka message keys, or ClickHouse CDC path
- connector uses `publication.autocreate.mode=all_tables`
- connector emits `__op` or `__ts_ms` instead of `op` and `ts_ms`
- Debezium envelope fields appear as ClickHouse data columns
- unbounded connector execution is required
- replication slot lag or WAL pressure grows unexpectedly
- anyone proposes `REPLICA IDENTITY FULL` as a quick fix without review

## Next-Step Options

Possible next steps:

- M2-2: controlled runtime dry-run execution package
- M2-2: observability / DLQ / replay integration
- M2-2: trace enrichment or safe outbox table design

Recommended next step:

- M2-2 should start with a controlled runtime dry-run execution package.

Reason:

- M2-1 has closed static and dry-validation readiness.
- The remaining unknowns are runtime-only: Debezium serialization, Kafka message shape, ClickHouse parsing, DELETE behavior, and slot/WAL operational behavior.
- Observability/DLQ/replay and outbox design will be better scoped after the bounded runtime dry run confirms the actual CDC behavior.

M2-2 execution package reference:

- `docs/m2_2_controlled_runtime_dry_run_execution_package_kr.md`
- `ops/m2_2_runtime_dry_run/`
