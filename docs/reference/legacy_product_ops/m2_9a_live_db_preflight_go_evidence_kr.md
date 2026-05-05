# M2-9A Live DB Preflight GO Evidence

## Decision

Decision: GO for proceeding to **M2-9B SQL apply readiness**, against the confirmed dev target only.

This GO record covers the M2-9A preflight gate only. It does **not** authorize SQL apply, runtime dry-run, production access, or any external infrastructure command in this task. M2-9B SQL apply is a separate, explicitly-scoped task that must rerun Phase 0 baseline before applying anything.

## Operator Evidence Summary

All eleven operator evidence groups required by the M2-9A gate are present and structurally non-production-safe. The detailed records are split across this doc, `docs/m2_9a_live_db_target_evidence_kr.md`, `docs/m2_9a_schema_inspection_report_kr.md`, `docs/m2_9a_sql_apply_go_no_go_decision_kr.md`, and `docs/m2_9a_runtime_dry_run_bounds_kr.md`.

### 1. Environment classification

- Target environment label: dev
- Source of classification: `infra/terraform/envs/dev` and operator confirmation
- Explicit no-production confirmation: Confirmed non-production and not shared with production.

### 2. Safe DB target identity

- Safe DB label: `product-ops-dev-aurora`
- Safe DB/user role label: `app_migration_dev_role` (sanitized observed user during read-only inspection: `postgres`)
- Region label: `ap-northeast-2`. Account identifier not recorded in docs.
- No DB URL, hostname, port, IAM ARN, credential, token, or password is recorded anywhere in this evidence set.

### 3. Cleanup owner

- Cleanup owner: Yoon Joonho
- Contact path: operator-owned local project context

### 4. Rollback owner

- Rollback owner: Yoon Joonho
- Contact path: operator-owned local project context

### 5. Evidence report reference

- evidence_report_ref: `docs/runtime_evidence/m2_9_dev_dry_run_20260504.md`
- This path is the destination for M2-9C controlled runtime dry-run evidence. The file does not exist yet; it will be created when M2-9C is executed under explicit approval. M2-9A does not write to this path.

### 6. Bounded sample-count

- Maximum records touched by controlled runtime dry-run: **1**
- Explicit finite bound: confirmed finite sample count of 1.
- Applies to M2-9C only. M2-9A is read-only.

### 7. Bounded time-window

- Maximum dry-run duration: **10 minutes**
- Explicit finite bound: confirmed finite time-window of 10 minutes.
- Applies to M2-9C only. M2-9A is read-only.

### 8. Read-only preflight inspection results (sanitized)

- current_database safe label: `productops`
- current_user safe label: `postgres`
- current_schema safe label: `public`
- server/version safe summary: `PostgreSQL 15.17`
- public.cdc_failure existence: **missing**
- public.cdc_replay_request existence: **missing**
- public.cdc_failure_state_log existence: **missing**
- index existence summary: **0 of 10 expected indexes present**
- constraint existence summary: **0 of 15 expected constraints present**
- inspection command run by human operator: yes
- inspection was read-only: yes

All three expected CDC replay metadata tables, all 10 expected indexes, and all 15 expected constraints are absent before SQL apply. This is the expected pre-apply state for a target that has never had `infra/sql/aurora/m2_4_dlq_replay_metadata.sql` applied. M2-9B SQL apply is the next step that creates them.

The full sanitized inspection results are recorded in `docs/m2_9a_schema_inspection_report_kr.md`.

### 9. Reviewed rollback procedure

- Rollback procedure status: reviewed for the pre-apply gate. An executable rollback script remains required in M2-9B before any apply.
- Rollback procedure path: `docs/m2_9a_rollback_plan_kr.md`. Rollback must drop CDC replay metadata objects in dependency order if M2-9B apply partially succeeds.
- Rollback owner approval: Yoon Joonho approves rollback ownership for the dev target.

### 10. Verification queries

- Verification query set summary: read-only table existence, index existence, constraint existence, and `current_database` / `current_user` / `current_schema` / `version()` checks. Same set used in M2-9A read-only inspection.
- Covers table existence: yes
- Covers index existence: yes
- Covers constraints: yes
- Covers schema/repository assumptions consumed by `apps/api/src/cdc-recovery/cdc-recovery-aurora-repository.js`: yes
- M2-9B must rerun this verification query set after SQL apply to confirm post-apply parity with the M2-4 DLQ replay metadata schema.

### 11. No raw exposure confirmation

- No raw payload exposure: confirmed
- No full message body exposure: confirmed
- No issue raw values exposure: confirmed
- No prod_change payload/actor exposure: confirmed
- No secrets / tokens / DB URL / connection string in docs: confirmed
- No stack traces, SQL error internals, or persistence internals in docs: confirmed

## Boundary Statements

- SQL apply has not been performed in M2-9A.
- Runtime dry-run has not been executed in M2-9A.
- No production DB was used.
- No write query was executed.
- No Aurora connection was opened by Claude in this session; the read-only preflight inspection was run by the human operator.
- No DB URL, hostname, port, credential, token, or connection string is written to this evidence set.
- The M2-4 DLQ replay metadata SQL file remains marked `PROPOSAL ONLY - DO NOT APPLY AUTOMATICALLY` and was not modified.

## Why GO Is Correct Now

The eleven gate inputs are present, the dev target is explicitly classified, the cleanup and rollback owners are named, `evidence_report_ref` is a real repo-relative path, the runtime sample-count and time-window are finite and small, the read-only inspection was run by the operator and returned the expected pre-apply state (all CDC replay metadata objects missing), the rollback procedure has been reviewed at the gate level, the verification query set covers the expected post-apply schema, and the operator has explicitly confirmed no production access and no raw exposure. The GO record therefore replaces the earlier NO-GO record at the M2-9A gate level only — M2-9B remains a separate, explicitly-scoped apply task.

## What Remains NO-GO

- direct production DB access — remains NO-GO
- SQL apply in M2-9A — remains NO-GO (M2-9A is preflight only)
- runtime dry-run in M2-9A — remains NO-GO (M2-9C scope)
- unbounded Kafka / Debezium / ClickHouse execution — remains NO-GO
- Terraform changes — remains NO-GO
- deployment changes — remains NO-GO
- raw payload / full message body / issue raw value / prod_change payload/actor exposure in any doc, log, error, or summary — remains NO-GO

## Existing NO-GO Records Preserved

The earlier NO-GO records are preserved unchanged for audit history:

- `docs/m2_9a_live_db_preflight_gate_kr.md`
- `docs/m2_9a_live_db_no_go_decision_record_kr.md`
- `docs/m2_9a_rollback_plan_kr.md`

Their continued presence is part of the M2-9A record. Future readers see both the original NO-GO posture and the explicit operator-evidence-backed GO replacement.

## Next Required Task

M2-9B SQL apply against the confirmed `product-ops-dev-aurora` dev target only. The M2-9B prompt is recorded in `docs/m2_9b_next_sql_apply_prompt_kr.md`.
