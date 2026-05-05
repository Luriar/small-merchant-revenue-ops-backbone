# M2-7 Non-Wired Skeleton Implementation

## Purpose

M2-7은 M2-6 handler/service/repository/DTO mapper contract를 바탕으로 non-wired JavaScript skeleton을 만든다.

This is proposal-only and not production rollout.

## Non-Goals

- live route wiring
- `server.js` route registration
- real DB queries
- AWS, Kafka, Debezium, ClickHouse 연결
- SQL apply
- OpenAPI patch merge
- runtime worker 구현
- raw data replay path

## Files Created

- `apps/api/src/cdc-recovery/cdc-recovery-errors.js`
- `apps/api/src/cdc-recovery/cdc-recovery-dto-mapper.js`
- `apps/api/src/cdc-recovery/cdc-recovery-service.js`
- `apps/api/src/cdc-recovery/cdc-recovery-repository.js`
- `apps/api/src/cdc-recovery/cdc-recovery-handler.js`
- `apps/api/src/cdc-recovery/index.js`
- `apps/api/src/cdc-recovery/cdc-recovery-dto-mapper.test.js`
- `apps/api/src/cdc-recovery/cdc-recovery-service.test.js`

## No Live Route Wiring

`server.js` is not modified. The skeleton exports factories and pure helpers only. It does not register M2-5 proposal routes.

## No DB/Kafka/ClickHouse Connection

Repository methods are interface-like stubs and throw `NotImplementedError`. No Aurora client, Kafka client, ClickHouse client, network client, or filesystem side effect is introduced.

## Safe DTO Mapping

DTO mapper enforces allowed response fields and recursively strips forbidden response fields.

Do-not-record rules:

- no raw payloads
- no full message bodies
- no issue title/body/payload/reporter values
- no prod_change payload/actor values
- no secrets
- no DB URLs
- no endpoints
- no tokens
- no passwords
- no raw connection strings

## Idempotency Helper Behavior

Service helper behavior:

- same `idempotency_key` and same normalized request intent returns duplicate decision with existing safe DTO
- same `idempotency_key` and different bounded scope or action returns `409`
- missing required fields return validation failure
- forbidden field leakage returns validation failure

## Repository Stub Boundary

Repository class exposes the M2-6 method names but performs no persistence. Future M2-8+ work must implement real repository queries behind this boundary only after route wiring and runtime approval gates are passed.

## Next-Step Options

1. Create M2-8 route wiring plan and explicit OpenAPI patch merge gate.
2. Add integration test plan before route registration.
3. Keep external infrastructure disabled until controlled dry-run approval.
