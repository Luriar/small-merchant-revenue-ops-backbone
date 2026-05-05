# M2-8D Repository Strategy Decision Record

## Decision Summary

M2-8D-Prep accepts a staged repository strategy: M2-8B should use an explicit in-memory/stub repository for route-level integration tests first, and defer direct Aurora repository implementation until migration and controlled runtime gates are ready.

This task does not modify runtime repository behavior, `server.js`, `auth.js`, `error-response.js`, or `cdc-recovery-repository.js`.

## Accepted Repository Strategy

Accepted:

- route-level integration tests use in-memory/stub repository first
- stub implements the M2-6 repository contract
- stub simulates safe list/get, not found, idempotent duplicate, idempotency conflict, invalid state transition, approve/cancel transitions, and linkNewRunId future worker-only boundary
- direct Aurora repository is deferred until SQL migration review, rollback plan, OpenAPI ownership, route-level safety tests, and controlled runtime dry-run gates are complete
- repository output safe metadata only
- raw persistence errors must not propagate

## Rejected Alternatives

- Rejected: direct Aurora repository as the first route wiring step without gates. Reason: it couples route safety to migration and runtime risk.
- Rejected: repository returns raw records to route handlers. Reason: raw records can bypass DTO safety and expose unsafe values.
- Rejected: state transitions without state log append. Reason: recovery operations must remain traceable.
- Rejected: linkNewRunId as a human route action. Reason: linkNewRunId is future worker-only.
- Rejected: repository errors leak persistence internals. Reason: persistence failures must be normalized before API/log output.

## Why Direct Aurora Repository Should Not Be First Route Wiring Step Unless Gates Are Ready

Direct Aurora implementation requires migration review, rollback planning, safe persistence error normalization, data-shape validation, route-level DTO/error tests, and controlled runtime dry-run approval. Without those gates, route wiring can accidentally become a live data path or expose persistence internals.

## Why Stub/In-Memory Repository Is Acceptable For Route-Level Integration Tests

A stub/in-memory repository is acceptable because M2-8B first needs to prove route/auth/error/DTO behavior. It can simulate not found, idempotency duplicate, idempotency conflict, invalid state transition, approve/cancel transitions, and future worker-only linkNewRunId without real DB queries, Aurora connection, SQL apply, or external infrastructure commands.

## Why Raw Persistence Errors Must Not Propagate

Raw persistence errors may contain SQL details, stack traces, constraints with unsafe context, raw connection strings, DB URLs, or persistence internals. Future repository implementations must normalize these into safe not_found, idempotency_conflict, invalid_state_transition, worker boundary conflict, or internal_error outcomes.

## Why State Log Must Be Append-Only

Append-only state log preserves operational history and auditability. Updating or deleting prior state log rows would hide recovery decisions and break structured evidence-safe recovery operations.

## Why Original Failure/Run Must Remain Immutable

Original failure records preserve the observed failure history. Original run rows preserve processing history. Replay/reprocess must create future new run rows and link them through safe metadata instead of rewriting the original run or erasing the original failure cause.

## Future Revisit Conditions

Revisit this strategy only if:

- SQL migration review is complete
- migration/rollback plan exists
- OpenAPI patch merge ownership is resolved
- route-level safe DTO and safe error tests pass
- controlled runtime dry-run gate is approved
- repository output safe metadata only remains enforced
- no raw payloads, no full message bodies, no issue raw values, no prod_change payload/actor values, no stack traces, no SQL details, and no persistence internals remain enforced
