# M2-8 Commit Plan

## Group 1: M2-8A~F Prep Contracts

Suggested commit message: `docs: add m2-8 prep contracts`

Include M2-8A through M2-8F docs, fixtures, ops checklists, and validators.

Run before commit:

- `npm run validate:m2-8f-prep:route-tests`
- `npm run validate:m2-8e-prep:openapi-ownership`
- `npm run validate:m2-8d-prep:repository-strategy`
- `npm run validate:m2-8c-prep:error-envelope`
- `npm run validate:m2-8b-prep:auth-roles`
- `npm run validate:m2-8a:route-readiness`

Do not include main OpenAPI merge, SQL, Terraform, or deployment changes.

## Group 2: M2-8G Final Pre-Wiring Closure

Suggested commit message: `docs: add m2-8 final pre-wiring closure`

Include M2-8G docs/checklists and validator.

Run: `npm run validate:m2-8g:final-pre-wiring`.

## Group 3: M2-8B Test-Only Harness

Suggested commit message: `test: add cdc recovery route-level harness`

Include test-support files, route-level tests, M2-8B doc, and validator.

Run:

- `npm run test:m2-8b:cdc-recovery-routes`
- `npm run validate:m2-8b:test-only-harness`

## Group 4: M2-8H Readiness Review

Suggested commit message: `docs: add cdc production route wiring readiness review`

Include M2-8H docs/checklists and validator.

Run: `npm run validate:m2-8h:route-wiring-readiness`.

## Group 5: M2-8I Production Route Wiring

Suggested commit message: `feat: wire cdc recovery routes through isolated dispatcher`

Include:

- `apps/api/src/server.js`
- `apps/api/src/cdc-recovery/cdc-recovery-routes.js`
- `apps/api/src/cdc-recovery/cdc-recovery-production-routes.test.js`
- M2-8I docs and validators
- validator compatibility helper and validator updates
- `package.json`

Run full M2-8I validation chain before commit.

Do not include main OpenAPI, SQL, Terraform, deployment, or Aurora repository implementation.

Rollback note: remove the isolated dispatcher import/construction/dispatch block from `server.js` and keep M2-8B harness.

## Group 6: M2-8J/K/L Planning Docs

Suggested commit message: `docs: add m2-8 post-wiring readiness plans`

Include M2-8J, M2-8K, M2-8L planning docs only.

Do not include implementation.

## Group 7: Validation/Evidence/Handoff Docs

Suggested commit message: `docs: add m2-8 validation evidence and handoff`

Include validation ledger, artifact index, commit plan, operator checklist, and handoff updates.

Run:

- `npm run validate:m2:global-safety`
- `git diff --check`

## Group 8: M2-8M OpenAPI Merge

Suggested commit message: `docs: merge cdc recovery api into openapi`

Include:

- `sources/personal_project_openapi_v0_2.yaml`
- `docs/m2_8m_openapi_merge_implementation_kr.md`
- `docs/m2_8m_post_merge_schema_parity_kr.md`
- `docs/m2_8m_openapi_merge_decision_record_kr.md`
- `docs/m2_8m_closure_summary_kr.md`
- `scripts/validate_m2_8m_openapi_merge.py`
- `scripts/m2_8m_validator_compat.py`
- narrow validator compatibility updates
- `package.json`

Run:

- `npm run validate:m2-8m:openapi-merge`
- `npm run validate:m2-8j:openapi-readiness`
- `npm run test:m2-8i:production-routes`
- `npm run validate:m2:global-safety`
- `git diff --check`

Do not include Aurora repository, SQL, Terraform, deployment, or external infrastructure changes.

Rollback note: remove the CDC Recovery tag, CDC paths, CDC parameters/responses, CDC schemas, and CDC changelog line from the main OpenAPI, then remove M2-8M validator wiring.

## Group 9: M2-8N/O And M2-9A NO-GO Gate

Suggested commit message: `feat: add cdc recovery aurora repository mock boundary`

Include:

- `apps/api/src/cdc-recovery/cdc-recovery-aurora-repository.js`
- `apps/api/src/cdc-recovery/cdc-recovery-aurora-repository.test.js`
- M2-8N docs and validator
- M2-8O docs and validator
- M2-9A preflight/rollback/no-go docs and validator
- live-gated closure, repair prompt, next phase plan
- `package.json`

Run:

- `npm run test:m2-8o:aurora-repository`
- `npm run validate:m2-8o:aurora-repository`
- `npm run validate:m2-9a:live-db-preflight`
- `npm run validate:m2:global-safety`
- `git diff --check`

Do not include SQL apply evidence, live DB output, Terraform, deployment, or external infrastructure changes.

Rollback note: remove the mocked repository and validator wiring. No live DB rollback is required because M2-9A stayed NO-GO.
