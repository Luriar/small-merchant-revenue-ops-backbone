# M2-8E OpenAPI Merge Decision Record

## Decision Summary

M2-8E accepts a deferred OpenAPI main merge. The M2-5 patch remains proposal-only and separate. M2-8B should use `sources/openapi_m2_5_dlq_replay_patch.yaml` as the route-level integration test reference, not as an automatically merged contract.

This task does not modify the main OpenAPI, `server.js`, `auth.js`, `error-response.js`, or cdc-recovery runtime modules.

## Accepted Merge Ownership Model

Accepted ownership:

- API contract owner owns schema naming, path shape, versioning, and changelog.
- route implementation owner owns route behavior and route-level tests.
- security/safety reviewer owns raw-field exclusion, role gates, error redaction, and safe DTO parity review.
- product/ops reviewer owns workflow and recovery usability review.
- final merge approver owns the final main OpenAPI merge decision.

## Accepted Merge Gate

Accepted gate: do not merge the OpenAPI patch before route-level integration tests.

Main OpenAPI merge is allowed only after:

- M2-8B route-level integration tests pass
- auth role mapping implementation is tested
- CDC error envelope adapter implementation is tested
- in-memory/stub repository route tests pass
- DTO mapper response fields match schemas
- global safety scanner passes
- API contract owner approves
- safety reviewer approves
- final merge approver approves

## Rejected Alternatives

- Rejected: merge the whole proposal before route-level tests. Reason: main OpenAPI would document behavior not yet proven safe.
- Rejected: merge mutation routes under the same gate as read routes. Reason: mutation routes create or change recovery state and require stricter approval.
- Rejected: merge schemas without DTO mapper parity. Reason: schema drift can expose fields not projected safely by DTOs.
- Rejected: merge error schemas without redaction review. Reason: error contracts can become leakage surfaces.

## Why OpenAPI Main Merge Must Not Happen Before Route-Level Tests

The main OpenAPI is a public implementation contract. Merging before route-level tests would imply live behavior before auth, error, DTO, and stub repository boundaries are proven together. The proposal patch should remain the test reference until route-level evidence exists.

## Why Mutation Routes Require Stricter Approval Than Read Routes

Mutation routes create replay/reprocess requests or approve/cancel recovery state. They require maintainer-only approval gates, evidence_report_ref checks, idempotency conflict behavior, invalid state transition behavior, and safe state mutation review. Read routes can be considered separately only if documented as read-only and safe metadata only.

## Why Schema Parity Must Be Checked Against DTO Mapper Output

DTO mapper output is the response safety boundary. OpenAPI schemas must match safe DTO fields so the contract cannot promise raw data, unreviewed fields, or persistence internals. Any mismatch must be resolved in the proposal before main merge.

## Why Error Response Schemas Must Remain Redacted

Error schemas must not expose raw payloads, full message bodies, issue raw values, prod_change payload/actor values, stack traces, SQL details, compared values, or persistence internals. Redaction parity must be tested before merge.

## Future Revisit Conditions

Revisit this decision only when:

- route-level integration tests pass
- auth role mapping implementation passes
- CDC safe error adapter implementation passes
- stub repository route tests pass
- DTO mapper parity is verified
- error envelope redaction parity is verified
- global safety scanner passes
- API contract owner, safety reviewer, and final merge approver approve
