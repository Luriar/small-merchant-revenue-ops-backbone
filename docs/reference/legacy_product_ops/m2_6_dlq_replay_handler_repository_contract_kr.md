# M2-6 DLQ / Replay Handler Repository Contract

## Purpose

M2-6은 M2-5 DLQ/replay proposal endpoints를 실제 런타임 구현으로 옮기기 전에 handler, service, repository, DTO mapper의 내부 계약을 고정한다.

이 문서는 proposal-only contract이며 not production rollout이다. Aurora는 운영 정본이고, ClickHouse/Kafka/DLQ read path는 복구 가능한 read-model 또는 transport 계층으로만 본다.

## Non-Goals

M2-6에서 하지 않는 일:

- live route wiring
- production route registration
- real DB queries
- SQL apply
- AWS, Kafka, Debezium, ClickHouse 실행
- OpenAPI main file merge
- runtime worker 생성
- raw data dump path 생성

## Relationship To M2-5

M2-5는 다음 proposal endpoints의 외부 API contract를 정의했다.

- `GET /api/v1/cdc/failures`
- `GET /api/v1/cdc/failures/{failure_id}`
- `GET /api/v1/cdc/failures/{failure_id}/state-log`
- `POST /api/v1/cdc/failures/{failure_id}/replay-requests`
- `GET /api/v1/cdc/replay-requests`
- `GET /api/v1/cdc/replay-requests/{replay_request_id}`
- `POST /api/v1/cdc/replay-requests/{replay_request_id}/approve`
- `POST /api/v1/cdc/replay-requests/{replay_request_id}/cancel`

M2-6은 이 endpoints를 처리할 내부 module boundary와 method contract를 정의한다. M2-6은 M2-5 OpenAPI patch를 main OpenAPI에 병합하지 않는다.

## Proposed Module Boundary

제안 모듈은 `apps/api/src/cdc-recovery/` 아래에 둔다.

- handler: HTTP 요청 검증 진입점, role check, safe error mapping
- service: validation, idempotency_key 판단, state transition 판단, DTO mapper 호출
- repository: Aurora proposal tables에 대한 persistence boundary
- DTO mapper: safe response DTO 생성과 forbidden field leakage 방지

이 boundary는 implementation-useful contract이며 proposal only이다.

## Handler Responsibilities

handler responsibilities:

- M2-5 endpoints를 service method로 라우팅한다.
- 인증 실패는 service mutation 전에 `401`로 종료한다.
- role check 실패는 service mutation 전에 `403`으로 종료한다.
- validation error는 `400`으로 매핑한다.
- not found는 `404`로 매핑한다.
- idempotency conflict와 invalid state transition은 `409`로 매핑한다.
- internal error는 raw detail 없이 `500`으로 매핑한다.
- response는 DTO mapper 결과만 반환한다.

Handler는 raw value를 로그, response, tracing annotation에 남기지 않는다.

## Service Responsibilities

service responsibilities:

- create replay request 입력의 required field와 bounded scope를 검증한다.
- `idempotency_key` replay를 같은 normalized request인지 비교한다.
- 동일 key이지만 다른 normalized intent는 `409`로 판단한다.
- active duplicate replay/reprocess request를 차단한다.
- approve/cancel action에 대해 state transition behavior를 강제한다.
- replay/reprocess가 원본 failure 또는 원본 run을 되감지 않는지 확인한다.
- `new_run_id`는 future runtime worker가 new run row를 만든 뒤 link할 값으로 취급한다.
- 모든 성공 결과는 `buildSafeFailureDto` 또는 `buildSafeReplayRequestDto`를 거친다.

## Repository Responsibilities

repository responsibilities:

- M2-4 proposed Aurora tables의 persistence boundary를 정의한다.
- `cdc_failure`, `cdc_replay_request`, `cdc_failure_state_log` 저장 구조를 application contract로 감싼다.
- original failure 레코드는 state field와 linkage field 외에 원인 history를 덮어쓰지 않는다.
- original run 레코드는 update하지 않는다.
- replay/reprocess execution은 future worker가 항상 new run row를 생성하도록 link boundary만 제공한다.
- `appendFailureStateLog(input)`은 append-only state history를 위한 method로 둔다.
- 실제 SQL은 M2-6 범위가 아니며 구현하지 않는다.

## DTO Mapper Rules

DTO mapper:

