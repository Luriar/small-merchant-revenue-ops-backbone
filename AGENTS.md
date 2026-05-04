# AGENTS.md

## 프로젝트 정체성
이 프로젝트의 본체는 **release-to-issue traceability 기반 Event-Driven Product Ops Backbone**이다.
범용 데이터 플랫폼이나 일반 observability 대시보드로 다시 넓히지 않는다.

## 최우선 기준 문서
작업 전 아래 문서를 먼저 읽고, 충돌 시 아래 우선순위를 따른다.

1. `personal_project_execution_standard_v2_1_correction_kr.docx`
2. `personal_project_openapi_v0_2.yaml`
3. `aurora_ddl_v2.sql`
4. `clickhouse_ddl_v2_1.sql`
5. `personal_project_operations_recovery_playbook_kr.docx`
6. `personal_project_pre_implementation_design_bundle_kr.docx`
7. `personal_project_implementation_order_kr.docx`
8. `personal_project_crosswalk_standard_openapi_ddl_kr.docx`
9. `personal_project_api_db_mapping_final_kr.docx`

## 고정 원칙
- Aurora는 운영 정본이다.
- ClickHouse는 분석/집계/CDC read-model 레이어다.
- MVP에서 Trace는 API/UI 기준 `suspected` 단일 상태만 다룬다.
- retry와 reprocess는 기존 run을 되감지 않고 **항상 새 run row를 생성**한다.
- evidence와 run_state_log는 append-only 원칙을 따른다.
- change marker source는 초기 구현에서 Aurora `prod_change`를 사용한다.
- trace ↔ issue 연결은 현재 MVP 물리 모델 기준 `trace.primary_issue_id` 중심이다.

## 이번 구현 단계의 우선순위
1. Aurora 스키마 + 기본 권한
2. Intake API 3종 + validation + idempotency
3. Run / Retry / Reprocess reliability 골격
4. Trace / Evidence 생성 로직
5. 조회 API
6. 프론트 4개 화면
7. CDC / ClickHouse read path
8. 운영·복구·관측성 보강

## Codex 작업 방식
- 한 번에 큰 기능 전체를 구현하지 말고 **작은 작업 단위**로 진행한다.
- 매 작업은 다음 4가지를 포함해야 한다.
  1. 맥락
  2. 작업 범위
  3. 수용 기준
  4. 산출물 요약
- 애매하면 임의 확장하지 말고 `TODO` 또는 `NOTE`로 남긴다.
- 기준 문서를 수정하지 말고, 구현만 진행한다.
- out of scope는 건드리지 않는다.

## 보안 / PII / 로깅 규칙
- `issue.title`, `issue.body`, `issue.payload`, `issue.reporter`, raw payload는 로그에 그대로 남기지 않는다.
- 에러 응답, 디버그 로그, tracing annotation(X-Ray 등)에 raw payload/body/title/reporter를 노출하지 않는다.
- `user_id`, `session_id`, `request_id`는 pseudonymous identifier만 허용한다.
- 새로 추가하는 로그는 내부 ID(`trace_id`, `run_id`, `change_id`, `issue_id`) 중심으로 남긴다.

## DB / 권한 규칙
- `migration_role`은 DDL 전용이다. 런타임에서 사용하지 않는다.
- `app_role`은 API/worker/batch 런타임 전용이다.
- `readonly_role`은 조회 전용이다.
- `debezium_cdc`는 CDC 전용 계정이다.
- `evidence`는 `SELECT/INSERT only` 원칙이다.
- `run_state_log`는 trigger 기반 append-only 로그이며 앱이 직접 INSERT/UPDATE/DELETE 하지 않는다.

## Intake 구현 규칙
### POST /api/v1/changes
- `idempotency_key`, `change_type`, `title`, `target_service`, `source`, `occurred_at` 필수
- `change_type`은 `release | flag | rule`
- `occurred_at > now + 5m` 금지
- 같은 `idempotency_key` 재요청이면 같은 `change_id` 반환

### POST /api/v1/events/intake
- `event_id`, `occurred_at`, `target_service`, `event_type`, `event_subtype`, `source` 필수
- `event_id`가 authoritative dedupe key
- `retry_count`는 `0~255`
- `is_error`는 boolean 입력 후 내부 normalize 가능

### POST /api/v1/issues/intake
- 구현 기준으로 `title` required
- `source + external_id`를 dedupe 우선 기준으로 사용
- 없으면 `idempotency_key` fallback
- `severity`는 `1~5`
- title/body/payload/reporter는 PII 취급

## Retry / Reprocess 규칙
- retry는 `failed` 또는 `dlq` run만 대상
- retry는 새 run 생성, `attempt = original.attempt + 1`
- reprocess는 새 run 생성, `run_type = reprocess`, `attempt = 0`
- 같은 `idempotency_key` replay면 같은 `new_run_id` 반환
- active retry / active reprocess 중복은 차단한다

## Trace / Evidence 규칙
- trace와 evidence는 같은 Aurora 트랜잭션 안에서 생성한다.
- `evidence_count`는 애플리케이션이 직접 갱신하지 않는다.
- duplicate guard를 둔다.
- `anomaly_trace_link`는 Aurora commit 이후 후행 처리한다.

## Schema Change / CDC 규칙
- 변경 순서: **Aurora → ClickHouse target → ClickHouse Kafka engine → MV 재생성**
- Debezium snapshot 중 ALTER TABLE 금지
- issue 관련 신규 컬럼은 PII 여부를 먼저 판정
- CDC 실패는 Aurora write failure와 read-model failure를 구분해서 다룬다.

## 응답 형식 규칙
매 작업이 끝나면 반드시 아래를 요약한다.

1. 변경한 파일 목록
2. 각 파일에서 무엇을 바꿨는지
3. 기준 문서와 어떻게 정합하는지
4. 남은 리스크 또는 TODO
5. 테스트 실행 여부와 결과

## 금지 사항
- 기준 문서의 방향을 임의로 바꾸지 말 것
- Trace를 M:N issue 모델로 일반화하지 말 것
- retried를 run status 값으로 추가하지 말 것
- evidence / run_state_log append-only 원칙을 깨지 말 것
- PII/raw payload를 로그/응답에 노출하지 말 것
- Aurora와 ClickHouse의 역할을 뒤집지 말 것
