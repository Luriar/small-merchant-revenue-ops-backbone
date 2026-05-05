# M2-8D-Prep CDC Recovery Repository Strategy

## 1. Purpose and Non-Goals

Purpose: M2-8B live route wiring 전에 CDC recovery repository strategy를 contract로 확정한다. Repository boundary는 Aurora source-of-truth 방향을 유지하되, route-level integration tests가 raw data dump path나 external infrastructure dependency가 되지 않도록 단계화한다.

Non-goals:

- not live route wiring
- no `server.js` modification
- no `auth.js` modification
- no `error-response.js` modification
- no runtime repository implementation change
- no production runtime behavior change
- no real DB queries
- no Aurora connection
- no OpenAPI main merge
- no SQL apply
- no AWS, Kafka, Debezium, ClickHouse, psql, kubectl, deployment, or external infrastructure commands
- no raw payloads
- no full message bodies
- no issue raw values
- no prod_change payload/actor values
- no stack traces
- no SQL details
- no persistence internals

## 2. Current M2-7 Repository Skeleton Summary

`apps/api/src/cdc-recovery/cdc-recovery-repository.js` currently defines:

- `NotImplementedError`
- `CdcRecoveryRepository`
- `createCdcRecoveryRepository()`

The skeleton lists the M2-6 repository method names and intentionally throws `NotImplementedError` for every method. It has no real DB queries, no Aurora connection, no SQL apply behavior, and no external infrastructure dependency.

## 3. Proposed Aurora Source-of-Truth Repository Boundary

Aurora remains the operational source of truth for CDC recovery state. The future repository boundary should wrap the M2-4 proposed tables:

- `public.cdc_failure`
- `public.cdc_replay_request`
- `public.cdc_failure_state_log`

The repository output must be safe metadata only and must be handed to service/DTO mapper boundaries without raw values. ClickHouse, Kafka, Debezium, and DLQ transport context remain read-model or transport layers, not the operational source of truth.

## 4. Repository Implementation Options

Option A: direct Aurora repository implementation in M2-8B.

- Pros: closer to production behavior.
- Cons: requires migration review, rollback plan, integration-test gates, safe persistence error normalization, and controlled runtime approval before it should be trusted.

Option B: route-level integration tests using in-memory/stub repository first.

- Pros: exercises route/auth/error/DTO behavior without real DB queries or external infrastructure.
- Cons: does not prove Aurora SQL behavior.

Option C: split route wiring into stub-backed route test first, then Aurora-backed repository later.

- Pros: separates route contract safety from persistence rollout risk.
- Cons: requires an explicit follow-up for the live repository implementation.

## 5. Recommended Decision

Recommended decision: use Option C.

M2-8B should first wire route-level integration tests against an explicit in-memory/stub repository implementation, not a live Aurora repository. The stub must implement the M2-6 repository contract and simulate:

- safe list/get behavior
- not found
- idempotency duplicate
- idempotency conflict
- invalid state transition
- approve/cancel state transitions
- linkNewRunId boundary as future worker-only

Direct Aurora repository is deferred until:

- SQL migration review is complete
- migration/rollback plan exists
- OpenAPI patch merge ownership is resolved
- route-level safe DTO and error tests pass
- controlled runtime dry-run gate is approved

## 6. Method-to-Table Mapping

| Repository Method | Source/Proposed Table | Read/Write | Transaction Required | Append State Log | Idempotency Concern | Safe Output Requirement | Forbidden Behavior |
|---|---|---|---|---|---|---|---|
| `listFailures(filter, page)` | `public.cdc_failure` | read | no | no | no | safe failure summary metadata only | raw records, raw payloads, full message bodies |
| `getFailureById(failureId)` | `public.cdc_failure` | read | no | no | no | safe failure detail metadata only | raw record details beyond DTO fields |
| `listFailureStateLog(failureId, page)` | `public.cdc_failure_state_log` | read | no | no | no | safe state log metadata only | mutable history view or raw reason details |
| `listReplayRequests(filter, page)` | `public.cdc_replay_request` | read | no | no | no | safe replay request summary metadata only | raw bounded values or persistence internals |
| `getReplayRequestById(replayRequestId)` | `public.cdc_replay_request` | read | no | no | no | safe replay request detail metadata only | raw record dump |
| `findReplayRequestByIdempotencyKey(idempotencyKey)` | `public.cdc_replay_request` | read | no | no | yes | safe replay request metadata only | exposing compared idempotency values |
| `createReplayRequest(input)` | `public.cdc_replay_request`, `public.cdc_failure`, `public.cdc_failure_state_log` | write | yes | yes | yes | safe replay request metadata only | creating without evidence_report_ref or idempotency_key |
| `appendFailureStateLog(input)` | `public.cdc_failure_state_log` | write | yes when paired with state change | yes | no | safe state log metadata only | update/delete of prior state log rows |
| `updateFailureStatus(failureId, transition)` | `public.cdc_failure`, `public.cdc_failure_state_log` | write | yes | yes | no | safe failure status metadata only | mutating original failure cause metadata |
| `updateReplayRequestStatus(replayRequestId, transition)` | `public.cdc_replay_request`, `public.cdc_failure_state_log` | write | yes | yes | no | safe replay request status metadata only | invalid state transition without safe 409 |
| `linkNewRunId(replayRequestId, newRunId)` | `public.cdc_replay_request` | write | yes | yes | no | safe new_run_id linkage metadata only | creating run rows or running as human action |

