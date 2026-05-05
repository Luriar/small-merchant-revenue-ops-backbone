# M2-8M OpenAPI Merge Decision Record

## Decision Summary

M2-8M accepts the explicit merge of the CDC recovery API contract into `sources/personal_project_openapi_v0_2.yaml`.

## Accepted Merge Decision

The main OpenAPI now includes CDC recovery paths, safe metadata DTO schemas, role documentation, and CDC-specific redacted error envelope schemas. The merge is bounded to API contract documentation only.

## Rejected Alternatives

- Copy the proposal patch without parity changes: rejected because M2-8J identified runtime DTO naming and field width gaps.
- Keep the main OpenAPI unchanged after production route wiring: rejected because M2-8I made the routes reachable through production dispatch.
- Merge OpenAPI and direct Aurora repository together: rejected because persistence requires its own migration, rollback, and runtime gates.

## Why M2-8M Performs OpenAPI Merge But Not Aurora Repository

M2-8M closes the API contract gap created by M2-8I production route wiring. Aurora repository implementation remains separate because it changes persistence behavior and requires review of migration safety, transaction boundaries, rollback, and controlled runtime entry.

## Why Runtime DTO Output Is The Contract Anchor

The current production route tests prove safe output through the DTO mapper. The main OpenAPI therefore follows the emitted safe DTO field sets rather than proposal-only fields that runtime does not emit.

## Why Proposal-Only File Is Preserved

`sources/openapi_m2_5_dlq_replay_patch.yaml` remains proposal-only history for auditability. It records the original M2-5 contract proposal and can be compared against the accepted main OpenAPI merge.

## Why Mutation Routes Need Stricter Role Documentation

Replay creation, approval, and cancellation mutate recovery state. The merged OpenAPI documents that `operator` may create requests, approve/cancel remains maintainer-only, `readonly_role` cannot mutate, and `system_worker` cannot create arbitrary human replay requests.

## Future Revisit Conditions

Revisit this contract if:

- Aurora-backed repository output differs from current safe DTO projections
- route tests identify schema drift
- error envelope behavior changes
- auth role mapping changes
- controlled runtime dry-run introduces new safe metadata fields

Any future change must preserve no raw payloads, no full message bodies, no issue raw values, no prod_change payload/actor values, no stack traces, no SQL details, and no persistence internals.
