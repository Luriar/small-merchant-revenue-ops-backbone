# M2-8I Production CDC Recovery Route Wiring Implementation

## Purpose and Non-Goals

Purpose: M2-8I는 M2-8H 조건부 승인 범위 안에서 CDC recovery route를 production `server.js` dispatch path에 최소 등록한다. 이 단계는 route registration과 route-level production path test만 수행하며, production persistence를 구현하지 않는다.

Non-goals:

- main OpenAPI merge 없음
- `sources/personal_project_openapi_v0_2.yaml` 수정 없음
- direct Aurora repository 구현 없음
- real DB queries 없음
- Aurora connection 없음
- SQL apply 없음
- AWS, Kafka, Debezium, ClickHouse, psql, kubectl, deployment, external infrastructure commands 없음
- broad `server.js` rewrite 없음
- `auth.js` 수정 없음
- `error-response.js` 수정 없음
- raw payloads 노출 없음
- full message bodies 노출 없음
- issue raw values 노출 없음
- prod_change payload/actor values 노출 없음
- stack traces 노출 없음
- SQL details 노출 없음
- persistence internals 노출 없음
- compared request bodies 또는 compared idempotency values 노출 없음

## Files Added/Modified

Added:

- `apps/api/src/cdc-recovery/cdc-recovery-routes.js`
- `apps/api/src/cdc-recovery/cdc-recovery-production-routes.test.js`
- `scripts/validate_m2_8i_production_route_wiring.py`
- `docs/m2_8i_production_route_wiring_implementation_kr.md`

Modified:

- `apps/api/src/server.js`
- `package.json`

`auth.js`, `error-response.js`, cdc-recovery handler/service/DTO/repository modules, main OpenAPI, SQL, Terraform, and external infrastructure files are not modified by M2-8I.

## Exact server.js Change Summary

`server.js` change is intentionally minimal:

- imports `createCdcRecoveryRouteDispatcher` from `apps/api/src/cdc-recovery/cdc-recovery-routes.js`
- accepts optional `cdcRecoveryRoutes` injection for production route registration tests
- creates a default CDC route dispatcher with current `env` and existing `startupConfig.authConfig`
- passes the dispatcher into `dispatchRequest`
- adds one dispatch block:
  - if `cdcRecoveryRoutes.matches(request)` is true, call `cdcRecoveryRoutes.handle(request, response)`

No existing non-CDC route branch is rewritten. Existing health/readiness/intake/run/trace/issue/retry/reprocess dispatch order is otherwise preserved.

## Isolated Route Factory Summary

`cdc-recovery-routes.js` is the isolated CDC route factory/dispatcher. It keeps CDC concerns outside the main server dispatch body:

- route matching stays isolated through the M2-8B route matcher
- request parsing stays local to CDC routes
- safe CDC error conversion stays local to CDC routes
- success responses stay safe DTO outputs
- route dispatch uses `createCdcRecoveryHandler`
- route behavior remains backed by the explicit in-memory/stub repository boundary

The factory exports `createCdcRecoveryRouteDispatcher()` and can accept a stub repository injection for production route registration tests.

## Auth Behavior Summary

M2-8I does not modify `auth.js`.

CDC route auth is handled by a narrow route-local adapter:

- missing auth returns safe 401 `unauthorized`
- `readonly_role` can read CDC failure and replay metadata
- `readonly_role` cannot mutate and returns safe 403 `forbidden`
- `operator` can create replay requests
- `operator` cannot approve/cancel and returns safe 403 `forbidden`
- `maintainer` can approve/cancel
- `system_worker` cannot create arbitrary replay requests

The adapter supports M2-specific bearer credentials through CDC role env names and preserves the M2-8B compatibility rule by mapping existing `viewer` to `readonly_role` and existing `operator` to `operator` when the shared auth config already recognizes those credentials.

## Safe Error Adapter Summary

M2-8I does not modify `error-response.js`.

The CDC dispatcher uses CDC-safe error mapping:

- safe 400 `validation_error`
- safe 401 `unauthorized`
- safe 403 `forbidden`
- safe 404 `not_found`
- safe 409 `idempotency_conflict`
- safe 409 `invalid_state_transition`
- safe 500 `internal_error`

Unknown errors are converted to generic safe 500 envelopes. Error responses do not include raw values, stack traces, SQL details, persistence internals, compared request bodies, or compared idempotency values.

## Repository Boundary Summary

M2-8I route wiring uses the in-memory/stub repository boundary only.

The route dispatcher defaults to the existing M2-8B stub repository behavior and supports injected stub repositories for tests. It does not import `pg`, does not create DB clients, does not perform real DB queries, does not connect to Aurora, and does not apply SQL.

