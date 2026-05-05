# M2-1 CDC Runtime Dry Validation

## Purpose

M2-1D adds dry-validation artifacts for the runtime CDC message shape before any real Aurora, Debezium, Kafka, or ClickHouse execution.

Static SQL/JSON validation is necessary but not sufficient. Runtime CDC can still drift through Debezium serialization details, SMT behavior, connector config changes, topic routing, DELETE rewrite handling, and ClickHouse JSONEachRow parsing. M2-1D fixes the expected post-SMT message shape as local fixtures so future dry runs can compare real messages without turning the pipeline into a raw payload dump.

This is not production rollout.

## Expected Post-SMT JSON Shape

The M2-1 connector uses `ExtractNewRecordState`, so ClickHouse should receive flat JSON values.

Expected fields:

- `op`
- `ts_ms`
- safe source columns allowed by the M2-1B publication and connector contract

Forbidden fields:

- `__op`
- `__ts_ms`
- Debezium envelope fields such as `before`, `after`, `source`, or transaction metadata as data columns
- `prod_change.payload`
- `prod_change.actor`
- `issue.title`
- `issue.body`
- `issue.payload`
- `issue.reporter`

Expected operation values:

- create fixture: `op = "c"`
- delete fixture: `op = "d"`

## Fixture Purpose

Fixtures live in:

- `fixtures/m2_1_cdc/prod_change_create.json`
- `fixtures/m2_1_cdc/prod_change_delete.json`
- `fixtures/m2_1_cdc/trace_create.json`
- `fixtures/m2_1_cdc/trace_delete.json`
- `fixtures/m2_1_cdc/issue_create.json`
- `fixtures/m2_1_cdc/issue_delete.json`

Each fixture represents the expected Debezium post-SMT value that the ClickHouse Kafka engine table would parse with `JSONEachRow`.

The validator checks that each fixture:

- is valid JSON
- is a JSON object
- includes `op` and `ts_ms`
- does not include `__op` or `__ts_ms`
- does not include forbidden raw fields
- does not include ClickHouse target-only fields such as `_op`, `_ts_ms`, `_deleted`, `_ingested_at`
- matches the corresponding ClickHouse Kafka engine table columns
- uses `op = "c"` for create and `op = "d"` for delete

## Inspecting Real Kafka Messages Later

When a future controlled dry run consumes Kafka messages, inspect only enough fields to verify shape and safety.

Recommended approach:

- consume a small bounded number of messages from each M2-1 topic
- redact or avoid printing values from free-text fields
- inspect keys/field names first
- assert forbidden fields are absent
- assert `op` and `ts_ms` are present
- assert no `__op` or `__ts_ms` fields appear
- store only sanitized validation output, not raw message bodies

Expected topics:

- `cdc.aurora.prod_change`
- `cdc.aurora.trace`
- `cdc.aurora.issue`

Do not capture full raw payloads into docs, logs, issue comments, screenshots, tracing annotations, or CI artifacts.

## ClickHouse JSONEachRow Parsing Checks

Before enabling long-running consumption, validate parsing with bounded sample input.

Check:

- `prod_change_cdc_kafka` accepts `prod_change_create.json` and `prod_change_delete.json`
- `trace_cdc_kafka` accepts `trace_create.json` and `trace_delete.json`
- `issue_cdc_kafka` accepts `issue_create.json` and `issue_delete.json`
- `op` maps to `_op`
- `ts_ms` maps to `_ts_ms`
- `op = "d"` maps to `_deleted = 1`
- `op = "c"` maps to `_deleted = 0`

The M2-1 SQL currently uses explicit MV column lists. A future dry run should verify that omitted or unexpected fields do not silently weaken the contract.

## DELETE Rewrite Verification

The connector contract requires:

- `transforms.unwrap.delete.handling.mode = rewrite`
- `transforms.unwrap.drop.tombstones = false`
- `transforms.unwrap.add.fields = op,ts_ms`
- `transforms.unwrap.add.fields.prefix = ""`

Dry validation should verify:

- DELETE messages are flat JSON objects
- DELETE messages have `op = "d"`
- DELETE messages include the primary key
- ClickHouse MV writes `_deleted = 1`
- query patterns filter `_deleted = 0` for current-state reads

## Delete Fixture Runtime Caveat

The current `*_delete.json` delete fixtures are parsing target-shape fixtures for ClickHouse `JSONEachRow` and materialized-view mapping.

They are not proof that runtime Debezium DELETE messages include all non-key columns.

Because M2-1 publication SQL intentionally uses `REPLICA IDENTITY DEFAULT`, a future controlled runtime dry run may observe PK-only or partial-row DELETE messages after SMT rewrite. That runtime behavior must be verified before treating delete fixtures as evidence of end-to-end DELETE completeness.

If runtime DELETE messages are PK-only or partial-row, do not switch to `REPLICA IDENTITY FULL` by default. First evaluate:

- source-side safe CDC/outbox table
- ClickHouse Kafka table nullability/default handling for delete-specific rows
- delete-specific ingestion strategy that only requires primary keys and CDC metadata
- explicit current-state query rules using `_deleted`

`REPLICA IDENTITY FULL` can increase WAL volume and may make raw source fields relevant to replication behavior. It should be a reviewed exception, not the default fix.

## REPLICA IDENTITY DEFAULT Verification

M2-1 publication SQL intentionally uses primary-key based `REPLICA IDENTITY DEFAULT`, not `FULL`.

Dry validation must confirm:

- `prod_change.change_id` appears in delete messages
- `trace.trace_id` appears in delete messages
- `issue.issue_id` appears in delete messages
- DELETE rewrite behavior remains compatible with ClickHouse CDC target needs

If a future runtime proves that non-key values are required for deletes, do not switch raw tables to `REPLICA IDENTITY FULL` by default. Re-evaluate source-side safe CDC/outbox tables first because `FULL` can increase WAL volume and privacy exposure.

## Safe Dry-Run Order

The controlled runtime dry-run runbook is:

- `docs/m2_1_controlled_runtime_dry_run_kr.md`
- `docs/m2_1_runtime_dry_run_evidence_report_template_kr.md`

Recommended future order:

1. Run static validation locally.
2. Review `m2_1_traceability_publication.sql` and connector JSON.
3. Run Aurora prerequisite check SQL in a controlled environment.
4. Apply publication only after review.
5. Start Debezium connector in a bounded dry-run environment.
6. Consume a small bounded message sample from each M2-1 topic.
7. Compare message keys against fixture keys.
8. Validate ClickHouse JSONEachRow parsing with sample data.
9. Validate MV `_op`, `_ts_ms`, and `_deleted` mapping.
10. Stop connector and confirm slot lag/cleanup plan.

## Rollback And Cleanup Checklist

For future runtime dry runs, define cleanup before starting.

Checklist:

- connector stopped
- connector status captured without secrets
- replication slot state checked
- unused dry-run slot dropped only through an approved runbook
- test topics deleted only if they were created for the dry run
- ClickHouse test tables detached or dropped only in isolated dry-run environment
- no raw payload artifacts retained
- validation summary records only field names, counts, and safe internal IDs

## Validation Commands

Run locally:

```bash
python3 scripts/validate_m2_1_cdc_contract.py
npm run validate:m2-1:cdc
npm run validate:m2-1:fixtures
python3 -m py_compile scripts/validate_m2_1_cdc_contract.py
git diff --check
git status --short
```

## Final Statement

This document and the fixture files do not mean M2 has been applied.