- allowed response fields만 반환한다.
- nested safe metadata에서도 recursive stripping을 수행한다.
- forbidden response fields는 응답에서 제거한다.
- no raw payloads.
- no full message bodies.
- issue raw values are not returned.
- prod_change sensitive values are not returned.
- forbidden field leakage가 감지되면 service가 safe error 또는 stop condition으로 처리한다.

Allowed response fields:

- `failure_id`
- `failure_type`
- `source_topic`
- `source_table`
- `primary_key`
- `op`
- `ts_ms`
- `observed_field_names`
- `missing_required_fields`
- `unexpected_fields`
- `forbidden_field_names_detected`
- `parser_error_class`
- `parser_error_summary`
- `first_seen_at`
- `last_seen_at`
- `attempt_count`
- `status`
- `owner`
- `evidence_report_ref`
- `replay_request_id`
- `requested_action`
- `idempotency_key`
- `source_run_id`
- `new_run_id`
- `bounded_scope`
- `cleanup_status`

## Idempotency Behavior

`POST /api/v1/cdc/failures/{failure_id}/replay-requests` requires `idempotency_key`.

- 같은 `idempotency_key`와 같은 normalized request intent는 기존 replay request를 반환한다.
- 같은 `idempotency_key`와 다른 `requested_action`, target, bounded scope, attempt count, owner, requester identity는 `409`로 반환한다.
- 같은 failure와 같은 bounded scope에 active request가 있으면 exact idempotent replay가 아닌 한 `409`로 반환한다.
- idempotency 비교는 safe metadata only 기준으로 수행한다.

## State Transition Behavior

Failure 상태 전이는 request lifecycle의 안전한 표현만 허용한다.

- `open` 또는 `triaged`에서 replay request 생성 시 `replay_requested` 또는 `reprocess_requested`
- approve 시 `replay_approved` 또는 `reprocess_approved`
- cancel 시 failure는 필요하면 `triaged` 또는 `blocked`로만 되돌릴 수 있으며 원인 history는 유지

Replay request 상태 전이:

- `requested` → `approved`
- `requested` → `cancelled`
- `approved` → future worker `running`
- `running` → `succeeded` 또는 `failed`
- cleanup 완료 후 `cleanup_complete`

invalid state transition은 `409`로 반환하고 state log에는 safe reason code만 남긴다.

## `new_run_id` Behavior

`new_run_id`는 replay request 생성 또는 승인 시점에 필수가 아니다.

Future worker가 approved request를 처리할 때 항상 new run row를 생성하고 `linkNewRunId(replayRequestId, newRunId)`를 호출한다.

원본 run은 original run으로 남고 update되지 않는다. 같은 `idempotency_key` replay는 이미 link된 `new_run_id`가 있으면 같은 값을 반환한다.

## Original Failure / Run Immutability

original failure:

- root failure identity와 observed metadata를 보존한다.
- 상태와 latest replay linkage만 contract에 따라 변경한다.
- 원인 record를 삭제하거나 숨기지 않는다.

original run:

- retry/reprocess 때문에 update하지 않는다.
- recovery execution은 항상 new run row 기준이다.

## Forbidden Field Exclusion Rules

forbidden field leakage 방지를 위해 아래 값은 response field, storage field, fixture data key, DTO output key로 추가하지 않는다.

Forbidden field names:

- `payload`
- `body`
- `title`
- `reporter`
- `actor`
- `raw_message`
- `message_body`
- `full_message`
- `secret`
- `password`
- `token`
- `endpoint`
- `db_url`
- `connection_string`

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

## Error Envelope Behavior

Error envelope는 raw detail 없이 다음 safe shape만 사용한다.

- `error.code`
- `error.message`
- `error.status`
- `error.request_id` when pseudonymous
- `error.evidence_report_ref` when already safe and available

Mapping:

- `400` validation error
- `401` unauthorized
- `403` forbidden
- `404` not found
- `409` idempotency conflict / invalid state transition
- `500` internal error without raw details

## Not Production Rollout

This is not production rollout. This is proposal-only design and repository contract work. It does not apply SQL, create Kafka topics, deploy Debezium, start ClickHouse, wire routes, or execute external infrastructure commands.

## Next-Step Options

1. M2-7 non-wired skeleton modules: pure DTO mapper, validation helpers, idempotency helpers, repository stubs.
2. M2-8 route wiring plan: auth/role gate, OpenAPI patch merge gate, integration tests.
3. Future controlled runtime dry run only after explicit go/no-go approval and evidence report linkage.
