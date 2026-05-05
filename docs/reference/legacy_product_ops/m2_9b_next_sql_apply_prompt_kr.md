# M2-9B Next SQL Apply Prompt

## Status

This prompt is gated by the M2-9A GO record. It authorizes a single, narrowly-scoped SQL apply task against the confirmed dev target `product-ops-dev-aurora`. It does **not** authorize runtime dry-run, production access, or any other live operation. M2-9C controlled runtime dry-run is a separate task that must be entered only after M2-9B post-apply schema verification passes.

## Re-Entry Inputs Already Recorded

The following inputs are already filed under M2-9A GO and do not need to be re-supplied:

- target environment: dev (`product-ops-dev-aurora`)
- migration role: `app_migration_dev_role`
- region: `ap-northeast-2`
- cleanup owner: Yoon Joonho
- rollback owner: Yoon Joonho
- evidence_report_ref: `docs/runtime_evidence/m2_9_dev_dry_run_20260504.md`
- bounded sample-count: 1 (M2-9C scope, not M2-9B)
- bounded time-window: 10 minutes (M2-9C scope, not M2-9B)
- pre-apply schema state: all three CDC replay metadata tables missing, 0 of 10 indexes, 0 of 15 constraints
- reviewed rollback procedure pointer: `docs/m2_9a_rollback_plan_kr.md`
- verification query set: read-only existence checks for tables, indexes, constraints, and identity

## Re-Entry Inputs The M2-9B Operator Must Add

Before SQL apply executes, the operator must add:

1. **Executable rollback script**, stored at a repo path (suggested: `infra/sql/aurora/m2_4_dlq_replay_metadata_rollback.sql`). Must drop the three CDC replay metadata tables in dependency order, plus indexes and constraints created by `infra/sql/aurora/m2_4_dlq_replay_metadata.sql`. Reviewed and approved by Yoon Joonho before apply.
2. **Apply transcript destination**, sanitized, no DB URL / hostname / port / credential / token / password / raw payload.
3. **Post-apply verification transcript destination**, sanitized.

## Allowed In M2-9B

- read-only Phase 0 baseline regression rerun
- read-only schema re-inspection before apply (same query set as M2-9A)
- transactional apply of `infra/sql/aurora/m2_4_dlq_replay_metadata.sql` against `product-ops-dev-aurora` only, by `app_migration_dev_role`
- post-apply read-only verification using the M2-9A verification query set
- sanitized evidence capture
- creation of M2-9B evidence docs (`docs/m2_9b_sql_apply_evidence_kr.md`, `docs/m2_9b_schema_verification_report_kr.md`, `docs/m2_9b_sql_apply_decision_record_kr.md`)
- creation of `scripts/validate_m2_9b_sql_apply_evidence.py` and `package.json` script `validate:m2-9b:sql-apply-evidence`

## Forbidden In M2-9B

- production DB access
- runtime dry-run
- any unbounded Kafka, Debezium, or ClickHouse execution
- Terraform changes
- deployment changes
- writing DB URLs, hostnames, ports, IAM ARNs, AWS account identifiers, credentials, tokens, or passwords into evidence
- writing raw payload, full message body, issue raw value, or prod_change payload/actor value into evidence
- writing stack traces, SQL error internals, or persistence internals into API-safe outputs or evidence
- broad rewrites of `apps/api/src/server.js`, `apps/api/src/auth.js`, `apps/api/src/error-response.js`, or main OpenAPI
- removing the M2-4 DLQ replay metadata SQL `PROPOSAL ONLY - DO NOT APPLY AUTOMATICALLY` marker outside an explicit reviewed convention; if the marker is left in place, document the explicit M2-9B approval that authorizes applying this proposal-marked file to the dev target

## Phase 0 Baseline (Mandatory Before Apply)

Run and require all green:

- `npm run test:m2-8o:aurora-repository`
- `npm run validate:m2-8o:aurora-repository`
- `npm run validate:m2-8n:post-merge-closure`
- `npm run validate:m2-8m:openapi-merge`
- `npm run validate:m2:global-safety`
- `npm run validate:m2-9a:live-db-preflight`
- `npm run validate:m2-9a:live-db-go`
- `git diff --check`

If any baseline check fails, **stop**. Do not apply SQL.

## Pre-Apply Re-Inspection

Re-run the M2-9A read-only inspection query set against `product-ops-dev-aurora`. Confirm the dev target still shows the expected pre-apply state (all three tables missing, 0 of 10 indexes, 0 of 15 constraints). If the inspection shows partial application, **stop**, raise to the rollback owner, and treat the next action as recovery, not apply.

## Apply Procedure

1. Wrap the apply in a transaction. The M2-4 SQL uses `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`, so re-apply is idempotent at the table/index level. Constraints are inline within table creation.
2. Stop on first error. Do not retry blindly.
3. Capture sanitized output only. Do not capture connection strings, hostnames, ports, credentials, tokens, raw payload, or full message bodies.
4. Do not modify the SQL file content.

## Post-Apply Verification (Mandatory)

Re-run the M2-9A inspection query set. Verify:

- `public.cdc_failure` exists
- `public.cdc_replay_request` exists
- `public.cdc_failure_state_log` exists
- All 10 expected indexes are present
- All 15 expected constraints are present
- `current_database`, `current_user`, and `current_schema` match the dev target
- Server version is unchanged from the M2-9A safe summary

If any of the above fails, **stop**, escalate to the rollback owner, and execute the reviewed rollback script under explicit approval. Do not enter M2-9C.

## Failure Handling

If apply fails partially or fully:

1. Stop immediately. Do not retry.
2. Document the exact safe failure summary in `docs/m2_9b_sql_apply_failed_repair_prompt_kr.md`. Do not include connection strings, raw error internals, or stack traces.
3. Escalate to the rollback owner.
4. If the rollback owner approves rollback execution, run the executable rollback script from step 1 of "Re-Entry Inputs The M2-9B Operator Must Add". Document the rollback evidence with the same sanitization rules.
5. Do not enter M2-9C until M2-9B is re-attempted and passes cleanly.

## Cross-References

- M2-9A GO master: `docs/m2_9a_live_db_preflight_go_evidence_kr.md`
- M2-9A GO target identity: `docs/m2_9a_live_db_target_evidence_kr.md`
- M2-9A schema inspection report: `docs/m2_9a_schema_inspection_report_kr.md`
- M2-9A GO/NO-GO decision: `docs/m2_9a_sql_apply_go_no_go_decision_kr.md`
- M2-9A runtime dry-run bounds (for M2-9C): `docs/m2_9a_runtime_dry_run_bounds_kr.md`
- M2-9A rollback plan: `docs/m2_9a_rollback_plan_kr.md`
- M2-4 SQL: `infra/sql/aurora/m2_4_dlq_replay_metadata.sql`
- M2-8O Aurora repository (consumes the schema): `apps/api/src/cdc-recovery/cdc-recovery-aurora-repository.js`
