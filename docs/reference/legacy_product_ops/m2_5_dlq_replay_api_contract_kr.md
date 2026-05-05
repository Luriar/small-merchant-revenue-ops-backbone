# M2-5 DLQ / Replay API Contract

## Purpose

M2-5는 DLQ failure inspection과 idempotent replay/reprocess request flow를 위한 API contract를 정의한다.

이 API는 recovery operation을 구조화하고 추적 가능하게 만들기 위한 contract다. API는 raw data를 조회하거나 raw message를 replay하는 경로가 아니다.

This is not production rollout.

## Non-Goals

M2-5에서 하지 않는 일:

- runtime handler 구현
- OpenAPI main file merge
- AWS 연결
- SQL apply
- Kafka topic 생성
- replication slot 생성
- Debezium 배포
- ClickHouse 시작
- raw payloads 반환
- full message bodies 반환
- issue title/body/payload/reporter values 반환
- prod_change payload/actor values 반환

## Relationship To M2-4

M2-4는 DLQ/replay safe metadata storage design을 정의했다.

M2-5는 M2-4의 proposed Aurora tables를 API contract로 노출하는 방식을 정의한다.

- `cdc_failure`: failure inspection source
- `cdc_replay_request`: replay/reprocess request source
- `cdc_failure_state_log`: failure and replay state transition source

M2-5는 storage design을 변경하지 않는다.

## Relationship To M2-6

M2-6 defines the internal handler/service/repository contract for these proposal endpoints. M2-5 remains the external API proposal, and M2-6 fixes the module boundary, DTO mapper rules, idempotency behavior, state transition behavior, and safe error mapping before runtime implementation.

## API Groups

Failure inspection APIs:

- `GET /api/v1/cdc/failures`
- `GET /api/v1/cdc/failures/{failure_id}`
- `GET /api/v1/cdc/failures/{failure_id}/state-log`

Replay request APIs:

- `POST /api/v1/cdc/failures/{failure_id}/replay-requests`
- `GET /api/v1/cdc/replay-requests`
- `GET /api/v1/cdc/replay-requests/{replay_request_id}`
- `POST /api/v1/cdc/replay-requests/{replay_request_id}/approve`
- `POST /api/v1/cdc/replay-requests/{replay_request_id}/cancel`

## Safe Response Rules

All responses must be safe metadata only.

Allowed response fields include:

- failure ids
- replay request ids
- source topic names
- source table names
- primary key identifiers
- operation code
- `ts_ms`
- field-name sets
- parser error class
- parser error summary without raw values
- status
- owner
- attempt count
- `evidence_report_ref`
- `idempotency_key`
- `new_run_id` when created or available

Responses must not include:

- raw payloads
- full message bodies
- secrets
- DB URLs
- endpoints
- account IDs
- SecretString
- tokens
- passwords
- raw connection strings
- issue title/body/payload/reporter values
- prod_change payload/actor values

## Auth / Role Assumptions

Proposed roles:

- `readonly_role`: read-only failure inspection
- `operator`: create replay/reprocess request
- `maintainer`: approve or cancel replay request

All endpoints require bearer auth.

Unauthorized requests return `401`.

Authenticated users without the required role return `403`.

## Status Model

Failure status examples:

- `open`
- `triaged`
- `replay_requested`
- `replay_approved`
- `reprocess_requested`
- `reprocess_approved`
- `blocked`
- `resolved`
- `closed_no_replay`

Replay request status examples:

- `requested`
- `approved`
- `rejected`
- `running`
- `succeeded`
- `failed`
- `cancelled`
- `cleanup_complete`

## Idempotency Rules

`POST /api/v1/cdc/failures/{failure_id}/replay-requests` requires `idempotency_key`.

Same `idempotency_key` and same request body returns the existing replay request.

Same `idempotency_key` with different `requested_action`, target, bounded scope, attempt count, owner, or requester returns `409`.

Active duplicate replay requests for the same failure and same bounded scope return `409` unless the request is an exact idempotent replay.

## `new_run_id` Behavior

Replay request creation does not have to create a run immediately.

`new_run_id` may be `null` while status is `requested` or `approved`.

`new_run_id` should be populated only when a future runtime worker creates the new run row.

Retry/reprocess creates a new run row and must not mutate the original run.

## Original Failure / Run Immutability

The original failure remains immutable as the failure history.

The original run remains immutable as processing history.

Replay and reprocess create new recovery records and future new run rows.

The API must not rewrite old failure evidence to hide the original cause.

## Proposed Endpoints

### `GET /api/v1/cdc/failures`

Purpose:

- list safe DLQ failure summaries

Allowed role:

- `readonly_role` or higher

Request fields:

- query: `status`
- query: `failure_type`
- query: `source_topic`
- query: `owner`
- query: `from`
- query: `to`
- query: `limit`
- query: `cursor`

Response fields:

- `items[]` of `CdcFailureSummary`
- `next_cursor`

Idempotency behavior:

- not applicable

Status transitions:

- none

Raw field exclusion rule:

- return field names only; never raw values

### `GET /api/v1/cdc/failures/{failure_id}`

Purpose:

- inspect one failure detail

Allowed role:

- `readonly_role` or higher

Request fields:

- path: `failure_id`

Response fields:

- `CdcFailureDetail`

Idempotency behavior:

