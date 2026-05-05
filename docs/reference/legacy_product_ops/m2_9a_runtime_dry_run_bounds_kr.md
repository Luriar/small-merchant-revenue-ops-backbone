# M2-9A Runtime Dry-Run Bounds

## Scope

Records the bounded scope under which a future M2-9C controlled runtime dry-run may execute against the confirmed dev target. This document is part of the M2-9A preflight GO evidence set. It does **not** authorize execution of the dry-run in M2-9A. Runtime dry-run has not been executed in M2-9A.

## Bounds

- Bounded sample-count: **1**. Explicit finite confirmation: confirmed finite sample count of 1.
- Bounded time-window: **10 minutes**. Explicit finite confirmation: confirmed finite time-window of 10 minutes.
- Target environment: **dev** only. Specifically `product-ops-dev-aurora`. Production is rejected.
- Sample data: must be a synthetic or dev-only failure row. No production-derived data may be used.
- Execution mode: controlled route/repository-level call. Unbounded Kafka, Debezium, or ClickHouse execution is forbidden.

## Cleanup And Evidence Bounds

- Cleanup owner: Yoon Joonho.
- Rollback owner: Yoon Joonho.
- evidence_report_ref: `docs/runtime_evidence/m2_9_dev_dry_run_20260504.md`. The destination file does not exist yet; M2-9C creates it under explicit approval.
- Cleanup must complete within the time-window. Any sample row created must be removable by the cleanup owner using the documented cleanup steps.

## Forbidden In Any M2-9C Dry-Run

- production DB access
- raw payload exposure in evidence, logs, or summaries
- full message body exposure
- issue raw value exposure
- prod_change payload or actor exposure
- DB URLs, connection strings, secrets, tokens, passwords in evidence, logs, or summaries
- stack traces, SQL error internals, persistence internals in API-safe outputs
- unbounded sample-count or unbounded time-window
- skipping schema verification before dry-run

## Preconditions Before M2-9C May Run

1. M2-9B SQL apply completes successfully against `product-ops-dev-aurora`.
2. M2-9B post-apply verification query set passes (all three tables present, all 10 indexes present, all 15 constraints present).
3. Phase 0 baseline regression rerun is green.
4. Rollback owner and cleanup owner remain assigned and reachable.
5. evidence_report_ref destination is writable by the operator.

If any precondition is unmet, M2-9C does not execute.

## Boundary Statements

- Runtime dry-run has not been executed in M2-9A.
- SQL apply has not been performed in M2-9A.
- No production DB was used.
- No DB URL, connection string, credential, token, password, or raw value is recorded in this document.
- The M2-4 DLQ replay metadata SQL file remains marked `PROPOSAL ONLY - DO NOT APPLY AUTOMATICALLY`.

## Cross-References

- Master GO evidence: `docs/m2_9a_live_db_preflight_go_evidence_kr.md`
- Target identity: `docs/m2_9a_live_db_target_evidence_kr.md`
- Schema inspection report: `docs/m2_9a_schema_inspection_report_kr.md`
- GO/NO-GO decision: `docs/m2_9a_sql_apply_go_no_go_decision_kr.md`
- Next task prompt: `docs/m2_9b_next_sql_apply_prompt_kr.md`
