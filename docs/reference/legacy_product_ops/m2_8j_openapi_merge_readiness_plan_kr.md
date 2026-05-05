# M2-8J OpenAPI Merge Readiness Plan

## Current M2-8I Result

M2-8I production CDC recovery route registration passed tests and validators. Route wiring is active through an isolated dispatcher, but the route still uses the in-memory/stub repository boundary.

## Why Main OpenAPI Is Still Not Merged

The main OpenAPI merge is still not performed. `sources/openapi_m2_5_dlq_replay_patch.yaml` remains proposal-only, and `sources/personal_project_openapi_v0_2.yaml` remains unchanged.

The route implementation now needs a post-wiring contract review before merging API contract surface into the main OpenAPI.

## Evidence Needed

- schema parity evidence for all CDC failure, state log, replay request, create, approve, and cancel schemas
- DTO mapper parity evidence against production route outputs
- error envelope parity evidence for safe 400/401/403/404/409/500 envelopes
- auth/role documentation parity for `readonly_role`, `operator`, `maintainer`, and `system_worker`
- versioning and changelog entry proposal
- API contract owner approval gate
- safety reviewer approval gate
- final merge approver gate

## Rollback / Deferral Strategy

If schema parity or safety review fails, defer main OpenAPI merge and keep the proposal patch separate. The route can remain stub-backed while contract gaps are corrected, as long as global safety remains green.

## Stop Conditions

- schema contains forbidden raw fields
- DTO output diverges from safe schema fields
- error response schema exposes raw values, stack traces, SQL details, or persistence internals
- auth role documentation allows mutation by under-scoped roles
- API contract owner, safety reviewer, or final merge approver is missing

## Explicit Boundaries

- main OpenAPI merge is still not performed
- M2-5 OpenAPI patch remains proposal-only
- main OpenAPI remains unchanged
- Aurora repository is still not implemented
- SQL apply is still forbidden
- external infrastructure commands are still forbidden

Next recommended task: explicit M2-8J OpenAPI merge readiness review with schema parity evidence. Do not merge yet.

M2-8J readiness review package reference: `docs/m2_8j_openapi_merge_readiness_review_kr.md`, `docs/m2_8j_schema_parity_evidence_kr.md`, `docs/m2_8j_openapi_merge_decision_record_kr.md`, and `scripts/validate_m2_8j_openapi_merge_readiness.py`. Validation passed with 69 PASS, 0 FAIL. The main OpenAPI remains unmerged.