- not applicable

Status transitions:

- none

Raw field exclusion rule:

- no raw payloads or full message bodies

### `GET /api/v1/cdc/failures/{failure_id}/state-log`

Purpose:

- inspect failure state transitions

Allowed role:

- `readonly_role` or higher

Request fields:

- path: `failure_id`
- query: `limit`
- query: `cursor`

Response fields:

- `items[]` of `CdcFailureStateLogEntry`
- `next_cursor`

Idempotency behavior:

- not applicable

Status transitions:

- none

Raw field exclusion rule:

- state metadata must remain safe metadata only

### `POST /api/v1/cdc/failures/{failure_id}/replay-requests`

Purpose:

- create an idempotent replay/reprocess request for one failure

Allowed role:

- `operator` or higher

Request fields:

- path: `failure_id`
- body: `requested_action`
- body: `reason_summary`
- body: `target_topic`
- body: `target_table`
- body: `bounded_scope`
- body: `attempt_count`
- body: `owner`
- body: `idempotency_key`
- body: `evidence_report_ref`

Response fields:

- `replay_request_id`
- `failure_id`
- `status`
- `idempotency_key`
- `new_run_id`
- `evidence_report_ref`

Idempotency behavior:

- same key and same request returns existing request
- same key and different target/scope returns `409`

Status transitions:

- failure: `open` or `triaged` -> `replay_requested` or `reprocess_requested`
- replay request: create as `requested`

Raw field exclusion rule:

- request and response must not include raw values

### `GET /api/v1/cdc/replay-requests`

Purpose:

- list replay/reprocess request summaries

Allowed role:

- `readonly_role` or higher

Request fields:

- query: `status`
- query: `failure_id`
- query: `owner`
- query: `requested_action`
- query: `limit`
- query: `cursor`

Response fields:

- `items[]` of `CdcReplayRequestSummary`
- `next_cursor`

Idempotency behavior:

- not applicable

Status transitions:

- none

Raw field exclusion rule:

- safe metadata only

### `GET /api/v1/cdc/replay-requests/{replay_request_id}`

Purpose:

- inspect one replay/reprocess request detail

Allowed role:

- `readonly_role` or higher

Request fields:

- path: `replay_request_id`

Response fields:

- `CdcReplayRequestDetail`

Idempotency behavior:

- not applicable

Status transitions:

- none

Raw field exclusion rule:

- safe metadata only

### `POST /api/v1/cdc/replay-requests/{replay_request_id}/approve`

Purpose:

- approve a requested replay/reprocess request

Allowed role:

- `maintainer`

Request fields:

- path: `replay_request_id`
- body: `approved_by`
- body: `approval_note`
- body: `evidence_report_ref`

Response fields:

- `replay_request_id`
- `failure_id`
- `status`
- `approved_by`
- `new_run_id`
- `evidence_report_ref`

Idempotency behavior:

- approving an already approved request returns the existing approved state
- approving invalid state returns `409`

Status transitions:

- replay request: `requested` -> `approved`
- failure: `replay_requested` -> `replay_approved`, or `reprocess_requested` -> `reprocess_approved`

Raw field exclusion rule:

- approval note must not contain raw values

### `POST /api/v1/cdc/replay-requests/{replay_request_id}/cancel`

Purpose:

- cancel a requested or approved replay/reprocess request before runtime execution

Allowed role:

- `maintainer`

Request fields:

- path: `replay_request_id`
- body: `cancelled_by`
- body: `cancel_reason`
- body: `evidence_report_ref`

Response fields:

- `replay_request_id`
- `failure_id`
- `status`
- `cancelled_by`
- `evidence_report_ref`

Idempotency behavior:

- cancelling an already cancelled request returns existing cancelled state
- cancelling invalid state returns `409`

Status transitions:

- replay request: `requested` or `approved` -> `cancelled`
- failure may return to `triaged` or move to `closed_no_replay`

Raw field exclusion rule:

- cancel reason must not contain raw values

## Stop Conditions

Stop API design or future implementation if:

- forbidden field leakage appears in request, response, logs, evidence, or OpenAPI schemas
- request/response includes raw payloads or full message bodies
- request/response includes issue title/body/payload/reporter values
- request/response includes prod_change payload/actor values
- replay endpoint accepts raw message body as input
- replay does not require `idempotency_key`
- replay does not create a new run row
- `new_run_id` mutates the original run
- `evidence_report_ref` is omitted
- approval bypasses owner/role assumptions
- `REPLICA IDENTITY FULL` is proposed as a quick fix

## OpenAPI Patch Proposal

The proposal is separate from the main OpenAPI file:

- `sources/openapi_m2_5_dlq_replay_patch.yaml`

The patch is proposal only and must not be merged automatically.

See also:

- `docs/m2_5_openapi_patch_proposal_kr.md`

## Next-Step Options

Possible next steps:

- M2-6: DLQ/replay handler design and repository contract
- M2-6: DLQ/replay UI contract
- M2-6: runtime dry-run execution using M2-2 package
- M2-6: observability dashboard query contract

Recommended next step:

- M2-6 should define DLQ/replay handler design and repository contract.

Reason:

- M2-4 defined safe metadata storage.
- M2-5 defines API shape and idempotency behavior.
- The next boundary is implementation design for repository methods and handlers without exposing raw values.
