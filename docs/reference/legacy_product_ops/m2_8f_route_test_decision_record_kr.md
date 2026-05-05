# M2-8F Route-Level Integration Test Decision Record

## Decision Summary

M2-8F accepts a contract-only route-level integration test strategy. M2-8B should start with an isolated test-only harness around CDC recovery handler/service/DTO mapper, a safe error adapter, and an explicit in-memory/stub repository. This is not live route wiring.

## Accepted Test Strategy

Accepted strategy:

- no `server.js` modification in M2-8F
- no `auth.js` modification in M2-8F
- no `error-response.js` modification in M2-8F
- no cdc-recovery runtime module modification in M2-8F
- no OpenAPI main merge in M2-8F
- use a test-only harness in M2-8B before live route registration
- use an in-memory/stub repository before live persistence
- test auth missing safe 401, safe 403 role denial, safe 400 validation, safe 404 not_found, safe 409 idempotency conflict, safe 409 invalid state transition, and safe 500 internal_error
- assert DTO mapper safety and schema parity against the M2-5 proposal patch
- run the global safety scanner after route tests are added

## Rejected Alternatives

Rejected alternative: wire `server.js` directly in M2-8F.

Reason: M2-8F is contract-only and must not register live routes or modify production runtime behavior.

Rejected alternative: use live Aurora persistence for first route-level tests.

Reason: direct Aurora repository remains deferred until migration review, rollback planning, safe DTO/error tests, OpenAPI ownership gates, and controlled runtime dry-run approval are ready.

Rejected alternative: test handler methods only without any route-like harness.

Reason: handler-only tests do not prove route parsing, auth adapter behavior, safe error adapter behavior, or proposal schema parity.

## Why server.js Must Not Be Wired in M2-8F

`server.js` must not be wired in M2-8F because the route-level safety contract has not yet been implemented and proven. Modifying `server.js` would convert a prep contract into production route wiring and could expose untested auth, error, DTO, and repository behavior.

## Why Stub Repository Is Required Before Live Persistence

The stub repository is required because route tests must prove HTTP/auth/error/DTO behavior without real DB queries, Aurora connection, SQL apply, external infrastructure commands, or persistence internals. It lets M2-8B simulate not found, idempotent duplicate, idempotency conflict, invalid state transition, approve/cancel, and future `linkNewRunId` boundary behavior safely.

## Why Auth/Error/DTO Behavior Must Be Tested Together

CDC recovery route safety is a cross-boundary property:

- auth must deny under-scoped roles before service mutation
- error envelopes must be redacted for expected and unknown failures
- DTO mapper safety must hold for success responses
- repository decisions must not bypass safe projection

Testing these separately is not enough to prove route-level integration behavior.

## Why Mutation Routes Require Stricter Tests Than Read Routes

Mutation routes create replay/reprocess intent or approve/cancel recovery state. They require stricter assertions for maintainer-only approve/cancel, operator approve/cancel denial, readonly_role mutation denial, idempotency conflict safe 409, invalid state transition safe 409, evidence_report_ref requirements, state log append-only expectation, original failure immutable, and original run immutable.

## Future Revisit Conditions

Revisit this decision only when:

- route-level integration tests pass with the test-only harness
- auth role mapping implementation is complete and tested
- CDC safe error adapter implementation is complete and tested
- DTO mapper parity and schema parity pass
- global safety validation passes
- API contract owner, safety reviewer, and final merge approver approve the next step
- direct Aurora repository migration and rollback gates are ready for a later persistence task
