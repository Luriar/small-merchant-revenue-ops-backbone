# M2-6 Service Flow Sequence

이 문서는 M2-5 proposal endpoints가 handler, service, repository, DTO mapper를 통과하는 순서를 설명한다.

This is proposal-only and not production rollout.

공통 evidence-safe rule:

- no raw payloads
- no full message bodies
- no issue title/body/payload/reporter values
- no prod_change payload/actor values
- forbidden field leakage 발견 시 stop condition
- 모든 operator evidence는 `evidence_report_ref`로 연결

## 1. List Failures

Endpoint: `GET /api/v1/cdc/failures`

- Handler step: bearer auth와 read role을 확인하고 query filter/page를 service로 전달한다.
- Service step: filter를 safe metadata 기준으로 normalize하고 DTO mapper contract를 적용한다.
- Repository step: `listFailures(filter, page)`로 proposal Aurora boundary를 호출한다.
- State transition: 없음.
- Response DTO: safe failure summary list와 `next_cursor`.
- Evidence-safe rule: field-name sets와 IDs만 반환한다.
- Error behavior: auth 실패 `401`, role 실패 `403`, validation 실패 `400`, internal error `500`.

## 2. Get Failure Detail

Endpoint: `GET /api/v1/cdc/failures/{failure_id}`

- Handler step: `failure_id` path param과 read role을 확인한다.
- Service step: failure record를 조회하고 `buildSafeFailureDto(record)`로 변환한다.
- Repository step: `getFailureById(failureId)`를 호출한다.
- State transition: 없음.
- Response DTO: `CdcFailureDetail` safe metadata only.
- Evidence-safe rule: parser summary는 raw value 없이 bounded summary만 반환한다.
- Error behavior: 없으면 `404`, forbidden field leakage 감지 시 safe `500` 또는 stop condition.

## 3. Get Failure State Log

Endpoint: `GET /api/v1/cdc/failures/{failure_id}/state-log`

- Handler step: read role 확인 후 paging input을 service로 전달한다.
- Service step: failure 존재 여부를 확인하고 state log DTO를 safe shape로 제한한다.
- Repository step: `listFailureStateLog(failureId, page)`를 호출한다.
- State transition: 없음.
- Response DTO: state log entries with safe reason code and `evidence_report_ref`.
- Evidence-safe rule: state log safe_metadata는 recursive stripping 대상이다.
- Error behavior: failure가 없으면 `404`, invalid paging은 `400`.

## 4. Create Replay Request

Endpoint: `POST /api/v1/cdc/failures/{failure_id}/replay-requests`

- Handler step: operator role, `idempotency_key`, `evidence_report_ref`, requested action, bounded scope를 service로 전달한다.
- Service step: `validateCreateReplayRequest(input)` 후 `enforceIdempotency(input)`를 수행한다.
- Repository step: `getFailureById(failureId)`, `findReplayRequestByIdempotencyKey(idempotencyKey)`, `createReplayRequest(input)`, `appendFailureStateLog(input)`, `updateFailureStatus(failureId, transition)`를 호출한다.
- State transition: failure `open|triaged` → `replay_requested` 또는 `reprocess_requested`; replay request → `requested`.
- Response DTO: created replay request safe DTO, status `201`.
- Evidence-safe rule: request reason은 summary only이고 raw values를 포함하지 않는다.
- Error behavior: missing required field `400`, idempotency conflict `409`, invalid current failure status `409`, missing failure `404`.

## 5. Approve Replay Request

Endpoint: `POST /api/v1/cdc/replay-requests/{replay_request_id}/approve`

- Handler step: maintainer role을 확인하고 approval input을 service로 전달한다.
- Service step: replay request를 조회하고 `enforceStateTransition(currentStatus, action)`을 수행한다.
- Repository step: `getReplayRequestById(replayRequestId)`, `updateReplayRequestStatus(replayRequestId, transition)`, `appendFailureStateLog(input)`, `updateFailureStatus(failureId, transition)`를 호출한다.
- State transition: replay request `requested` → `approved`; failure `replay_requested|reprocess_requested` → approved equivalent.
- Response DTO: approved replay request safe DTO.
- Evidence-safe rule: approval evidence는 `evidence_report_ref`로만 연결한다.
- Error behavior: missing request `404`, invalid transition `409`, role failure `403`.

## 6. Cancel Replay Request

Endpoint: `POST /api/v1/cdc/replay-requests/{replay_request_id}/cancel`

- Handler step: maintainer role을 확인하고 cancellation reason summary를 service로 전달한다.
- Service step: cancellable status인지 검사하고 safe DTO를 만든다.
- Repository step: `getReplayRequestById(replayRequestId)`, `updateReplayRequestStatus(replayRequestId, transition)`, `appendFailureStateLog(input)`, optional `updateFailureStatus(failureId, transition)`를 호출한다.
- State transition: replay request `requested|approved` → `cancelled`; failure는 원인 history를 유지한다.
- Response DTO: cancelled replay request safe DTO.
- Evidence-safe rule: cancellation reason은 safe reason code와 `evidence_report_ref`만 사용한다.
- Error behavior: already running/succeeded/failed는 invalid state transition `409`.

## 7. Idempotent Duplicate Create

Endpoint: `POST /api/v1/cdc/failures/{failure_id}/replay-requests`

- Handler step: 같은 `idempotency_key` 재요청을 normal create path로 전달한다.
- Service step: existing request와 normalized intent가 동일하면 create를 수행하지 않고 existing result를 반환한다.
- Repository step: `findReplayRequestByIdempotencyKey(idempotencyKey)`만으로 existing request를 찾고 필요한 경우 `getFailureById(failureId)`를 확인한다.
- State transition: 없음.
- Response DTO: existing replay request safe DTO, status `200`.
- Evidence-safe rule: duplicate 여부만 safe decision으로 기록한다.
- Error behavior: existing record shape에 forbidden field leakage가 있으면 stop condition.

## 8. Idempotency Conflict 409

Endpoint: `POST /api/v1/cdc/failures/{failure_id}/replay-requests`

- Handler step: create request를 service로 전달하고 service error를 `409`로 매핑한다.
- Service step: 같은 `idempotency_key`이지만 normalized intent가 다르면 conflict로 판단한다.
- Repository step: `findReplayRequestByIdempotencyKey(idempotencyKey)`로 conflict source를 확인한다.
- State transition: 없음.
- Response DTO: safe error envelope with `IDEMPOTENCY_CONFLICT`.
- Evidence-safe rule: conflict detail은 field name 수준만 허용한다.
- Error behavior: HTTP `409`, raw detail 없이 반환한다.

## 9. Invalid State Transition 409

Endpoint examples:

- `POST /api/v1/cdc/replay-requests/{replay_request_id}/approve`
- `POST /api/v1/cdc/replay-requests/{replay_request_id}/cancel`

- Handler step: mutation role을 확인하고 service decision을 error envelope로 매핑한다.
- Service step: `enforceStateTransition(currentStatus, action)`이 invalid transition을 반환한다.
- Repository step: invalid이면 update method를 호출하지 않는다.
- State transition: 없음.
- Response DTO: safe error envelope with `INVALID_STATE_TRANSITION`.
- Evidence-safe rule: current status and action only; no raw values.
- Error behavior: HTTP `409`.
