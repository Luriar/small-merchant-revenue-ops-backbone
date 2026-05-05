# M2-8O Aurora Repository Implementation

## Purpose And Non-Goals

M2-8O implements a mocked Aurora repository for CDC recovery using an injected DB client. It does not wire the repository into production routes and does not run live DB work.

Non-goals:

- no Aurora connection
- no real DB queries
- no SQL apply
- no external infrastructure commands
- no production DB
- no runtime dry-run
- no broad `server.js`, `auth.js`, or `error-response.js` rewrite

## Files Added

- `apps/api/src/cdc-recovery/cdc-recovery-aurora-repository.js`
- `apps/api/src/cdc-recovery/cdc-recovery-aurora-repository.test.js`
- `scripts/validate_m2_8o_aurora_repository.py`

## Repository Boundary

The repository:

- requires an injected DB client with `query(text, values)`
- optionally uses injected `withTransaction(work)` for transaction-aware writes
- creates no DB client
- imports no database driver
- handles no connection strings
- uses parameterized SQL only
- returns safe metadata projections only
- converts persistence failures to a redacted `CdcRecoveryPersistenceError`

## Implemented Methods

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

## Safety Rules

No raw payloads, no full message bodies, no issue raw values, no prod_change payload/actor values, no stack traces, no SQL details, no connection strings, and no persistence internals may be returned.

## Live Boundary

The repository is not live-wired. Production CDC routes remain stub-backed until a later explicit task passes M2-9 preflight, SQL apply, and controlled runtime gates.
