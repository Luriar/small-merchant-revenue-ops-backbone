# M2-9B Schema Verification Report

## Decision

Schema verification decision: **passed**.

All three M2-4 CDC replay metadata tables exist on `product-ops-dev-aurora` after M2-9B SQL apply, all ten named indexes exist, and all fifteen named check/unique constraints exist. Verification was performed by the human operator using read-only queries only. Claude did not connect to the DB.

## Verification Boundary

- Verification was read-only: yes. No DDL, no DML, no writes, no SQL apply.
- No raw data was selected. Existence checks only.
- No production DB was accessed.
- No DB URL, hostname, port, IAM ARN, AWS account ID, credential, token, or password is recorded in this report.

## Identity (Sanitized, Post-Apply)

- current_database safe label: productops
- current_user safe label: postgres or app_migration_dev_role (depending on operator execution context)
- current_schema safe label: public
- server/version safe summary: PostgreSQL 15.x, consistent with M2-9A's recorded `PostgreSQL 15.17`. No version drift was reported.

## Pre-Apply Re-Inspection

Pre-apply re-inspection (read-only, identical to M2-9A query set) returned:

- public.cdc_failure existence: missing
- public.cdc_replay_request existence: missing
- public.cdc_failure_state_log existence: missing
- index existence: 0 of 10 expected indexes present
- constraint existence (named, after the corrected query — see "Verification Query Correction" below): 0 of 15 expected named constraints present

This state matches the M2-9A read-only inspection record and confirmed the dev target was clean before apply.

## Post-Apply Verification

### Table Existence Summary

| Table | Status |
| --- | --- |
| `public.cdc_failure` | present |
| `public.cdc_replay_request` | present |
| `public.cdc_failure_state_log` | present |

Expected: 3. Observed: 3. Missing: 0.

### Index Existence Summary

| Index | Status |
| --- | --- |
| `idx_cdc_failure_status` | present |
| `idx_cdc_failure_type` | present |
| `idx_cdc_failure_source_topic` | present |
| `idx_cdc_failure_owner` | present |
| `idx_cdc_failure_first_seen_at` | present |
| `idx_cdc_replay_failure` | present |
| `idx_cdc_replay_status` | present |
| `idx_cdc_replay_owner` | present |
| `idx_cdc_replay_idempotency_key` | present |
| `idx_cdc_failure_state_log_failure` | present |

Expected: 10. Observed: 10. Missing: 0.

### Constraint Existence Summary

#### Named Check And Unique Constraints (15 of 15)

| Constraint | Type | On Table | Status |
| --- | --- | --- | --- |
| `chk_cdc_failure_op` | CHECK | `public.cdc_failure` | present |
| `chk_cdc_failure_attempt_count` | CHECK | `public.cdc_failure` | present |
| `chk_cdc_failure_status` | CHECK | `public.cdc_failure` | present |
| `chk_cdc_failure_primary_key_object` | CHECK | `public.cdc_failure` | present |
| `chk_cdc_failure_observed_fields_array` | CHECK | `public.cdc_failure` | present |
| `chk_cdc_failure_missing_fields_array` | CHECK | `public.cdc_failure` | present |
| `chk_cdc_failure_unexpected_fields_array` | CHECK | `public.cdc_failure` | present |
| `chk_cdc_failure_forbidden_fields_array` | CHECK | `public.cdc_failure` | present |
| `chk_cdc_replay_action` | CHECK | `public.cdc_replay_request` | present |
| `chk_cdc_replay_attempt_count` | CHECK | `public.cdc_replay_request` | present |
| `chk_cdc_replay_status` | CHECK | `public.cdc_replay_request` | present |
| `chk_cdc_replay_cleanup_status` | CHECK | `public.cdc_replay_request` | present |
| `chk_cdc_replay_bounded_scope_object` | CHECK | `public.cdc_replay_request` | present |
| `uq_cdc_replay_idempotency_key` | UNIQUE | `public.cdc_replay_request` | present |
| `chk_cdc_failure_state_safe_metadata_object` | CHECK | `public.cdc_failure_state_log` | present |

Expected named constraints: 15. Observed named constraints: 15. Missing: 0.

#### Total Constraints Observed (24)

The post-apply verification observed **24 total constraints** on the three tables. The breakdown:

- 15 named check + unique constraints (listed above) — expected
- 3 implicit primary-key constraints (one per table) — expected
- 6 implicit foreign-key constraints — expected:
  - `public.cdc_failure (source_run_id) → public.run`
  - `public.cdc_replay_request (failure_id) → public.cdc_failure`
  - `public.cdc_replay_request (source_run_id) → public.run`
  - `public.cdc_replay_request (new_run_id) → public.run`
  - `public.cdc_failure_state_log (failure_id) → public.cdc_failure`
  - `public.cdc_failure_state_log (replay_request_id) → public.cdc_replay_request`

