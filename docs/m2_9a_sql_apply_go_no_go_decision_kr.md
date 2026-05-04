# M2-9A SQL Apply Go/No-Go Decision

## Decision

**GO** for proceeding to M2-9B SQL apply readiness against the confirmed dev target `product-ops-dev-aurora` only.

This decision replaces the earlier NO-GO record at the M2-9A gate level. The earlier NO-GO records (`docs/m2_9a_live_db_preflight_gate_kr.md`, `docs/m2_9a_live_db_no_go_decision_record_kr.md`, `docs/m2_9a_rollback_plan_kr.md`) remain in the repository unchanged for audit history.

## Decision Scope

The GO covers the M2-9A preflight gate only. It authorizes M2-9B to be entered as a separate task with its own gate checks. It does **not** authorize SQL apply, runtime dry-run, production access, or any external infrastructure command in this M2-9A task.

## Inputs Considered

- Eleven operator evidence groups present and structurally valid (see `docs/m2_9a_live_db_preflight_go_evidence_kr.md`).
- Target classification: dev. Source: `infra/terraform/envs/dev` and operator confirmation. Non-production confirmation explicit.
- Safe DB target: `product-ops-dev-aurora`. Migration owner role: `app_migration_dev_role`. Sanitized observed inspection user: `postgres`. Region: `ap-northeast-2`. Account identifier not recorded.
- Cleanup owner: Yoon Joonho. Rollback owner: Yoon Joonho. evidence_report_ref: `docs/runtime_evidence/m2_9_dev_dry_run_20260504.md`.
- Bounded sample-count: 1 (finite, small). Bounded time-window: 10 minutes (finite). Both apply to M2-9C, not M2-9A.
- Read-only inspection results: all three expected tables missing, 0 of 10 expected indexes present, 0 of 15 expected constraints present. Pre-apply state consistent.
- Reviewed rollback procedure: `docs/m2_9a_rollback_plan_kr.md`. Rollback owner approval recorded.
- Verification query set: read-only existence checks covering tables, indexes, constraints, and `current_database` / `current_user` / `current_schema` / `version()`. M2-9B must rerun after apply.
- No raw exposure confirmation: explicit, complete.

## What Is Allowed Next

- M2-9B SQL apply against `product-ops-dev-aurora` only, applying `infra/sql/aurora/m2_4_dlq_replay_metadata.sql`, with rerun of Phase 0 baseline before apply, transaction-wrapped apply, stop-on-first-error, sanitized evidence capture, and post-apply rerun of the M2-9A verification query set.

## What Remains NO-GO

- production DB access — remains NO-GO
- SQL apply in this M2-9A task — remains NO-GO (M2-9A is preflight only)
- runtime dry-run in this M2-9A task — remains NO-GO (M2-9C scope)
- runtime dry-run before M2-9B schema verification passes — remains NO-GO
- unbounded Kafka / Debezium / ClickHouse execution — remains NO-GO
- Terraform changes — remains NO-GO
- deployment changes — remains NO-GO
- broad rewrites of `apps/api/src/server.js`, `apps/api/src/auth.js`, `apps/api/src/error-response.js`, or main OpenAPI — remains NO-GO
- raw payload / full message body / issue raw value / prod_change payload-or-actor exposure in any doc, log, error, or summary — remains NO-GO

## Boundary Statements

- SQL apply has not been performed in M2-9A.
- Runtime dry-run has not been executed in M2-9A.
- No production DB was used.
- No DB URL, hostname, port, credential, token, password, or connection string is recorded in any M2-9A GO doc.
- The M2-4 DLQ replay metadata SQL file remains marked `PROPOSAL ONLY - DO NOT APPLY AUTOMATICALLY`.

## Cross-References

- Master GO evidence: `docs/m2_9a_live_db_preflight_go_evidence_kr.md`
- Target identity: `docs/m2_9a_live_db_target_evidence_kr.md`
- Schema inspection report: `docs/m2_9a_schema_inspection_report_kr.md`
- Runtime dry-run bounds: `docs/m2_9a_runtime_dry_run_bounds_kr.md`
- Next task prompt: `docs/m2_9b_next_sql_apply_prompt_kr.md`
