# M2-8B-Prep Auth Role Reconciliation

## 1. Purpose and Non-Goals

Purpose: M2-8B live route wiring 전에 existing `auth.js`의 `viewer`/`operator` 모델과 M2 CDC recovery role model을 reconcile하는 contract를 확정한다. 이 단계는 structured, traceable, evidence-safe recovery operation을 보존하고, replay approval/cancel이 under-scoped role에 노출되지 않도록 gate를 정의한다.

Non-goals:

- not live route wiring
- `server.js` must not be modified
- `auth.js` must not be modified
- no production auth behavior change
- no route registration
- no real DB query implementation
- no OpenAPI main merge
- no SQL apply
- no AWS, Kafka, Debezium, ClickHouse, psql, kubectl, deployment, or external infrastructure commands
- no raw payloads
- no full message bodies
- no issue raw values
- no prod_change payload/actor values

## 2. Current auth.js Role Model Summary

Current `apps/api/src/auth.js` behavior:

- `ROLE_PRECEDENCE` has exactly `viewer: 1` and `operator: 2`.
- `VIEWER_BEARER_TOKEN` maps to `viewer` when configured.
- `OPERATOR_BEARER_TOKEN` maps to `operator` when configured.
- auth is enabled only when at least one configured bearer credential exists.
- `/healthz` and `/readyz` are exempt.
- existing read routes generally require `viewer`.
- existing mutation routes generally require `operator`.
- `hasRequiredRole()` uses numeric precedence, so `operator` satisfies `viewer` routes.
- unauthorized requests return 401.
- authenticated users below the required precedence return 403.
- unknown routes that do not match an auth policy are not currently blocked by auth policy matching alone.

This task does not change `auth.js`.

## 3. M2 Required Role Model

M2 CDC recovery requires four roles:

- `readonly_role`: can read CDC failures and replay request metadata only; cannot mutate state.
- `operator`: can read and can create replay/reprocess requests; cannot approve/cancel.
- `maintainer`: can read, create replay/reprocess requests, and approve/cancel replay requests.
- `system_worker`: can update future runtime execution status, linkNewRunId, mark running/succeeded/failed/cleanup_complete; cannot create arbitrary replay requests and cannot approve/cancel.

Role checks before service mutation are mandatory.

## 4. Compatibility Mapping Proposal

Proposed compatibility mapping for future M2-8B implementation:

| Existing Role | M2 Candidate | Decision | Notes |
|---|---|---|---|
| `viewer` | `readonly_role` candidate | accepted as compatibility candidate | Read-only CDC inspection only; readonly_role cannot mutate. |
| `operator` | `operator` candidate | accepted as compatibility candidate | Can create replay/reprocess request but operator cannot approve/cancel. |
| none | `maintainer` | new role required | Maintainer is required for approve/cancel. Existing `operator` must not be promoted implicitly. |
| none | `system_worker` | new role required | System worker must be isolated from human request creation and approval/cancel. |

Implementation note for a future task: avoid precedence-only authorization for CDC mutations unless the precedence model can express `system_worker` isolation. A role set or per-action allowlist is safer than a single linear hierarchy for worker-only actions.

## 5. Endpoint Permission Matrix

| Endpoint/Action | Allowed Roles | Forbidden Roles | Required Audit/Evidence Fields | evidence_report_ref Required | idempotency_key Required | Safe Response Rule | Expected Error Behavior |
|---|---|---|---|---|---|---|---|
| GET /api/v1/cdc/failures | `readonly_role`, `operator`, `maintainer` | `system_worker` by default | request_id, role | no | no | safe metadata list only | 401/403 |
| GET /api/v1/cdc/failures/{failure_id} | `readonly_role`, `operator`, `maintainer` | `system_worker` by default | failure_id, request_id | no | no | safe detail DTO only | 401/403/404 |
| GET /api/v1/cdc/failures/{failure_id}/state-log | `readonly_role`, `operator`, `maintainer` | `system_worker` by default | failure_id, request_id | no | no | safe state log DTO only | 401/403/404 |
| POST /api/v1/cdc/failures/{failure_id}/replay-requests | `operator`, `maintainer` | `readonly_role`, `system_worker` | failure_id, requester_ref, reason_code | yes | yes | safe replay request DTO only | 400/401/403/409 |
| GET /api/v1/cdc/replay-requests | `readonly_role`, `operator`, `maintainer` | `system_worker` by default | request_id, role | no | no | safe metadata list only | 401/403 |
| GET /api/v1/cdc/replay-requests/{replay_request_id} | `readonly_role`, `operator`, `maintainer` | `system_worker` by default | replay_request_id, request_id | no | no | safe detail DTO only | 401/403/404 |
| POST /api/v1/cdc/replay-requests/{replay_request_id}/approve | `maintainer` | `readonly_role`, `operator`, `system_worker` | replay_request_id, approver_ref | yes | no | safe approved DTO only | 400/401/403/409 |
| POST /api/v1/cdc/replay-requests/{replay_request_id}/cancel | `maintainer` | `readonly_role`, `operator`, `system_worker` | replay_request_id, canceller_ref | yes | no | safe cancelled DTO only | 400/401/403/409 |
| future worker action: linkNewRunId | `system_worker` | `readonly_role`, `operator`, `maintainer` | replay_request_id, new_run_id | yes | no | safe linkage DTO/log only | 401/403/409 |
| future worker action: mark replay running/succeeded/failed | `system_worker` | `readonly_role`, `operator`, `maintainer` | replay_request_id, status, run_id | yes | no | safe status DTO/log only | 401/403/409 |
| future cleanup action: mark cleanup_complete | `system_worker` | `readonly_role`, `operator`, `maintainer` | replay_request_id, cleanup_status | yes | no | safe cleanup DTO/log only | 401/403/409 |

