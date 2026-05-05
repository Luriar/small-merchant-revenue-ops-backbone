# M2-8 Validation Evidence Ledger

## Ledger

| Command | Result | Covered milestone | Protected boundary checked |
| --- | --- | --- | --- |
| `npm run test:m2-8i:production-routes` | PASS | M2-8I | production route registration, safe DTO/error outputs |
| `python3 scripts/validate_m2_8i_production_route_wiring.py` | 43 PASS, 0 FAIL | M2-8I | server diff, OpenAPI boundary, no DB/infra |
| `npm run validate:m2-8i:production-route-wiring` | 43 PASS, 0 FAIL | M2-8I | package script path |
| `npm run test:m2-8b:cdc-recovery-routes` | PASS | M2-8B | test-only harness preserved |
| `npm run validate:m2-8b:test-only-harness` | 45 PASS, 0 FAIL | M2-8B | M2-8I-aware server diff compatibility |
| `npm run validate:m2-8h:route-wiring-readiness` | 45 PASS, 0 FAIL | M2-8H | M2-8I-aware server diff compatibility |
| `npm run validate:m2-8g:final-pre-wiring` | 45 PASS, 0 FAIL | M2-8G | M2-8I-aware server diff compatibility |
| `npm run validate:m2-8f-prep:route-tests` | 60 PASS, 0 FAIL | M2-8F | route-test contract |
| `npm run validate:m2-8e-prep:openapi-ownership` | 61 PASS, 0 FAIL | M2-8E | main OpenAPI unchanged |
| `npm run validate:m2-8d-prep:repository-strategy` | 52 PASS, 0 FAIL | M2-8D | direct Aurora repository deferred |
| `npm run validate:m2-8c-prep:error-envelope` | 54 PASS, 0 FAIL | M2-8C | safe error envelope contract |
| `npm run validate:m2-8b-prep:auth-roles` | 43 PASS, 0 FAIL | M2-8B-Prep | auth role contract |
| `npm run validate:m2-8a:route-readiness` | 43 PASS, 0 FAIL | M2-8A | readiness audit |
| `npm run validate:m2-7:skeleton-contract` | 34 PASS, 0 FAIL | M2-7 | skeleton contract |
| `npm run validate:m2:global-safety` | 6 PASS, 0 FAIL | M2 global | raw-field safety |
| `npm run test:m2-7:cdc-recovery` | PASS | M2-7 | DTO/service targeted tests |
| `python3 -m py_compile scripts/validate_m2_8i_production_route_wiring.py scripts/m2_8i_validator_compat.py` | PASS | M2-8I | validator syntax |
| `python3 scripts/validate_m2_8j_openapi_merge_readiness.py` | 69 PASS, 0 FAIL | M2-8J | OpenAPI readiness, schema parity, protected OpenAPI boundary |
| `npm run validate:m2-8j:openapi-readiness` | 69 PASS, 0 FAIL | M2-8J | package script path |
| `python3 scripts/validate_m2_8m_openapi_merge.py` | 18 PASS, 0 FAIL | M2-8M | main OpenAPI CDC merge diff, proposal-only patch, no runtime/infra drift |
| `npm run validate:m2-8m:openapi-merge` | 18 PASS, 0 FAIL | M2-8M | package script path |
| `python3 -m py_compile scripts/validate_m2_8m_openapi_merge.py scripts/m2_8m_validator_compat.py` | PASS | M2-8M | validator syntax |
| `npm run validate:m2-8n:post-merge-closure` | 31 PASS, 0 FAIL | M2-8N | post-merge route/OpenAPI/DTO/auth/error closure |
| `npm run test:m2-8o:aurora-repository` | PASS | M2-8O | mocked Aurora repository, no live DB |
| `npm run validate:m2-8o:aurora-repository` | 50 PASS, 0 FAIL | M2-8O | injected DB client, safe projection, no DB/infra |
| `npm run validate:m2-9a:live-db-preflight` | 29 PASS, 0 FAIL | M2-9A | NO-GO preflight documented, no SQL apply |
| `python3 -m py_compile scripts/validate_m2_8n_post_merge_closure.py scripts/validate_m2_8o_aurora_repository.py scripts/validate_m2_9a_live_db_preflight.py` | PASS | M2-8N/O/9A | validator syntax |
| `npm run test:m2-8o:aurora-repository` (2026-05-04 re-confirm) | 10/10 PASS | M2-8O | mocked Aurora repository regression |
| `npm run validate:m2-8o:aurora-repository` (2026-05-04 re-confirm) | 50 PASS, 0 FAIL | M2-8O | injected DB client, safe projection |
| `npm run validate:m2-8n:post-merge-closure` (2026-05-04 re-confirm) | 31 PASS, 0 FAIL | M2-8N | post-merge route/OpenAPI/DTO/auth/error closure |
| `npm run validate:m2-8m:openapi-merge` (2026-05-04 re-confirm) | 18 PASS, 0 FAIL | M2-8M | main OpenAPI CDC merge diff |
| `npm run validate:m2:global-safety` (2026-05-04 re-confirm) | 6 PASS, 0 FAIL | M2 global | raw-field safety |
| `npm run validate:m2-9a:live-db-preflight` (2026-05-04 re-confirm) | 29 PASS, 0 FAIL (NO-GO state) | M2-9A | NO-GO preflight remains documented |
| `git diff --check` (2026-05-04 re-confirm) | exit 0 | M2 baseline | whitespace/conflict marker check |
| `python3 scripts/validate_m2_9a_live_db_go.py` (2026-05-04 GO conversion) | 64 PASS, 0 FAIL | M2-9A GO | dev target evidence, sanitized inspection, no DB URL/secret leakage |
| `npm run validate:m2-9a:live-db-go` (2026-05-04 GO conversion) | 64 PASS, 0 FAIL | M2-9A GO | package script path |
| `python3 -m py_compile scripts/validate_m2_9a_live_db_go.py` | PASS | M2-9A GO | validator syntax |
| `python3 scripts/validate_m2_9b_sql_apply_evidence.py` (2026-05-04 M2-9B) | 97 PASS, 0 FAIL | M2-9B | apply evidence, schema verification, no DB URL/secret leakage, M2-9A/M2-8M state preserved |
| `npm run validate:m2-9b:sql-apply-evidence` (2026-05-04 M2-9B) | 97 PASS, 0 FAIL | M2-9B | package script path |
| `python3 -m py_compile scripts/validate_m2_9b_sql_apply_evidence.py` | PASS | M2-9B | validator syntax |
| `python3 scripts/validate_m2_9c_runtime_dry_run_evidence.py` (2026-05-04 M2-9C) | 114 PASS, 0 FAIL | M2-9C | dry-run evidence, cleanup status, M2-9A/M2-9B/M2-8M state preservation, no DB URL/secret/IP/port leakage |
| `npm run validate:m2-9c:runtime-dry-run-evidence` (2026-05-04 M2-9C) | 114 PASS, 0 FAIL | M2-9C | package script path |
| `python3 -m py_compile scripts/validate_m2_9c_runtime_dry_run_evidence.py` | PASS | M2-9C | validator syntax |

## Current State

Production route wiring is active for CDC recovery through the M2-8I isolated dispatcher, but it still uses the stub repository boundary.

Main OpenAPI merge for CDC recovery was performed in M2-8M. The M2-5 proposal patch remains proposal-only history. A mocked Aurora repository was implemented in M2-8O, but it is not live-wired. SQL was not applied. External infrastructure was not used.

## Remaining Unverified Areas

- live Aurora repository behavior
- migration and rollback behavior
- controlled runtime dry-run behavior
- production persistence error behavior
- explicit dev/staging DB preflight GO evidence