## 7. Transaction Boundary Rules

- Create replay request must be transactional across replay request creation, failure status transition, and state log append.
- Approve/cancel must be transactional across replay request status update, failure status update where applicable, and state log append.
- Future worker linkNewRunId must be transactional with the replay request linkage and state log append.
- Read-only list/get operations should not require explicit transactions unless the future implementation needs a consistent snapshot.
- Persistence errors must be normalized into safe domain errors before reaching route responses.

## 8. State Log Append-Only Rules

State log append-only means:

- `cdc_failure_state_log` rows are inserted, never updated or deleted by application code.
- state changes must append safe reason codes and safe metadata only.
- state log append must happen in the same transaction as the state update that caused it.
- missing state log append is a stop condition for mutation routes.

## 9. Idempotency Lookup and Conflict Rules

- `findReplayRequestByIdempotencyKey(idempotencyKey)` is a safe lookup boundary.
- same idempotency key and same normalized request returns the existing safe replay request.
- same idempotency key with different normalized intent returns safe 409 idempotency conflict.
- conflict responses must not expose compared request values, compared idempotency values, raw record details, or persistence internals.
- unique idempotency enforcement belongs in both service logic and future Aurora constraints.

## 10. New Run Row / linkNewRunId Rules

- `linkNewRunId(replayRequestId, newRunId)` is future worker-only.
- linkNewRunId must not create the new run row.
- linkNewRunId may only attach a future worker-created new run row to an approved/running recovery request.
- original run immutable remains mandatory.
- replay/reprocess must not mutate original run.

## 11. Original Failure/Run Immutability Rules

- original failure immutable means root failure identity, observed metadata, parser class, and original cause metadata are preserved.
- repository may update only contract-approved status/linkage fields and must append state log.
- original run immutable means retry/reprocess never updates the original run row.
- future recovery execution always creates and links a new run row.

## 12. Safe Projection / DTO Handoff Rules

- repository output safe metadata only.
- service must pass repository records through DTO mapper safe projection before route output.
- repository must not return raw payloads, full message bodies, issue raw values, prod_change payload/actor values, stack traces, SQL details, raw connection strings, or persistence internals.
- field-name sets are allowed as names only, never values.
- `evidence_report_ref` may be returned only as a safe reference string.

## 13. Persistence Error Normalization Rules

- raw persistence errors must not propagate.
- repository errors should be converted to safe domain categories such as not_found, idempotency_conflict, invalid_state_transition, or internal_error.
- 500 internal_error must not expose stack traces, SQL details, raw connection strings, constraints with unsafe context, or persistence internals.
- logs must not reveal raw values.

## 14. Repository Test Strategy

M2-8B should add route-level integration tests with an explicit in-memory/stub repository first. The stub should cover:

- safe list/get results
- not found
- replay request created
- idempotent duplicate
- idempotency conflict
- invalid state transition
- replay request approved
- replay request cancelled
- linkNewRunId future worker-only boundary

Aurora-backed repository tests should wait until SQL migration review, rollback plan, safe error normalization, and controlled dry-run gates are approved.

## 15. Stop Conditions

Stop M2-8B route wiring if any of these occur:

- live route wiring attempted in this prep step
- `server.js` modification attempted
- `auth.js` modification attempted
- `error-response.js` modification attempted
- `cdc-recovery-repository.js` runtime implementation modified in this prep step
- real DB queries introduced
- Aurora connection introduced
- OpenAPI main merge attempted
- SQL apply attempted
- external infrastructure command attempted
- direct Aurora repository implemented before migration gate
- repository output safe metadata only rule is broken
- state log append-only rule is broken
- original failure immutable rule is broken
- original run immutable rule is broken
- idempotency conflict does not return safe 409
- invalid state transition does not return safe 409
- linkNewRunId is not future worker-only
- raw payloads exposed
- full message bodies exposed
- issue raw values exposed
- prod_change payload/actor values exposed
- stack traces exposed
- SQL details exposed
- persistence internals exposed

## 16. Decision: Ready / Not Ready for M2-8B Route Wiring

Decision: repository strategy is ready as a contract input, but M2-8B route wiring remains not ready.

Accepted repository strategy: M2-8B should use an explicit in-memory/stub repository first for route-level integration tests, while deferring direct Aurora repository implementation until migration, rollback, OpenAPI ownership, safe DTO/error test, and controlled runtime dry-run gates are ready.

## 17. Remaining Blockers After Repository Strategy

Repository strategy blocker is resolved at contract level only. Remaining blockers:

- OpenAPI patch merge ownership
- route-level integration tests
- future implementation of the auth mapping
- future implementation of the CDC safe error adapter
- future Aurora repository implementation after migration gate

Next blocker reference: M2-8E-Prep in `docs/m2_8e_prep_openapi_merge_ownership_kr.md` addresses OpenAPI patch merge ownership at contract level only. Route wiring remains blocked until route-level integration tests are resolved.