## 6. Mutation Gate Rules

- `readonly_role` cannot mutate.
- `operator` can create replay/reprocess requests only.
- `operator` cannot approve/cancel.
- `maintainer` is required for approve/cancel.
- `system_worker` cannot create arbitrary replay requests.
- `system_worker` cannot approve/cancel.
- Role checks before service mutation are required.
- Mutation denial must return safe 403 without revealing raw values.
- Idempotency conflict must return safe 409 without compared values.

## 7. Approve/Cancel Maintainer-Only Rule

Approve and cancel are maintainer-only actions. Existing `operator` must not inherit approve/cancel through precedence. Approval and cancel decisions must include safe audit/evidence fields and `evidence_report_ref` while avoiding raw payloads, full message bodies, issue raw values, and prod_change payload/actor values.

## 8. system_worker Boundary

`system_worker` is isolated for future runtime execution status only:

- may linkNewRunId after a future worker creates a new run row
- may mark replay running/succeeded/failed
- may mark cleanup_complete
- may not create arbitrary replay requests
- may not approve/cancel
- should not be accepted on human inspection routes by default

This boundary prevents automated runtime credentials from becoming broad human recovery authority.

## 9. Authorization Failure Behavior

Authorization failures do not reveal raw values.

- Missing or invalid authentication returns 401 with a safe code/message.
- Authenticated but under-scoped role returns 403 with a safe code/message.
- Role denial must not reveal whether hidden unsafe fields exist.
- Logs may include route label, status, request_id, and role category only.
- Logs must not include raw payloads, full message bodies, issue raw values, prod_change payload/actor values, credentials, or persistence internals.

## 10. Safe Error Response Rules

Safe error responses:

- 401: `unauthorized`
- 403: `forbidden`
- 409: `idempotency_conflict`, `invalid_state_transition`, or worker-boundary conflict

Allowed fields: safe code, safe message, status, safe IDs, and `evidence_report_ref` when already safe.

Forbidden fields and values: raw payloads, full message bodies, issue raw values, prod_change payload/actor values, credentials, DB URLs, and raw connection strings.

## 11. Stop Conditions

Stop M2-8B route wiring if any of these are true:

- live route wiring attempted in this prep step
- `server.js` modification attempted
- `auth.js` modification attempted
- OpenAPI main merge attempted
- SQL apply attempted
- external infrastructure command attempted
- `readonly_role` can mutate
- `operator` can approve/cancel
- approve/cancel does not require `maintainer`
- `system_worker` can create arbitrary replay requests
- role checks happen after service mutation
- authorization failures reveal raw values
- raw payloads are exposed
- full message bodies are exposed
- issue raw values are exposed
- prod_change payload/actor values are exposed

## 12. Decision: Ready / Not Ready for M2-8B Route Wiring

Decision: auth role reconciliation contract is ready as a design input, but M2-8B route wiring remains not ready.

Accepted auth decision:

- `viewer` maps only to `readonly_role` as a compatibility candidate.
- `operator` maps only to `operator` as a compatibility candidate.
- `maintainer` is a new required role.
- `system_worker` is a new required isolated role.
- approve/cancel is maintainer-only.
- worker status actions are system_worker-only.

## 13. Remaining Blockers After Auth Reconciliation

Auth blocker is resolved at contract level only. Remaining blockers:

- implement the chosen auth mapping in a future task without modifying production behavior prematurely
- resolve CDC error envelope integration choice
- resolve repository strategy
- resolve OpenAPI patch merge ownership
- add route-level integration tests
- keep `server.js` and `auth.js` unchanged until the approved implementation step

Next blocker reference: M2-8C-Prep in `docs/m2_8c_prep_error_envelope_integration_kr.md` addresses CDC error envelope integration at contract level only. Route wiring remains blocked until repository strategy, OpenAPI ownership, and route-level integration tests are resolved.
