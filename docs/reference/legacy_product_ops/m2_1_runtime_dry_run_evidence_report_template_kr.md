# M2-1 Runtime Dry Run Evidence Report Template

## Report Metadata

- Report ID:
- Dry-run date:
- Environment:
- Owner:
- Observer:
- Cleanup owner:
- Related runbook: `docs/m2_1_controlled_runtime_dry_run_kr.md`
- Related contract validator:
- Final status: pass | fail | blocked

This template is for future controlled dry-run evidence. It is not production rollout.

## Environment Summary Without Secrets

Record only non-sensitive environment context.

- Environment class: isolated dry run | dev | staging
- Aurora engine major version:
- Debezium connector artifact:
- ClickHouse DDL artifact:
- Kafka topic namespace/context:
- M2-1 slice: `public.prod_change`, `public.trace`, `public.issue`

Do not record actual DB URLs, endpoints, account IDs, SecretString, tokens, passwords, or raw connection strings.

## Validation Command Results

Record command status only.

| Command | Result | Notes |
| --- | --- | --- |
| `python3 scripts/validate_m2_1_cdc_contract.py` | pass/fail | |
| `npm run validate:m2-1:cdc` | pass/fail | |
| `npm run validate:m2-1:fixtures` | pass/fail | |
| `npm run validate:m2-1:runbook` | pass/fail | |
| `npm run validate:m2-1:evidence` | pass/fail | |
| `git diff --check` | pass/fail | |

## Aurora Prerequisite Check Result

Use `infra/sql/aurora/m2_1_logical_replication_prereq_check.sql`.

Record:

- current database name:
- `rds.logical_replication` result:
- `wal_level` result:
- `max_replication_slots` result:
- `max_wal_senders` result:
- primary key / replica identity result:
- replication slot status summary:

Do not record raw row values or connection details.

## Publication Membership And Allowed Columns

Publication:

- Expected publication: `m2_1_traceability_pub`
- Publication exists: yes/no
- Uses `FOR ALL TABLES`: yes/no
- Uses `FOR TABLES IN SCHEMA`: yes/no

Allowed column names:

| Table | Publication member | Allowed column names | Forbidden fields absent |
| --- | --- | --- | --- |
| `public.prod_change` | yes/no | field-name sets only | yes/no |
| `public.trace` | yes/no | field-name sets only | yes/no |
| `public.issue` | yes/no | field-name sets only | yes/no |

## Connector Config Summary

Record:

- Connector name:
- Publication name:
- Slot name:
- `publication.autocreate.mode`:
- `table.include.list`:
- `column.include.list` present: yes/no
- Topic route replacement:
- SMT unwrap type:
- `op`/`ts_ms` add fields present: yes/no
- `add.fields.prefix` empty: yes/no
- `delete.handling.mode`:

Do not record connector secrets or connection endpoints.

## Kafka Topic Sample Summary

Record sampled message counts and field-name sets only.

| Topic | Sampled message counts | Field-name sets observed | Full message body retained |
| --- | --- | --- | --- |
| `cdc.aurora.prod_change` | | | no |
| `cdc.aurora.trace` | | | no |
| `cdc.aurora.issue` | | | no |

## Forbidden Field Leakage Result

Record yes/no leakage result.

Forbidden fields:

- `prod_change.payload`
- `prod_change.actor`
- `issue.title`
- `issue.body`
- `issue.payload`
- `issue.reporter`

| Topic | Forbidden field present | Field names if present | Decision |
| --- | --- | --- | --- |
| `cdc.aurora.prod_change` | yes/no | names only | pass/fail |
| `cdc.aurora.trace` | yes/no | names only | pass/fail |
| `cdc.aurora.issue` | yes/no | names only | pass/fail |

## Post-SMT Field Shape Result

Record:

- flat JSON observed: yes/no
- `op` present: yes/no
- `ts_ms` present: yes/no
- `__op` absent: yes/no
- `__ts_ms` absent: yes/no
- Debezium envelope fields as data columns absent: yes/no

## ClickHouse JSONEachRow Parsing Result

Record:

- fixture parse result:
- bounded real-sample parse result:
- unknown field behavior:
- missing field behavior:
- ClickHouse Kafka table names:

Do not paste full message bodies.

## Materialized View Mapping Result

Record:

- `op AS _op`: pass/fail
- `ts_ms AS _ts_ms`: pass/fail
- `op = 'd'` maps to `_deleted = 1`: pass/fail
- `op = 'c'` maps to `_deleted = 0`: pass/fail
- `SELECT *` absent: pass/fail

## DELETE Rewrite Verification Result

Record:

- DELETE message observed: yes/no
- DELETE `op = "d"` observed: yes/no
- DELETE primary-key presence result:
- `_deleted` mapping result:
- DELETE non-key column completeness:
- Decision:

Note: `*_delete.json` fixtures are parsing target-shape fixtures, not proof of runtime DELETE completeness.

## REPLICA IDENTITY DEFAULT Runtime Observation

Record:

- `REPLICA IDENTITY DEFAULT` confirmed: yes/no
- `prod_change.change_id` present in DELETE: yes/no
- `trace.trace_id` present in DELETE: yes/no
- `issue.issue_id` present in DELETE: yes/no
- Runtime DELETE shape: full-row | partial-row | PK-only | not observed
- Follow-up required: yes/no

Do not switch to `REPLICA IDENTITY FULL` by default. If DELETE shape is insufficient, evaluate safe CDC/outbox table, nullability/default handling, or delete-specific ingestion strategy first.

## Slot Lag / WAL Pressure Summary

Record:

- Slot name:
- Slot active state:
- Slot lag summary:
- WAL pressure summary:
- Unexpected growth observed: yes/no
- Cleanup action required: yes/no

Do not record endpoints or credentials.

## Cleanup Completion Result

Record cleanup status:

- Connector stopped: yes/no
- Slot checked: yes/no
- Dry-run-only slot removed through approved runbook: yes/no/not applicable
- Dry-run-only topics removed: yes/no/not applicable
- ClickHouse dry-run tables cleaned: yes/no/not applicable
- Temporary sample files removed: yes/no/not applicable
- Raw payload/full message body retention check: pass/fail
- Cleanup owner sign-off:

## Final Pass/Fail Decision

Decision:

- pass | fail | blocked

Required pass criteria:

- static validation passed
- publication and connector match M2-1 contract
- forbidden field leakage result is no
- post-SMT shape is flat JSON with `op` and `ts_ms`
- ClickHouse JSONEachRow parsing is acceptable
- MV mapping is correct
- DELETE behavior is understood
- slot lag/WAL pressure is acceptable
- cleanup completed

## Open Risks / Follow-Up Actions

| Risk or follow-up | Owner | Due date | Blocking M2-1 execution |
| --- | --- | --- | --- |
| | | | yes/no |

## Evidence Safe To Record

Prefer:

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

## Evidence NOT To Record

Do not record raw payloads.

Do not record full message bodies.

Do not record secrets.

Do not record DB URLs.

Do not record SecretString.

Do not record tokens.

Do not record account IDs.

Do not record endpoints.

Do not record passwords.

Do not record raw connection strings.

Do not record issue title/body/payload/reporter values.

Do not record prod_change payload/actor values.

Do not record screenshots or logs exposing raw values.

## Final Statement

This evidence template does not mean M2 has been applied. It is a safe recording format for a future controlled runtime dry run.
