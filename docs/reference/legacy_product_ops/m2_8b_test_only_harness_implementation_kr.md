# M2-8B Test-Only Harness Implementation

## Purpose and Non-Goals

Purpose: M2-8B implements an isolated test-only harness and route-level integration tests for CDC recovery behavior. The harness proves auth role mapping, safe CDC error adapter behavior, DTO mapper safety, in-memory/stub repository behavior, OpenAPI proposal parity, and mutation route stricter approval without making CDC routes reachable from production.

Non-goals:

- no live route wiring
- no production `server.js` route registration
- no `server.js` modification
- no `auth.js` modification
- no `error-response.js` modification
- no main OpenAPI merge
- no real DB queries
- no Aurora connection
- no SQL apply
- no AWS, Kafka, Debezium, ClickHouse, psql, kubectl, deployment, or external infrastructure commands
- no direct Aurora repository implementation
- no raw payloads
- no full message bodies
- no issue raw values
- no prod_change payload/actor values
- no stack traces
- no SQL details
- no persistence internals
- no compared request bodies
- no compared idempotency values

## Files Added

- `apps/api/src/cdc-recovery/test-support/cdc-recovery-test-harness.js`
- `apps/api/src/cdc-recovery/test-support/cdc-recovery-stub-repository.js`
- `apps/api/src/cdc-recovery/test-support/cdc-recovery-test-error-adapter.js`
- `apps/api/src/cdc-recovery/test-support/cdc-recovery-test-auth.js`
- `apps/api/src/cdc-recovery/cdc-recovery-route-level.test.js`
- `scripts/validate_m2_8b_test_only_harness.py`
- `docs/m2_8b_test_only_harness_implementation_kr.md`

## Test-Only Harness Architecture

The harness exposes `createCdcRecoveryTestHarness()` and `dispatchTestRoute({ method, path, role, routeParams, input })`.

Architecture:

- route matching is local to the test-only harness
- CDC route strings map to `createCdcRecoveryHandler()` methods
- auth is simulated with safe role labels only
- role checks happen before service mutation
- success outputs are passed through safe DTO mapper functions
- expected CDC errors are converted to safe envelopes
- unknown errors return safe 500 `internal_error`
- the harness does not import `server.js`
- the harness does not register global routes

## Stub Repository Behavior

The in-memory/stub repository implements the M2-6 repository contract methods:

- `listFailures(filter, page)`
- `getFailureById(failureId)`
- `listFailureStateLog(failureId, page)`
- `listReplayRequests(filter, page)`
- `getReplayRequestById(replayRequestId)`
- `findReplayRequestByIdempotencyKey(idempotencyKey)`
- `createReplayRequest(input)`
- `appendFailureStateLog(input)`
- `updateFailureStatus(failureId, transition)`
- `updateReplayRequestStatus(replayRequestId, transition)`
- `linkNewRunId(replayRequestId, newRunId)`

It simulates safe list/get behavior, not found, create replay request success, exact idempotent duplicate, idempotency conflict, invalid state transition, approve/cancel state transitions, state log append observation, original failure immutable observation, original run immutable observation, unknown internal error path, and `linkNewRunId` as future worker-only.

The stub returns safe metadata only and does not use real DB queries, filesystem state, network, or infrastructure.

## Safe Error Adapter Behavior

The safe CDC error adapter maps:

- safe 400 `validation_error`
- safe 401 `unauthorized`
- safe 403 `forbidden`
- safe 404 `not_found`
- safe 409 `idempotency_conflict`
- safe 409 `invalid_state_transition`
- safe 500 `internal_error`

Error envelopes do not include raw details, stack traces, SQL details, persistence internals, compared values, or unsafe field values. 401 and 403 remain auth-layer concerns in the test harness.

## Auth Role Mapping Test Coverage

Route-level tests cover:

- auth missing safe 401
- `readonly_role` can read
- `readonly_role` cannot mutate and returns safe 403
- `operator` can create replay request
- `operator` cannot approve/cancel and returns safe 403
- `maintainer` can approve/cancel
- `system_worker` cannot create arbitrary replay request

## DTO Mapper Safety Coverage

Route-level tests assert DTO mapper safety for:

- failure list
- failure detail
- failure state log
- replay request list
- replay request detail
- create replay request output
- approve/cancel output
- every success response
- every error response

The local forbidden-key scanner checks route outputs for no raw payloads, no full message bodies, no issue raw values, no prod_change payload/actor values, no stack traces, no SQL details, and no persistence internals.

## OpenAPI Proposal Parity Coverage

The route-level tests use `sources/openapi_m2_5_dlq_replay_patch.yaml` as the route-test reference only. Tests assert the proposal-only marker remains present and check safe field-level parity against DTO mapper field sets where practical.

The main OpenAPI was not merged.

## Production Wiring Boundary

`server.js` production route wiring was not added. The harness is test-only and isolated under `apps/api/src/cdc-recovery/test-support/`. CDC routes are not reachable from the production server.

## Runtime and Infrastructure Boundary

No real DB queries, Aurora connection, SQL apply, AWS, Kafka, Debezium, ClickHouse, psql, kubectl, deployment, or external infrastructure command was used. The repository is an in-memory/stub repository for tests only.

## Remaining Next Step After M2-8B

After M2-8B passes validation, the next step is a review gate for whether production route wiring can begin. Production wiring should remain blocked until the test-only harness results, auth role behavior, safe error adapter behavior, DTO mapper safety, OpenAPI proposal parity, and global safety scanner are reviewed.
