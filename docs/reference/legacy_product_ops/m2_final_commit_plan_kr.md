# M2 Final Commit Plan

## Purpose

A suggested commit grouping for the uncommitted M2 work. The repository currently has accumulated changes spanning M2-7 → M2-9C plus several earlier-recorded modifications. This plan groups them so reviewers can read each commit as a single coherent change. The plan does **not** create commits automatically; the operator runs `git commit` per group when ready.

## Working-Tree Snapshot Reference

This plan was prepared against the working tree at final M2 closure (2026-05-04). Re-run `git status --short` before applying to confirm nothing has drifted.

## Commit Groups

### Group 1 — M2-8 production route wiring + OpenAPI merge (already on `main`)

Already committed by earlier sessions. Tracked here for completeness:

- `7541820` Add M2-8A route wiring readiness audit
- `818a0b2` Add M2-1 legacy CDC artifact guardrails
- `8abd312` Register M2 validation scripts
- `9203f3a` Add M2 global safety and handoff docs
- `5b337f9` Add M2-7 non-wired CDC recovery skeleton

No action required for Group 1.

### Group 2 — M2-7 → M2-8O CDC recovery code, tests, OpenAPI merge, validators

One commit per logical M2-8 sub-milestone is fine, or one bundled commit titled "Land M2-8 CDC recovery production wiring and Aurora repository". Recommended files:

- `apps/api/src/server.js`
- `apps/api/src/cdc-recovery/cdc-recovery-routes.js`
- `apps/api/src/cdc-recovery/cdc-recovery-route-level.test.js`
- `apps/api/src/cdc-recovery/cdc-recovery-production-routes.test.js`
- `apps/api/src/cdc-recovery/cdc-recovery-aurora-repository.js`
- `apps/api/src/cdc-recovery/cdc-recovery-aurora-repository.test.js`
- `apps/api/src/cdc-recovery/test-support/`
- `sources/personal_project_openapi_v0_2.yaml`
- `scripts/validate_m2_7_skeleton_contract.py`
- `scripts/validate_m2_8a_route_wiring_readiness.py`
- All M2-8B → M2-8O scripts and `scripts/m2_8i_validator_compat.py` / `scripts/m2_8m_validator_compat.py` if present
- `package.json` (M2-8 + M2-8O script entries)
- All `docs/m2_8*` files
- Updated `docs/m2_8a_route_wiring_readiness_audit_kr.md`

Suggested message: "Land M2-8 CDC recovery production wiring through M2-8O mocked Aurora repository". Co-author per project convention.

### Group 3 — M2-9A live DB preflight (NO-GO history + GO conversion)

- `scripts/validate_m2_9a_live_db_preflight.py`
- `scripts/validate_m2_9a_live_db_go.py`
- `package.json` (`validate:m2-9a:live-db-preflight`, `validate:m2-9a:live-db-go`)
- `docs/m2_9a_live_db_preflight_gate_kr.md`
- `docs/m2_9a_live_db_no_go_decision_record_kr.md`
- `docs/m2_9a_rollback_plan_kr.md`
- `docs/m2_9a_live_db_preflight_go_evidence_kr.md`
- `docs/m2_9a_live_db_target_evidence_kr.md`
- `docs/m2_9a_schema_inspection_report_kr.md`
- `docs/m2_9a_sql_apply_go_no_go_decision_kr.md`
- `docs/m2_9a_runtime_dry_run_bounds_kr.md`
- `docs/m2_9a_go_blocked_repair_prompt_kr.md`
- `docs/m2_9b_next_sql_apply_prompt_kr.md`

Suggested message: "Add M2-9A live DB preflight gate (NO-GO history preserved; GO recorded under operator evidence)".

### Group 4 — M2-9B SQL apply, schema verification, rollback artifact

- `infra/sql/aurora/m2_4_dlq_replay_metadata_rollback.sql`
- `scripts/validate_m2_9b_sql_apply_evidence.py`
- `package.json` (`validate:m2-9b:sql-apply-evidence`)
- `docs/m2_9b_rollback_sql_review_kr.md`
- `docs/m2_9b_sql_apply_evidence_kr.md`
- `docs/m2_9b_sql_apply_decision_record_kr.md`
- `docs/m2_9b_schema_verification_report_kr.md`

Suggested message: "Apply M2-4 DLQ replay metadata to dev under M2-9B with reviewed rollback prepared".

### Group 5 — M2-9C controlled runtime dry-run + final M2 closure

- `scripts/m2_9c_dry_run.js`
- `scripts/validate_m2_9c_runtime_dry_run_evidence.py`
- `package.json` (`validate:m2-9c:runtime-dry-run-evidence`)
- `docs/m2_9c_next_controlled_runtime_dry_run_prompt_kr.md`
- `docs/m2_9c_runtime_feasibility_check_kr.md`
- `docs/m2_9c_synthetic_input_plan_kr.md`
- `docs/m2_9c_controlled_runtime_dry_run_evidence_kr.md`
- `docs/m2_9c_runtime_decision_record_kr.md`
- `docs/m2_9c_runtime_cleanup_report_kr.md`
- `docs/runtime_evidence/m2_9_dev_dry_run_20260504.md`
- `docs/m2_final_closure_summary_kr.md`
- `docs/m2_final_validation_evidence_kr.md`
- `docs/m2_final_runtime_boundary_decision_record_kr.md`
- `docs/m2_final_artifact_index_kr.md`
- `docs/m2_final_commit_plan_kr.md`
- `docs/m2_next_phase_plan_kr.md` (rewrite)
- `docs/m2_live_gated_closure_summary_kr.md` (final-closure update)
- `docs/m2_next_session_handoff_kr.md` (final-closure update)
- `docs/m2_8_validation_evidence_ledger_kr.md` (final-closure update)

Suggested message: "Run M2-9C controlled runtime dry-run on dev and close M2".

## Pre-Commit Checklist

Before any of the above commits land, the operator should rerun:

- `npm run validate:m2:global-safety`
- `npm run validate:m2-9a:live-db-go`
- `npm run validate:m2-9a:live-db-preflight`
- `npm run validate:m2-9b:sql-apply-evidence`
- `npm run validate:m2-9c:runtime-dry-run-evidence`
- `npm run validate:m2-8m:openapi-merge`
- `npm run validate:m2-8n:post-merge-closure`
- `npm run validate:m2-8o:aurora-repository`
- `npm run test:m2-8o:aurora-repository`
- `git diff --check`

All must be green. The current snapshot is green at final closure.

## Commit Message Boundaries

- Do not include DB URLs, hostnames, ports, IAM role ARNs, AWS account IDs, credentials, tokens, or passwords in commit messages.
- Do not include raw payload values, full message bodies, issue raw values, or prod_change payload/actor values.
- Do not include stack traces, SQL error internals, or `SQLSTATE`-prefixed codes.
- Do reference safe IDs and safe labels: `product-ops-dev-aurora`, `Yoon Joonho`, `m2_9c_dryrun_<ts>_failure`, `docs/runtime_evidence/m2_9_dev_dry_run_20260504.md`.

## Optional Tagging

If the project uses release tags for milestone closure, an optional tag at Group 5's commit:

```
git tag -a m2-final-closure -m "M2 final closure (live-DB dev-bounded scope)"
```

The tag is optional and informational.

## Cross-References

- Closure summary: `docs/m2_final_closure_summary_kr.md`
- Validation evidence: `docs/m2_final_validation_evidence_kr.md`
- Artifact index: `docs/m2_final_artifact_index_kr.md`
- Next phase plan: `docs/m2_next_phase_plan_kr.md`
