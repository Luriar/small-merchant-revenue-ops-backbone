# M2-8H Route Wiring Decision Record

## Decision Summary

M2-8H marks M2-8I as conditionally ready for a separate production route wiring task. M2-8H itself does not implement production route wiring and does not modify `server.js`, `auth.js`, `error-response.js`, cdc-recovery runtime modules, or the main OpenAPI.

## Accepted Route Wiring Readiness Decision

Accepted decision:

- M2-8I may be scoped as production route registration behind explicit tests only.
- M2-8I may modify `server.js` only to register CDC recovery routes through an isolated route factory.
- M2-8I may add a CDC route module/factory if needed.
- M2-8I must preserve M2-8B test-only harness and route-level tests.
- M2-8I must add production route registration tests.
- M2-8I must continue using the in-memory/stub repository for tests.
- M2-8I must use safe error adapter behavior only.
- M2-8I must preserve auth role behavior and DTO safety.
- M2-8I must keep the M2-5 OpenAPI patch proposal-only.

## Rejected Alternatives

Rejected alternative: implement production route wiring in M2-8H.

Reason: M2-8H is a readiness review only and must not perform live route wiring.

Rejected alternative: merge the main OpenAPI with route wiring.

Reason: main OpenAPI merge remains separate until route wiring tests, DTO safety, error redaction, auth role behavior, API contract owner approval, safety review, and final merge approval pass.

Rejected alternative: implement direct Aurora repository together with route wiring.

Reason: direct Aurora repository remains separate and requires migration review, rollback strategy, controlled runtime gate, and persistence-specific tests.

Rejected alternative: broadly refactor `server.js`.

Reason: production route wiring should be a minimal isolated route factory call, not a broad dispatch rewrite.

## Why Production server.js Wiring Must Be Separate From M2-8B

M2-8B proved CDC behavior inside a test-only harness. It intentionally did not prove production `server.js` dispatch, current auth policy integration, shared request logging, or production route registration. Production route wiring changes runtime behavior and therefore must be isolated as M2-8I with explicit scope and tests.

## Why M2-8I May Modify server.js Only Under Explicit Scope

`server.js` is the production request dispatch entrypoint. M2-8I may modify it only to register CDC recovery routes through an isolated route factory. Any broader change increases risk to existing intake, run, trace, issue, dashboard, retry, and reprocess routes.

## Why Main OpenAPI Merge Remains Separate

The M2-5 OpenAPI patch remains proposal-only. M2-8I should prove production route registration behavior first. Main OpenAPI merge remains separate because schema ownership, versioning, changelog, safety review, and final merge approval are contract-level gates beyond route registration.

## Why Direct Aurora Repository Remains Separate

M2-8D decided direct Aurora repository should not be the first production route step. M2-8I must continue with an in-memory/stub repository for tests and must not implement real DB queries, Aurora connection, SQL apply, or persistence internals.

## Why Auth/Error Integration Must Be Minimal and Tested

Auth and error integration are safety boundaries. M2-8I must keep auth integration minimal and tested so that readonly users cannot mutate, operators cannot approve/cancel, maintainer-only approve/cancel is enforced, and system_worker remains isolated. Safe error adapter behavior must be tested so 400/401/403/404/409/500 responses do not expose raw values, stack traces, SQL details, or persistence internals.

## Future Revisit Conditions

Revisit this decision if:

- M2-8I production route registration tests cannot pass without broad `server.js` refactor
- `auth.js` or `error-response.js` requires non-minimal changes
- M2-5 OpenAPI proposal parity changes
- direct Aurora repository becomes necessary before route registration
- any raw payloads, full message bodies, issue raw values, prod_change payload/actor values, stack traces, SQL details, or persistence internals appear in outputs or logs
