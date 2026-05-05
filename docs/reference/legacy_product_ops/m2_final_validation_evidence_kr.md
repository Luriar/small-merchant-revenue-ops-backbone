# M2 Final Validation Evidence

## Purpose

Comprehensive table of M2 validation results at final closure (2026-05-04). Each row records one command, its result, the milestone it covers, and the protected boundary it checked.

## Validator And Test Results

| Command | Result | Milestone | Boundary checked |
| --- | --- | --- | --- |
| `npm run validate:m2:global-safety` | 6 PASS, 0 FAIL | M2 global | raw-field safety across scoped M2 artifacts |
| `npm run validate:m2-7:skeleton-contract` | 34 PASS, 0 FAIL | M2-7 | non-wired skeleton contract |
| `npm run test:m2-7:cdc-recovery` | PASS | M2-7 | DTO mapper + service-layer targeted tests |
| `npm run validate:m2-8a:route-readiness` | 43 PASS, 0 FAIL | M2-8A | route wiring readiness audit |
| `npm run validate:m2-8b-prep:auth-roles` | 43 PASS, 0 FAIL | M2-8B-Prep | auth role contract |
| `npm run validate:m2-8c-prep:error-envelope` | 54 PASS, 0 FAIL | M2-8C | safe error envelope contract |
| `npm run validate:m2-8d-prep:repository-strategy` | 52 PASS, 0 FAIL | M2-8D | direct Aurora repository deferred |
| `npm run validate:m2-8e-prep:openapi-ownership` | 61 PASS, 0 FAIL | M2-8E | main OpenAPI unchanged |
| `npm run validate:m2-8f-prep:route-tests` | 60 PASS, 0 FAIL | M2-8F | route-test contract |
| `npm run validate:m2-8g:final-pre-wiring` | 45 PASS, 0 FAIL | M2-8G | final pre-wiring Go/No-Go |
| `npm run test:m2-8b:cdc-recovery-routes` | PASS | M2-8B | test-only harness preserved |
| `npm run validate:m2-8b:test-only-harness` | 45 PASS, 0 FAIL | M2-8B | M2-8I-aware server diff compatibility |
| `npm run validate:m2-8h:route-wiring-readiness` | 45 PASS, 0 FAIL | M2-8H | M2-8I-aware server diff compatibility |
| `npm run test:m2-8i:production-routes` | PASS | M2-8I | production route registration, safe DTO/error outputs |
| `npm run validate:m2-8i:production-route-wiring` | 43 PASS, 0 FAIL | M2-8I | server diff, OpenAPI boundary, no DB/infra |
| `npm run validate:m2-8j:openapi-readiness` | 69 PASS, 0 FAIL | M2-8J | OpenAPI readiness, schema parity, protected OpenAPI boundary |
| `npm run validate:m2-8m:openapi-merge` | 18 PASS, 0 FAIL | M2-8M | main OpenAPI CDC merge diff, proposal-only patch, no runtime/infra drift |
| `npm run validate:m2-8n:post-merge-closure` | 31 PASS, 0 FAIL | M2-8N | post-merge route/OpenAPI/DTO/auth/error closure |
| `npm run test:m2-8o:aurora-repository` | 10/10 PASS | M2-8O | mocked Aurora repository, no live DB |
| `npm run validate:m2-8o:aurora-repository` | 50 PASS, 0 FAIL | M2-8O | injected DB client, safe projection, no DB/infra |
| `npm run validate:m2-9a:live-db-preflight` | 29 PASS, 0 FAIL | M2-9A | NO-GO record preserved for audit history |
| `npm run validate:m2-9a:live-db-go` | 64 PASS, 0 FAIL | M2-9A | dev target evidence, sanitized inspection, no DB URL/secret leakage |
| `npm run validate:m2-9b:sql-apply-evidence` | 97 PASS, 0 FAIL | M2-9B | apply evidence, schema verification, M2-9A/M2-8M state preservation |
| `npm run validate:m2-9c:runtime-dry-run-evidence` | 114 PASS, 0 FAIL | M2-9C | dry-run evidence, cleanup status, M2-9A/M2-9B/M2-8M state preservation |
| `python3 -m py_compile scripts/validate_m2_9a_live_db_go.py scripts/validate_m2_9b_sql_apply_evidence.py scripts/validate_m2_9c_runtime_dry_run_evidence.py` | PASS | M2-9 | validator syntax |
| `git diff --check` | exit 0 | M2 baseline | whitespace/conflict marker check |

## Live-DB Operator Evidence (M2-9B / M2-9C)

