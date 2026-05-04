# M2-9B SQL Apply Decision Record

## Decision

The M2-9B SQL apply against `product-ops-dev-aurora` was **executed and succeeded**. The three M2-4 CDC replay metadata tables, all ten named indexes, and all fifteen named check/unique constraints are in place. Rollback was prepared before apply, was not needed, and was not executed.

## Inputs Considered

- **M2-9A GO record** (`docs/m2_9a_live_db_preflight_go_evidence_kr.md` and the four supporting GO docs) — eleven operator-supplied evidence groups all structurally complete and non-production-safe.
- **Phase 0 baseline regression** rerun on 2026-05-04: M2-9A GO 64/0, M2-9A NO-GO preflight 29/0, M2-8O tests 10/10, M2-8O validator 50/0, M2-8N 31/0, M2-8M 18/0, global safety 6/0, `git diff --check` exit 0.
- **Pre-apply re-inspection** confirmed the dev target still showed the expected pre-apply state (3 of 3 tables missing) before apply ran.
- **Reviewed rollback** at `docs/m2_9b_rollback_sql_review_kr.md` was prepared before apply, with `infra/sql/aurora/m2_4_dlq_replay_metadata_rollback.sql` in place.
- **Operator-run apply** by the human operator from the authorized dev path, using `psql -v ON_ERROR_STOP=1 --single-transaction -f infra/sql/aurora/m2_4_dlq_replay_metadata.sql`. Claude did not connect to the DB.
- **Post-apply verification** by the operator confirmed 3 of 3 tables, 10 of 10 named indexes, 15 of 15 named constraints, plus the 9 expected implicit primary-key and foreign-key constraints. No missing or extra objects.

## What Was Authorized And Performed

- Apply of `infra/sql/aurora/m2_4_dlq_replay_metadata.sql` against the confirmed dev target `product-ops-dev-aurora` only, by `app_migration_dev_role`, in a single transaction with stop-on-first-error.
- Read-only post-apply schema verification using the M2-9A inspection query set (with the constraint-query correction documented in `docs/m2_9b_schema_verification_report_kr.md`).
- Sanitized evidence capture into the three M2-9B docs.
- Creation of the M2-9B validator and `package.json` script `validate:m2-9b:sql-apply-evidence`.

## What Remains NO-GO

- production DB access — remains NO-GO
- M2-9C controlled runtime dry-run — remains NO-GO until M2-9B validator passes and the M2-9C task is explicitly entered with bounded sample-count and bounded time-window
- replay/reprocess workflow execution — remains NO-GO outside an approved M2-9C task
- unbounded Kafka, Debezium, or ClickHouse execution — remains NO-GO
- Terraform changes — remains NO-GO
- deployment changes — remains NO-GO
- broad rewrites of `apps/api/src/server.js`, `apps/api/src/auth.js`, `apps/api/src/error-response.js`, or main OpenAPI — remains NO-GO
- raw payload, full message body, issue raw value, or prod_change payload/actor exposure in any doc, log, error, or summary — remains NO-GO

## Boundary Confirmations

- SQL apply has been performed in M2-9B. Target was the confirmed dev target only.
- Runtime dry-run has not been executed.
- Rollback was prepared before apply. Rollback was not needed and was not executed.
- No production DB was used.
- No DB URL, hostname, port, IAM ARN, AWS account ID, credential, token, or password is recorded in any M2-9B doc.
- No raw payload, full message body, issue raw value, or prod_change payload/actor value is recorded.
- No stack trace, SQL error internal, or persistence internal is recorded.
- The forward SQL file `infra/sql/aurora/m2_4_dlq_replay_metadata.sql` was not modified; its `PROPOSAL ONLY` marker is preserved.
- The main OpenAPI remains in M2-8M merged state. The M2-5 proposal-only patch retains its proposal-only marker.
- M2-9A GO and NO-GO records were not modified.

## Cross-References

- Apply evidence: `docs/m2_9b_sql_apply_evidence_kr.md`
- Schema verification report: `docs/m2_9b_schema_verification_report_kr.md`
- Rollback SQL review: `docs/m2_9b_rollback_sql_review_kr.md`
- Rollback SQL: `infra/sql/aurora/m2_4_dlq_replay_metadata_rollback.sql`
- M2-9A GO master: `docs/m2_9a_live_db_preflight_go_evidence_kr.md`
- M2-9C next-task prompt: `docs/m2_9c_next_controlled_runtime_dry_run_prompt_kr.md`