Direct Aurora repository implementation remains later gated work.

## DTO Safety Summary

CDC route success outputs pass through the existing safe DTO mapper path:

- failure summaries/details use safe failure DTO fields
- state log responses use safe state log DTO fields
- replay request responses use safe replay request DTO fields
- success and error responses are checked by forbidden-key scanners in tests

The route output boundary remains safe metadata only.

## Production Route Registration Test Summary

`cdc-recovery-production-routes.test.js` exercises the production `createServer()` request listener path without opening a network listener. It proves:

- production route registration reaches every M2-5 CDC route string
- existing M2-8B route-level tests still remain separate and preserved
- existing non-CDC `/healthz` behavior is not broken
- missing auth returns safe 401
- `readonly_role`, `operator`, `maintainer`, and `system_worker` role boundaries are enforced
- safe 400, 403, 404, 409, and 500 outcomes are returned
- DTO safety is preserved
- OpenAPI proposal-only parity remains safe field-level only
- success and error responses contain no forbidden raw keys

## OpenAPI Boundary Summary

M2-8I does not merge the M2-5 OpenAPI patch.

- `sources/openapi_m2_5_dlq_replay_patch.yaml` remains proposal-only.
- The marker `PROPOSAL ONLY - DO NOT MERGE AUTOMATICALLY` remains present.
- `sources/personal_project_openapi_v0_2.yaml` remains unchanged.

OpenAPI main merge remains a separate readiness and approval gate.

## Rollback Strategy

Rollback for M2-8I is intentionally small:

- remove the `createCdcRecoveryRouteDispatcher` import from `server.js`
- remove the `cdcRecoveryRoutes` option/default dispatcher construction
- remove the single `cdcRecoveryRoutes.matches(request)` dispatch block
- keep M2-8B test-only harness and M2-8I tests as evidence if needed

No SQL, migration, OpenAPI merge, or external runtime state is coupled to this route registration.

## Validation Commands and Results

Required M2-8I validation chain:

- `npm run test:m2-8i:production-routes`
- `python3 scripts/validate_m2_8i_production_route_wiring.py`
- `npm run validate:m2-8i:production-route-wiring`
- `npm run test:m2-8b:cdc-recovery-routes`
- `npm run validate:m2-8b:test-only-harness`
- `npm run validate:m2-8h:route-wiring-readiness`
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
- `python3 -m py_compile scripts/validate_m2_8i_production_route_wiring.py`
- `git diff --check`
- `git status --short`

Current results:

- `npm run test:m2-8i:production-routes`: PASS
- `python3 scripts/validate_m2_8i_production_route_wiring.py`: 43 PASS, 0 FAIL
- `npm run validate:m2-8i:production-route-wiring`: 43 PASS, 0 FAIL
- `npm run test:m2-8b:cdc-recovery-routes`: PASS
- `npm run validate:m2-8b:test-only-harness`: 45 PASS, 0 FAIL
- `npm run validate:m2-8h:route-wiring-readiness`: 45 PASS, 0 FAIL
- `npm run validate:m2-8g:final-pre-wiring`: 45 PASS, 0 FAIL
- `npm run validate:m2-8f-prep:route-tests`: 60 PASS, 0 FAIL
- `npm run validate:m2-8e-prep:openapi-ownership`: 61 PASS, 0 FAIL
- `npm run validate:m2-8d-prep:repository-strategy`: 52 PASS, 0 FAIL
- `npm run validate:m2-8c-prep:error-envelope`: 54 PASS, 0 FAIL
- `npm run validate:m2-8b-prep:auth-roles`: 43 PASS, 0 FAIL
- `npm run validate:m2-8a:route-readiness`: 43 PASS, 0 FAIL
- `npm run validate:m2-7:skeleton-contract`: 34 PASS, 0 FAIL
- `npm run validate:m2:global-safety`: 6 PASS, 0 FAIL
- `npm run test:m2-7:cdc-recovery`: PASS
- `python3 -m py_compile scripts/validate_m2_8i_production_route_wiring.py scripts/m2_8i_validator_compat.py`: PASS

## Main OpenAPI / Runtime Statement

The main OpenAPI was not merged. Real DB queries, Aurora connection, SQL apply, and external infrastructure commands were not used.

## Remaining TODO Before OpenAPI Merge or Aurora Repository Work

- M2-8J OpenAPI merge readiness review must pass before main OpenAPI merge.
- API contract owner, safety reviewer, and final merge approver gates remain required.
- M2-8K Aurora repository readiness review must pass before direct Aurora repository implementation.
- SQL migration review, rollback plan, transaction boundary review, and controlled runtime dry-run gate remain required.
- M2-8L controlled runtime re-entry planning must pass before any runtime execution.
