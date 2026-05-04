# M2-1 ClickHouse Ingestion Alignment

## Purpose

M2-1C는 M2-1B에서 정리한 Aurora publication/connector safe-column contract가 Kafka topic naming과 ClickHouse ingestion mapping까지 유지되는지 정리한다.

이 작업은 contract/alignment step이다. ClickHouse를 실행하지 않고, Kafka topic을 만들지 않고, Debezium connector를 배포하지 않고, AWS나 Aurora에 연결하지 않는다.

## M2-1C Scope

대상 vertical slice:

```text
public.prod_change -> public.trace -> safe public.issue CDC -> Kafka -> ClickHouse
```

확인 범위:

- Debezium topic routing
- Debezium SMT output shape
- ClickHouse Kafka engine table topic binding
- ClickHouse materialized view field mapping
- M2-1 safe-column contract 유지

제외 범위:

- event analytics
- `events_raw`
- `events_agg_1m`
- anomaly detection
- `anomaly_detection_results`
- `anomaly_trace_link`
- evidence/run/run_state_log CDC
- production rollout

## Topic Naming Contract

Connector file:

- `infra/connectors/debezium/m2_1_traceability_connector.json`

Connector source topic prefix:

- `topic.prefix = aurora-productops-m2-1`

RegexRouter:

- `transforms.route.regex = aurora-productops-m2-1\.public\.(.+)`
- `transforms.route.replacement = cdc.aurora.$1`

Final Kafka topics:

| Source object | Debezium source topic | Final topic |
| --- | --- | --- |
| `public.prod_change` | `aurora-productops-m2-1.public.prod_change` | `cdc.aurora.prod_change` |
| `public.trace` | `aurora-productops-m2-1.public.trace` | `cdc.aurora.trace` |
| `public.issue` | `aurora-productops-m2-1.public.issue` | `cdc.aurora.issue` |

ClickHouse Kafka engine tables consume exactly those final topics:

- `prod_change_cdc_kafka` -> `cdc.aurora.prod_change`
- `trace_cdc_kafka` -> `cdc.aurora.trace`
- `issue_cdc_kafka` -> `cdc.aurora.issue`

## Debezium SMT Output Shape

The connector uses `io.debezium.transforms.ExtractNewRecordState`.

Required SMT settings:

- `transforms.unwrap.add.fields = op,ts_ms`
- `transforms.unwrap.add.fields.prefix = ""`
- `transforms.unwrap.delete.handling.mode = rewrite`

This means ClickHouse expects flat JSON values with:

- `op`
- `ts_ms`
- allowed source columns

ClickHouse must not expect:

- `__op`
- `__ts_ms`
- Debezium envelope fields as target data columns

## ClickHouse Ingestion Mapping

ClickHouse DDL:

- `infra/sql/clickhouse/m2_1_traceability_cdc.sql`

Each Kafka engine table includes explicit columns. Materialized views also explicitly list columns and do not use `SELECT *`.

Required MV mapping:

- `op AS _op`
- `ts_ms AS _ts_ms`
- `if(op = 'd', 1, 0) AS _deleted`
- `now64(3) AS _ingested_at`

DELETE handling:

- Debezium rewrite mode emits a flat row with `op = 'd'`.
- ClickHouse target tables keep that row as a CDC version.
- `_deleted = 1` marks deleted source rows.
- Query paths must filter `_deleted = 0` unless intentionally auditing deletes.

## Safe-Column Boundary

M2-1 ClickHouse ingestion must preserve the M2-1B safe-column contract.

Excluded from `prod_change_cdc` and `prod_change_cdc_kafka`:

- `payload`
- `actor`
- `rule_scope`

Excluded from `issue_cdc` and `issue_cdc_kafka`:

- `title`
- `body`
- `payload`
- `reporter`

Rationale:

- `prod_change.payload` is raw opaque JSONB and not structured operational evidence.
- `prod_change.actor` may contain names or emails.
- issue raw fields may contain customer or reporter PII.
- ClickHouse should receive structured operational reasoning columns, not raw payload dumps.

## Static Validation

Run:

```bash
python3 scripts/validate_m2_1_cdc_contract.py
npm run validate:m2-1:cdc
python3 -m py_compile scripts/validate_m2_1_cdc_contract.py
git diff --check
git status --short
```

The validator checks:

- connector publication mode stays pre-created/disabled
- connector source table list is exactly `public.prod_change`, `public.trace`, `public.issue`
- connector `column.include.list` excludes forbidden raw fields
- connector routing produces `cdc.aurora.*` topics
- ClickHouse Kafka engine topics match connector route output
- ClickHouse Kafka engine tables expect `op` and `ts_ms`
- ClickHouse DDL does not use `__op` or `__ts_ms`
- materialized views do not use `SELECT *`
- materialized views map `op`, `ts_ms`, and delete rewrite state explicitly
- post-SMT fixture JSON files match ClickHouse Kafka engine columns
- fixture JSON files exclude raw payload/PII fields
- legacy CDC artifacts carry a warning that they are not M2-1 contract sources

Runtime dry-validation readiness is documented separately:

- `docs/m2_1_cdc_runtime_dry_validation_kr.md`
- `docs/m2_1_controlled_runtime_dry_run_kr.md`

Important caveat: the current `*_delete.json` fixtures are ClickHouse parsing target-shape fixtures. They are not proof that runtime Debezium DELETE messages include all non-key columns under `REPLICA IDENTITY DEFAULT`; that must be verified in a controlled runtime dry run before changing replica identity or ingestion behavior.

## Not Production Rollout

This document and the related SQL/JSON/Python artifacts do not mean M2 has been applied.

Not performed:

- no SQL applied
- no ClickHouse server started
- no Kafka topic created
- no Debezium connector deployed
- no replication slot created
- no AWS resource touched

M2-1C only closes static naming and ingestion mapping drift before a future controlled execution step.
