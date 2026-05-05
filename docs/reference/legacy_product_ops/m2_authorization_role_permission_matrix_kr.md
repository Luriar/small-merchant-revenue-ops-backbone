# M2 Authorization / Role Permission Matrix

Purpose: Define role-based access expectations before live handler implementation.

Roles:

- `readonly_role`
- `operator`
- `maintainer`
- `system_worker`

Global rules:

- role checks must happen before service mutation
- authorization failure must not reveal raw values
- maintainer approval is required for approve/cancel
- system_worker can update runtime execution status but cannot create arbitrary replay requests without source request
- readonly_role cannot mutate state

| Endpoint/Action | Allowed Roles | Forbidden Roles | Required Audit/Evidence Fields | evidence_report_ref Required | idempotency_key Required | Safe Response Rule | Error Behavior |
|---|---|---|---|---|---|---|---|
| GET /api/v1/cdc/failures | readonly_role, operator, maintainer | system_worker by default | request_id, role | no | no | safe metadata list | 401/403 |
| GET /api/v1/cdc/failures/{failure_id} | readonly_role, operator, maintainer | system_worker by default | failure_id, request_id | no | no | safe detail DTO | 401/403/404 |
| GET /api/v1/cdc/failures/{failure_id}/state-log | readonly_role, operator, maintainer | system_worker by default | failure_id, request_id | no | no | safe state log DTO | 401/403/404 |
| POST /api/v1/cdc/failures/{failure_id}/replay-requests | operator, maintainer | readonly_role, system_worker | failure_id, requester_ref, reason code | yes | yes | safe replay request DTO | 400/401/403/409 |
| GET /api/v1/cdc/replay-requests | readonly_role, operator, maintainer | system_worker by default | request_id, role | no | no | safe list DTO | 401/403 |
| GET /api/v1/cdc/replay-requests/{replay_request_id} | readonly_role, operator, maintainer | system_worker by default | replay_request_id | no | no | safe detail DTO | 401/403/404 |
| POST /api/v1/cdc/replay-requests/{replay_request_id}/approve | maintainer | readonly_role, operator, system_worker | replay_request_id, approver_ref | yes | no | safe approved DTO | 400/401/403/409 |
| POST /api/v1/cdc/replay-requests/{replay_request_id}/cancel | maintainer | readonly_role, operator, system_worker | replay_request_id, canceller_ref | yes | no | safe cancelled DTO | 400/401/403/409 |
| future worker action: linkNewRunId | system_worker | readonly_role, operator, maintainer | replay_request_id, new_run_id | yes | no | safe linkage DTO/log | 401/403/409 |
| future worker action: mark replay running/succeeded/failed | system_worker | readonly_role, operator, maintainer | replay_request_id, status, run id | yes | no | safe status DTO/log | 401/403/409 |
| future cleanup action: mark cleanup_complete | system_worker | readonly_role, operator, maintainer | replay_request_id, cleanup_status | yes | no | safe cleanup DTO/log | 401/403/409 |

Authorization failures return safe envelopes only and must not disclose whether hidden unsafe values exist.
