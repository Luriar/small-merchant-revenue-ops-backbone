# M2-8 Runtime Handler Route Wiring Plan

## Purpose

M2-8은 M2-7 non-wired skeleton을 live API route로 연결하기 전에 필요한 decision gate와 implementation order를 계획한다. This is planning only, proposal-only, and not production rollout.

## Route Wiring Strategy

1. Keep `apps/api/src/cdc-recovery/` as the module boundary.
2. Add route matching in `server.js` only after approval.
3. Reuse existing request context, logger, metrics, and error-response patterns.
4. Route handler must call auth/role checks before service mutation.
5. All responses must flow through DTO mapper safe outputs.

Planned routes:

- `GET /api/v1/cdc/failures`
- `GET /api/v1/cdc/failures/{failure_id}`
- `GET /api/v1/cdc/failures/{failure_id}/state-log`
- `POST /api/v1/cdc/failures/{failure_id}/replay-requests`
- `GET /api/v1/cdc/replay-requests`
- `GET /api/v1/cdc/replay-requests/{replay_request_id}`
- `POST /api/v1/cdc/replay-requests/{replay_request_id}/approve`
- `POST /api/v1/cdc/replay-requests/{replay_request_id}/cancel`

## OpenAPI Patch Merge Decision Gate

Do not merge `sources/openapi_m2_5_dlq_replay_patch.yaml` until:

- M2-6 and M2-7 validators pass.
- route ownership is approved.
- role model is reviewed.
- safe response fields match DTO mapper output.
- error envelope matrix is reviewed.
- global raw-field safety scanner passes if available.

## Repository Implementation Strategy

1. Implement repository behind `CdcRecoveryRepository` method names only.
2. Use Aurora as operational source of truth.
3. Keep ClickHouse/Kafka/DLQ records as read-model or transport context only.
4. Store only safe metadata and IDs.
5. `appendFailureStateLog(input)` must append safe state history.
6. `linkNewRunId(replayRequestId, newRunId)` must only run after a future worker creates a new run row.
7. Do not mutate original run.
8. Do not rewrite original failure root metadata.

## Auth / Role Enforcement

- read actions: `readonly_role`, `operator`, `maintainer`
- create replay request: `operator`, `maintainer`
- approve/cancel: `maintainer`
- future execution status updates: `system_worker`

Role checks must happen before service mutation. Authorization failures must not reveal raw values.

## Integration Tests

Required before live route enablement:

- auth `401` and `403`
- list failure success path with safe DTO
- failure detail not found `404`
- create replay request validation `400`
- idempotent duplicate `200`
- new request `201`
- idempotency conflict `409`
- invalid state transition `409`
- approve/cancel maintainer gate
- recursive DTO stripping test at route level

## External Infra Gate

No AWS, psql, kubectl, Kafka, Debezium, ClickHouse, replication slot, SQL apply, or deployment command is allowed until controlled dry-run approval.

## Migration Path From Skeleton To Live Route

1. Freeze M2-8 plan review.
2. Merge OpenAPI patch only if approved.
3. Implement repository with local tests and no external execution.
4. Add route matching behind explicit feature flag or config gate.
5. Add integration tests with in-memory or stub repository.
6. Enable live route only after validation and review.

## Rollback Plan

- Keep M2-7 skeleton import isolated.
- Revert route registration only if needed; repository and mapper contracts remain reusable.
- Disable feature flag/config gate if route behavior is unsafe.
- Preserve failure and replay records; do not delete evidence or state history.
- Record cleanup/evidence report linkage after rollback decision.

## Stop Conditions

- forbidden field leakage
- missing `idempotency_key`
- missing `evidence_report_ref`
- replay without new run row plan
- original failure mutation
- original run mutation
- raw data replay by default
- OpenAPI patch merge without review
- SQL proposal applied without approval
