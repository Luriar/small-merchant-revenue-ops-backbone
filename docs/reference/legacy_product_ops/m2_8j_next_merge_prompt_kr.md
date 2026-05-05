# M2-8J Next Merge Prompt

Copy-paste prompt for a later explicit OpenAPI merge task:

```text
Goal:
Implement the explicit OpenAPI merge task after M2-8J readiness evidence has been reviewed and approved.

Read first:
- docs/m2_8j_openapi_merge_readiness_review_kr.md
- docs/m2_8j_schema_parity_evidence_kr.md
- docs/m2_8j_openapi_merge_decision_record_kr.md
- sources/openapi_m2_5_dlq_replay_patch.yaml
- sources/personal_project_openapi_v0_2.yaml
- apps/api/src/cdc-recovery/cdc-recovery-dto-mapper.js
- apps/api/src/cdc-recovery/cdc-recovery-production-routes.test.js

Allowed scope:
- merge sources/openapi_m2_5_dlq_replay_patch.yaml into sources/personal_project_openapi_v0_2.yaml only if readiness gates pass
- preserve the proposal patch file
- add changelog/version note
- add post-merge validator
- run the full validation chain

Required gates:
- production route tests pass
- DTO mapper parity reviewed
- error envelope parity reviewed
- auth/role documentation parity reviewed
- versioning/changelog prepared
- API contract owner approval recorded
- safety reviewer approval recorded
- final merge approver approval recorded
- global safety scanner passes

Forbidden scope:
- Aurora repository
- SQL apply
- external infrastructure
- real DB queries
- broad route refactor
- auth.js rewrite
- error-response.js rewrite
- raw field exposure
```