All 9 implicit constraints are expected from the table definitions in `infra/sql/aurora/m2_4_dlq_replay_metadata.sql`. They are not flagged as extra unexpected objects.

## Verification Query Correction

The constraint-existence verification query distributed in M2-9A (and used in the M2-9B prompt) filtered by:

```sql
WHERE conrelid::regclass::text IN (
  'public.cdc_failure', 'public.cdc_replay_request', 'public.cdc_failure_state_log'
)
```

This filter returned **0 rows on the dev target** even though the constraints exist. PostgreSQL's `regclass::text` cast resolves the table identifier under the current `search_path`. When `public` is in `search_path` (the default), `conrelid::regclass::text` returns the **unqualified** table name (e.g. `cdc_failure`), not the schema-qualified form. The fully-qualified `IN` list therefore matched nothing.

The corrected verification query that the operator used and that future M2-9B / M2-9C verifications must use:

```sql
SELECT conrelid::regclass AS on_table, conname, contype
FROM pg_constraint
WHERE conrelid::regclass::text IN (
    'public.cdc_failure', 'cdc_failure',
    'public.cdc_replay_request', 'cdc_replay_request',
    'public.cdc_failure_state_log', 'cdc_failure_state_log'
  )
  AND conname IN (
    'chk_cdc_failure_op','chk_cdc_failure_attempt_count','chk_cdc_failure_status',
    'chk_cdc_failure_primary_key_object','chk_cdc_failure_observed_fields_array',
    'chk_cdc_failure_missing_fields_array','chk_cdc_failure_unexpected_fields_array',
    'chk_cdc_failure_forbidden_fields_array',
    'chk_cdc_replay_action','chk_cdc_replay_attempt_count','chk_cdc_replay_status',
    'chk_cdc_replay_cleanup_status','chk_cdc_replay_bounded_scope_object',
    'uq_cdc_replay_idempotency_key',
    'chk_cdc_failure_state_safe_metadata_object'
  )
ORDER BY on_table, conname;
```

A schema-agnostic alternative (no search_path dependency) is to filter on `pg_namespace` directly:

```sql
SELECT n.nspname AS schema, c.relname AS on_table, p.conname, p.contype
FROM pg_constraint p
JOIN pg_class c ON c.oid = p.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('cdc_failure', 'cdc_replay_request', 'cdc_failure_state_log')
  AND p.conname IN ( ... 15 names ... )
ORDER BY c.relname, p.conname;
```

The schema-agnostic form is recommended for future M2-9C and any later live-DB verification, since it does not depend on the operator's `search_path`.

## Missing And Extra Objects

- Missing objects: **none**
- Extra unexpected objects: **none**. The 9 implicit primary-key and foreign-key constraints accounting for the 24-vs-15 difference are expected from the SQL file and are documented above.

## Repository Assumption Parity

The schema observed on `product-ops-dev-aurora` matches the assumptions consumed by `apps/api/src/cdc-recovery/cdc-recovery-aurora-repository.js`:

- table names match the SQL builders in the repository
- column types match the parameter types passed to the injected DB client
- the unique constraint `uq_cdc_replay_idempotency_key` exists, supporting the idempotency conflict path tested in M2-8O
- the BIGSERIAL primary key on `cdc_failure_state_log` supports the append-only state log pattern tested in M2-8O

No repository code changes are required after M2-9B.

## Boundary Confirmations

- Verification was read-only.
- No raw data was selected. Existence checks only.
- SQL apply has been performed (in this M2-9B task only).
- Runtime dry-run has not been executed.
- No production DB was used.
- No DB URL, hostname, port, IAM ARN, AWS account ID, credential, token, password, raw payload, full message body, issue raw value, prod_change payload/actor value, stack trace, SQL error internal, or persistence internal is recorded in this report.

## Cross-References

- Apply evidence: `docs/m2_9b_sql_apply_evidence_kr.md`
- Decision record: `docs/m2_9b_sql_apply_decision_record_kr.md`
- Rollback SQL: `infra/sql/aurora/m2_4_dlq_replay_metadata_rollback.sql`
- Rollback SQL review: `docs/m2_9b_rollback_sql_review_kr.md`
- M2-9A GO master: `docs/m2_9a_live_db_preflight_go_evidence_kr.md`
- M2-9A schema inspection report: `docs/m2_9a_schema_inspection_report_kr.md`
- M2-9C next-task prompt: `docs/m2_9c_next_controlled_runtime_dry_run_prompt_kr.md`
