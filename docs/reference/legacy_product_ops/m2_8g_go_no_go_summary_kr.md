# M2-8G Go/No-Go Summary

## 1. Executive Go/No-Go Decision

Decision: GO for M2-8B test-only harness and route-level tests. NO-GO for production route wiring.

M2-8B may implement test-only harness and route-level tests, but must not register live production routes.

## 2. GO For

Approved next-step work:

- isolated test-only harness design
- in-memory/stub repository route tests
- safe CDC error adapter tests
- auth role mapping tests
- DTO mapper route-output tests
- OpenAPI proposal parity checks
- global safety scanner validation after test additions

## 3. NO-GO For

Not approved:

- production `server.js` route wiring
- main OpenAPI merge
- real DB queries
- Aurora connection
- SQL apply
- AWS/Kafka/Debezium/ClickHouse execution
- psql, kubectl, deployment, or other external infrastructure commands
- direct Aurora repository implementation
- raw payload/full message body capture
- issue raw values
- prod_change payload/actor values
- stack traces
- SQL details
- persistence internals

## 4. Required M2-8B Acceptance Criteria

M2-8B acceptance criteria:

- test-only harness exists and is clearly isolated from production `server.js`
- in-memory/stub repository required and used in route-level integration tests
- safe CDC error adapter required and tested
- auth role mapping tests cover `readonly_role`, `operator`, `maintainer`, and `system_worker`
- DTO mapper safety tests cover read and mutation outputs
- OpenAPI proposal parity required for all M2-5 CDC recovery routes
- global safety scanner required and passing
- auth missing safe 401 is tested
- safe 403 role denial is tested
- safe 400 validation is tested
- safe 404 not_found is tested
- safe 409 idempotency conflict is tested
- safe 409 invalid state transition is tested
- safe 500 internal_error is tested
- success and error outputs contain no raw payloads, no full message bodies, no issue raw values, no prod_change payload/actor values, no stack traces, no SQL details, and no persistence internals

## 5. M2-8B Stop Conditions

Stop M2-8B if any of these occur:

- live route wiring is introduced
- `server.js` modification is attempted
- `auth.js` modification is attempted outside an explicitly approved auth implementation task
- `error-response.js` modification is attempted outside an explicitly approved error implementation task
- cdc-recovery runtime module modification occurs outside the approved test-only harness scope
- OpenAPI main merge is attempted
- SQL apply is attempted
- external infrastructure commands are attempted
- real DB queries are introduced
- Aurora connection is introduced
- direct Aurora repository implementation starts before migration gates
- raw payloads, full message bodies, issue raw values, prod_change payload/actor values, stack traces, SQL details, or persistence internals appear in route outputs, fixtures, logs, or tests

## 6. Required Validation Commands Before and After M2-8B

Before and after M2-8B, run:

- `npm run validate:m2-8g:final-pre-wiring`
- `npm run validate:m2-8f-prep:route-tests`
- `npm run validate:m2-8e-prep:openapi-ownership`
- `npm run validate:m2-8d-prep:repository-strategy`
- `npm run validate:m2-8c-prep:error-envelope`
- `npm run validate:m2-8b-prep:auth-roles`
- `npm run validate:m2-8a:route-readiness`
- `npm run validate:m2-7:skeleton-contract`
- `npm run validate:m2:global-safety`
- `npm run test:m2-7:cdc-recovery`
- M2-8B route-level integration test command once added
- `git diff --check`
- `git status --short`

## 7. Explicit M2-8B Boundary

M2-8B may implement test-only harness and route-level tests, but must not register live production routes. Production `server.js` route wiring remains forbidden until route-level tests, safe DTO/error behavior, auth role mapping, OpenAPI proposal parity, global safety validation, and approval gates pass.
