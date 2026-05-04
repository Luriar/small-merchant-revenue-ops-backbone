# M2-8J OpenAPI Merge Decision Record

## Decision Summary

M2-8J marks future OpenAPI merge as conditionally ready, not automatically ready. M2-8J does not merge `sources/openapi_m2_5_dlq_replay_patch.yaml` into `sources/personal_project_openapi_v0_2.yaml`.

## Accepted Readiness Decision

Accepted:

- use M2-8I route registration tests as route coverage evidence
- use DTO mapper field sets as safe output evidence
- use M2-5 proposal patch as future merge source
- keep proposal patch proposal-only in M2-8J
- require schema parity reconciliation before merge
- require API contract owner gate
- require safety reviewer gate
- require final merge approver gate
- require global safety scanner before future OpenAPI merge

## Rejected Alternatives

Rejected: perform OpenAPI merge in M2-8J.

Reason: M2-8J is readiness review only, and schema parity gaps plus approval gates remain.

Rejected: treat route wiring success as sufficient merge approval.

Reason: route tests prove runtime behavior, but OpenAPI merge also requires contract ownership, schema parity, versioning/changelog, redaction review, and final approval.

Rejected: merge mutation routes without stricter review.

Reason: create/approve/cancel routes are state-changing and must preserve maintainer-only approval, idempotency conflict safety, invalid state transition safety, and evidence-safe responses.

## Why Merge Is Not Performed in M2-8J

M2-8J must not modify the main OpenAPI. The proposal file remains separate so schema corrections and approval gates can be reviewed before contract surface changes.

## Why Route Wiring Passing Does Not Automatically Authorize OpenAPI Merge

M2-8I tests prove route reachability, auth behavior, error safety, DTO safety, and proposal marker preservation. They do not record API contract owner approval, safety reviewer approval, final merge approval, versioning/changelog, or full schema reconciliation.

## Why Mutation Routes Need Stricter Merge Review

Mutation routes can create, approve, or cancel replay requests. Under-scoped access or unsafe schema examples could create evidence-safety risk. Future merge must verify `operator` cannot approve/cancel, `maintainer` is required for approve/cancel, `system_worker` cannot create arbitrary replay requests, and 409 responses remain redacted.

## Why Approval Gates Remain Required

API contract owner, safety reviewer, and final merge approver remain required because OpenAPI merge changes the published API contract. Each gate protects a different boundary: schema ownership, evidence-safe redaction, and release control.

## Future Revisit Conditions

Revisit when:

- schema parity gaps are resolved
- safe error schema is explicit
- versioning/changelog is ready
- production route tests remain green
- global safety scanner passes
- API contract owner approval is recorded
- safety reviewer approval is recorded
- final merge approver approval is recorded