These actions ran against the confirmed dev target only. Sanitized evidence is recorded in repo docs; raw operator transcripts are not stored in the repository.

| Action | Outcome | Evidence file |
| --- | --- | --- |
| M2-9A read-only preflight inspection | identity productops/postgres/public; PostgreSQL 15.17; 0/3 tables; 0/10 indexes; 0/15 constraints | `docs/m2_9a_schema_inspection_report_kr.md` |
| M2-9B SQL apply (`infra/sql/aurora/m2_4_dlq_replay_metadata.sql`) | succeeded under one minute; single transaction with `ON_ERROR_STOP=1` | `docs/m2_9b_sql_apply_evidence_kr.md` |
| M2-9B post-apply schema verification | 3/3 tables, 10/10 named indexes, 15/15 named constraints, plus 9 expected implicit PK/FK constraints (24 total) | `docs/m2_9b_schema_verification_report_kr.md` |
| M2-9C controlled runtime dry-run | all 9 step assertions ok; cleanup complete (0/0/0); 671 ms within 10-minute bound | `docs/m2_9c_controlled_runtime_dry_run_evidence_kr.md`, `docs/runtime_evidence/m2_9_dev_dry_run_20260504.md` |
| M2-9B rollback executed | no — not needed | `docs/m2_9b_rollback_sql_review_kr.md` |
| M2-9C cleanup executed | yes — bounded by single synthetic `failure_id` via CASCADE FKs | `docs/m2_9c_runtime_cleanup_report_kr.md` |

## Forbidden-Pattern Coverage

The M2-9A GO, M2-9B, and M2-9C validators run regex scans for forbidden patterns over every evidence doc they own. Coverage at final closure:

- DB URLs: `postgres://`, `postgresql://`, `jdbc:postgresql://`, URL with embedded userinfo credential — **0 hits**
- credential assignments: `password=`, `aws_access_key_id=`, `aws_secret_access_key=` — **0 hits**
- AWS keys: AKIA, ASIA prefixes — **0 hits**
- tokens: JWT-like, Bearer-token-header — **0 hits**
- network identifiers: RDS endpoint hostname, Aurora cluster endpoint hostname, Postgres host:port pattern, IPv4 address, loopback `127.0.0.1`, port `:5432`, port `:15432`, env-var assignments (`PG*=`, `DATABASE_URL=`, `NODE_TLS_REJECT_UNAUTHORIZED=`) — **0 hits** (M2-9C scan)
- account / role / SQLSTATE: 12-digit account ID, IAM role ARN, `SQLSTATE: NNNNN` literal — **0 hits**
- raw exposure: `raw_payload` JSON, `prod_change_payload` JSON, `prod_change_actor` string, `issue_raw` JSON, `message_body` string — **0 hits**

## State Preservation At Final Closure

| Artifact | State |
| --- | --- |
| `infra/sql/aurora/m2_4_dlq_replay_metadata.sql` | retains `PROPOSAL ONLY - DO NOT APPLY AUTOMATICALLY` marker (apply was authorized via M2-9A GO + M2-9B task; marker preserved) |
| `infra/sql/aurora/m2_4_dlq_replay_metadata_rollback.sql` | created under M2-9B; not executed |
| `sources/personal_project_openapi_v0_2.yaml` | M2-8M merged state with CDC Recovery tag, paths, safe schemas, `CdcErrorResponse` |
| `sources/openapi_m2_5_dlq_replay_patch.yaml` | proposal-only history; `PROPOSAL` marker preserved |
| `apps/api/src/server.js` | M2-8I minimal route registration through isolated dispatcher |
| `apps/api/src/auth.js` | unchanged |
| `apps/api/src/error-response.js` | unchanged |
| `apps/api/src/cdc-recovery/cdc-recovery-aurora-repository.js` | M2-8O implementation; live-exercised in M2-9C |
| `docs/m2_9a_live_db_preflight_gate_kr.md` (NO-GO history) | preserved unchanged |
| `docs/m2_9a_live_db_no_go_decision_record_kr.md` (NO-GO history) | preserved unchanged |
| `docs/m2_9a_rollback_plan_kr.md` (NO-GO history) | preserved unchanged |

## Cross-References

- Closure summary: `docs/m2_final_closure_summary_kr.md`
- Runtime boundary decision record: `docs/m2_final_runtime_boundary_decision_record_kr.md`
- Artifact index: `docs/m2_final_artifact_index_kr.md`
- Commit plan: `docs/m2_final_commit_plan_kr.md`
- Next phase plan: `docs/m2_next_phase_plan_kr.md`
- Detail evidence ledger: `docs/m2_8_validation_evidence_ledger_kr.md`
