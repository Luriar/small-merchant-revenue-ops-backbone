# M2-2 Controlled Runtime Dry Run Execution Package

## Purpose

M2-2 creates a repo-local execution package for a future bounded runtime dry run. It turns the M2-1 static contract, fixtures, runbook, and evidence template into a set of safe command templates, checklists, and evidence capture forms.

This is not production rollout.

## Relationship To M2-1 Closure

M2-1 closed the static/dry-validation contract for:

```text
public.prod_change -> public.trace -> safe public.issue CDC -> Kafka -> ClickHouse
```

M2-2 does not change that contract. It prepares the package a future operator would use to execute the controlled runtime dry run described in `docs/m2_1_controlled_runtime_dry_run_kr.md`.

## Package Contents

Directory:

- `ops/m2_2_runtime_dry_run`

Contents:

- command templates in `commands/`
- evidence templates in `evidence/`
- checklists in `checklists/`
- package README

## Safe Execution Boundaries

These templates must not be used to bypass approval.

Do not connect to AWS.
Do not apply SQL.
Do not create Kafka topics.
Do not create replication slots.
Do not deploy Debezium.
Do not start ClickHouse.

Future execution must be bounded by max duration, bounded sample count, assigned owner, assigned cleanup owner, and stop conditions.

## Command Templates

Command templates are echo-only by default and include commented future examples.

- `01_aurora_prereq_check.sh.template`: future Aurora prerequisite check
- `02_publication_review_apply.sh.template`: future publication review/apply gate
- `03_debezium_connector_bounded_start.sh.template`: future bounded connector start
- `04_kafka_bounded_sample_inspection.sh.template`: future bounded Kafka field-name inspection
- `05_clickhouse_fixture_parse_check.sh.template`: future fixture and sample parsing check
- `06_delete_rewrite_check.sh.template`: future DELETE rewrite check
- `07_cleanup_and_slot_check.sh.template`: future cleanup and slot check

Each template says:

- `TEMPLATE ONLY - DO NOT RUN DIRECTLY`
- do not print raw values
- do not record raw payloads or full message bodies
- use bounded sample or max duration limits

## Evidence Recording Rules

Record safe evidence:

- field-name sets
- sampled message counts
- topic names
- publication table membership
- allowed column names
- yes/no leakage result
- `op`/`ts_ms` presence result
- DELETE primary-key presence result
- `_deleted` mapping result
- slot lag summary
- cleanup status

Do not record:

- raw payloads
- full message bodies
- secrets
- DB URLs
- endpoints
- account IDs
- SecretString
- tokens
- passwords
- raw connection strings
- issue title/body/payload/reporter values
- prod_change payload/actor values
- screenshots or logs exposing raw values

## Cleanup Rules

Cleanup must be planned before future execution.

Required cleanup evidence:

- connector stopped
- replication slot checked
- slot lag summary recorded
- dry-run-only slot removed if applicable
- dry-run-only topics removed if applicable
- ClickHouse dry-run tables cleaned if applicable
- temporary sample files removed
- no raw payload/full message body retention
- cleanup owner sign-off

## Future Runtime Execution Still Required

This package does not prove runtime behavior by itself.

Still runtime-only:

- actual Debezium serialization
- Kafka message field-name sets
- ClickHouse `JSONEachRow` runtime parsing
- DELETE shape under `REPLICA IDENTITY DEFAULT`
- slot lag / WAL pressure behavior
- cleanup completion evidence

## Validation

Run local static checks only:

```bash
python3 scripts/validate_m2_2_runtime_package.py
npm run validate:m2-2:runtime-package
python3 -m py_compile scripts/validate_m2_2_runtime_package.py
git diff --check
git status --short
```

## Final Statement

This package is not production rollout. It is a safe preparation package for a future controlled runtime dry run.
