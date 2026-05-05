# M2-9A Live DB Target Evidence

## Purpose

Records the safe, sanitized identity of the live DB target chosen for the M2-9A preflight GO record. Pairs with `docs/m2_9a_live_db_preflight_go_evidence_kr.md`. No DB URL, hostname, port, credential, token, password, or connection string is recorded here.

## Environment Classification

- Target environment label: **dev**
- Source of classification: `infra/terraform/envs/dev` and operator confirmation
- Explicit no-production confirmation: **Confirmed non-production and not shared with production.**
- The dev target is dedicated. It does not share storage, replicas, replication slots, or backups with any production environment.

## Safe DB Target Identity

- Safe DB label: `product-ops-dev-aurora`
- Safe DB/user role label: `app_migration_dev_role`
- Sanitized observed user during read-only inspection: `postgres`
- Region label: `ap-northeast-2`
- Account identifier: not recorded in docs
- Connection target inputs (hostname, port, IAM auth path, credential reference): not recorded in docs

The "sanitized observed user" of `postgres` reflects the role under which the operator ran the read-only inspection. The migration owner role for M2-9B remains `app_migration_dev_role`. The operator has confirmed both labels are dev-scoped and that neither implies production access.

## Cleanup Owner

- Cleanup owner: Yoon Joonho
- Contact path: operator-owned local project context
- Cleanup ownership covers M2-9C controlled runtime dry-run cleanup. M2-9A is read-only and required no cleanup.

## Rollback Owner

- Rollback owner: Yoon Joonho
- Contact path: operator-owned local project context
- Rollback ownership covers M2-9B SQL apply. The reviewed rollback procedure path is `docs/m2_9a_rollback_plan_kr.md`. Yoon Joonho approves rollback ownership for the dev target.

## Evidence Report Reference

- evidence_report_ref: `docs/runtime_evidence/m2_9_dev_dry_run_20260504.md`
- This path is the destination for M2-9C controlled runtime dry-run evidence. The file does not exist yet and will be created when M2-9C executes under explicit approval. M2-9A does not write to this path.

## Forbidden Content Statement

This document deliberately omits:

- DB URLs and connection strings
- hostnames, IP addresses, ports
- IAM role ARNs and AWS account identifiers
- credentials, tokens, passwords, secret references
- raw payload values, full message bodies, issue raw values, prod_change payload or actor values
- stack traces, SQL error internals, persistence internals

## Cross-References

- Master GO evidence: `docs/m2_9a_live_db_preflight_go_evidence_kr.md`
- Read-only schema inspection results: `docs/m2_9a_schema_inspection_report_kr.md`
- GO/NO-GO decision: `docs/m2_9a_sql_apply_go_no_go_decision_kr.md`
- Runtime dry-run bounds: `docs/m2_9a_runtime_dry_run_bounds_kr.md`
- NO-GO history (preserved): `docs/m2_9a_live_db_preflight_gate_kr.md`, `docs/m2_9a_live_db_no_go_decision_record_kr.md`, `docs/m2_9a_rollback_plan_kr.md`
