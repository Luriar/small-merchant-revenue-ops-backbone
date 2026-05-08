# M7 Retry / DLQ 범위 기준

## 1. 목적

이 문서는 Revenue OS MVP에서 retry와 DLQ를 어디까지 다룰지 기준을 잠그기 위한 문서다.

M7에서의 retry/DLQ는 Kafka 기반의 대형 DLQ 시스템이 아니라, Revenue OS 도메인 작업 단위의 retry/quarantine 기준이다.

즉 지금 범위는 다음에 집중한다.

- 매출 업로드 처리 실패
- CSV row 일부 실패
- 공공 맥락 데이터 수집 실패
- 공공 맥락 source 일부 실패
- action status update 실패 감지
- demo fallback 발생 분리

## 2. 최상위 원칙

M7 Retry / DLQ 기준은 다음과 같이 잠근다.

- retry는 기존 작업을 덮어쓰지 않고 새 작업 시도로 남긴다.
- CSV row 오류는 전체 실패와 분리해 rejected row로 다룬다.
- 공공데이터 source 일부 실패는 전체 브리프 실패가 아니라 degraded state로 다룬다.
- 사용자 UI에는 DLQ라는 단어를 노출하지 않는다.
- 내부 운영 용어로는 failed run, rejected rows, failed source results, quarantine을 사용한다.
- validation/auth/config 오류는 자동 retry하지 않는다.
- timeout, 429, 5xx, network error만 자동 retry 후보로 본다.

## 3. 지금 MVP에서 넣는 것과 넣지 않는 것

### 넣는 것

- revenue upload processing retry 기준
- revenue upload rejected rows 기준
- public context collection retry 기준
- public context source result 상태 기준
- failed run / retryable run / non-retryable failure 구분
- 사용자 표시 문구 기준

### 아직 넣지 않는 것

- Kafka 기반 events.dlq
- ClickHouse CDC DLQ
- Debezium connector DLQ
- Airflow 또는 Step Functions 기반 대형 reprocess pipeline
- full worker cluster 기반 retry orchestration
- 사용자에게 DLQ 용어 노출

## 4. Retry 대상 1: 매출 업로드 처리

매출 업로드 실패는 두 종류로 나눈다.

### 4.1 파일 전체 실패

예시:

- CSV 파싱 불가
- 필수 컬럼 없음
- store_id 없음
- 권한 없음
- DB 저장 실패
- 파일 크기 제한 초과
- 인코딩 오류

처리 기준:

- upload.status = failed
- error_class 저장
- safe error message 저장
- 사용자는 재업로드 또는 입력 수정 안내를 받는다.
- DB_WRITE_FAILED는 핵심 장애로 본다.

사용자 표시 예시:

- 업로드에 실패했습니다. 파일 형식과 로그인 상태를 확인해 주세요.
- 필수 컬럼이 누락되었습니다. 날짜, 매출금액, 거래건수를 확인해 주세요.
- 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.

### 4.2 Row 일부 실패

예시:

- 날짜 형식 오류
- 매출 금액 숫자 아님
- 거래건수 숫자 아님
- 음수 값
- 중복 row
- 필수 메뉴명 누락
- 허용되지 않는 통화/단위

처리 기준:

- upload.status = completed_with_rejections
- accepted_rows = N
- rejected_rows = M
- rejected row preview 또는 다운로드 가능하게 둔다.
- row 일부 실패는 전체 업로드 실패로 보지 않는다.

사용자 표시 예시:

- 56건 중 52건이 반영되었고, 4건은 형식 오류로 제외되었습니다.
- 제외된 행을 확인한 뒤 수정 파일을 다시 업로드할 수 있습니다.

## 5. Retry 대상 2: Public Context Collection

공공데이터 수집은 source별로 실패할 수 있다.

현재 기준 source:

- seoul_commercial_sales: VwsmTrdarSelngQq
- seoul_foot_traffic: VwsmTrdarFlpopQq
- seoul_store_density: VwsmTrdarStorQq

source 상태:

- ok
- partial
- failed
- skipped
- stale

사용자 표시:

- ok: 수집됨
- partial: 참고 지표
- failed: 확인 필요
- skipped: 미연동
- stale: 갱신 대기

## 6. Public Context 실패 정책

### 상권 추정매출 benchmark 실패

처리:

- benchmark 관련 원인 후보는 제외하거나 참고 불가 표시
- 매출 업로드 기반 분석은 계속 제공
- 전체 브리프 실패로 보지 않는다.

### 생활인구 proxy 실패

처리:

- 생활인구 관련 원인 후보 제외
- 데이터 신뢰도에서 확인 필요 또는 갱신 대기 표시
- 전체 브리프 실패로 보지 않는다.

### 점포수 / 점포 밀도 proxy 실패

처리:

- 경쟁/점포수 관련 원인 후보 제외 또는 참고 지표 표시
- 사용자에게 서비스 장애처럼 보이지 않게 한다.

핵심 원칙:

- collector 일부 실패는 전체 브리프 실패가 아니다.
- source별 실패는 degraded state로 본다.
- 공공데이터 실패와 정본 쓰기 실패를 분리한다.

## 7. Retry 단위

MVP에서는 run 단위 retry를 기본으로 한다.

### Run 단위 retry

의미:

- public_context_run 전체를 다시 실행한다.
- 구현이 단순하고 MVP에 적합하다.

### Source 단위 retry

의미:

- foot traffic만 다시 실행
- store density만 다시 실행
- commercial sales만 다시 실행

판정:

- source 단위 retry는 v1 이후로 미룬다.
- M7/MVP에서는 run 단위 retry를 기준으로 한다.

## 8. 자동 retry 기준

자동 retry 가능한 오류:

- PUBLIC_API_TIMEOUT
- PUBLIC_API_RATE_LIMITED
- PUBLIC_API_5XX
- NETWORK_ERROR
- TEMPORARY_UPSTREAM_ERROR

자동 retry하면 안 되는 오류:

- AUTH_REQUIRED
- FORBIDDEN
- PUBLIC_API_AUTH_ERROR
- VALIDATION_ERROR
- CSV_PARSE_ERROR
- CSV_ROW_VALIDATION_ERROR
- PUBLIC_API_SCHEMA_MISMATCH
- MISSING_STORE_MAPPING
- MISSING_CATEGORY_MAPPING
- BAD_REQUEST

권장 backoff:

- attempt 1: 즉시 또는 30초 후
- attempt 2: 2분 후
- attempt 3: 5분 후

max_attempts:

- public context collection: 3
- revenue upload parse/persist: 자동 retry는 보수적으로 적용
- validation 오류는 자동 retry 없음

## 9. 수동 retry 기준

사용자 또는 운영자가 수동으로 다시 시도할 수 있는 대상:

- failed public_context_run
- failed revenue_upload_processing
- completed_with_rejections 업로드의 수정 파일 재업로드

사용자 UI 표현:

- 다시 수집
- 다시 업로드
- 제외된 행 확인
- 수정 파일 업로드

사용자 UI에서 쓰지 말아야 할 표현:

- DLQ
- dead letter
- poisoned message
- worker failure
- stack trace

## 10. Operation Run 최소 모델

나중에 구현할 최소 operation_run 모델은 다음을 기준으로 한다.

필드 후보:

- run_id
- store_id
- run_type
- status
- attempt
- max_attempts
- original_run_id
- started_at
- completed_at
- error_class
- error_message_safe
- metadata

run_type 후보:

- revenue_upload_parse
- revenue_upload_persist
- public_context_collect
- action_recommendation_build

status 후보:

- pending
- processing
- completed
- completed_with_warnings
- failed

MVP에서는 dlq를 status로 노출하지 않는다. failed + retryable=false 또는 quarantined 개념으로 다룬다.

## 11. Row / Source 상태 모델

CSV row 상태:

- accepted
- rejected

public context source 상태:

- ok
- partial
- failed
- skipped
- stale

action status update 실패는 일반적으로 retry 대상이 아니라 즉시 오류 반환 대상이다.

## 12. Error Class 표준 초안

공통:

- VALIDATION_ERROR
- AUTH_REQUIRED
- FORBIDDEN
- NOT_FOUND
- CONFLICT
- DB_WRITE_FAILED
- UNKNOWN_ERROR

CSV / Upload:

- CSV_PARSE_ERROR
- CSV_ROW_VALIDATION_ERROR
- CSV_REQUIRED_COLUMN_MISSING
- CSV_DUPLICATE_ROW
- CSV_ENCODING_ERROR

Public API:

- PUBLIC_API_TIMEOUT
- PUBLIC_API_RATE_LIMITED
- PUBLIC_API_5XX
- PUBLIC_API_AUTH_ERROR
- PUBLIC_API_EMPTY_RESPONSE
- PUBLIC_API_SCHEMA_MISMATCH

Mapping:

- MISSING_STORE_MAPPING
- MISSING_CATEGORY_MAPPING
- MISSING_COMMERCIAL_AREA_MAPPING

## 13. 장애 등급 연결

P0:

- DB_WRITE_FAILED
- 반복되는 UNKNOWN_ERROR
- RevenueUploadFailedCount 급증
- Lambda Errors 증가

P1:

- PublicContextRunFailedCount 증가
- StoreCreateFailureCount 증가
- ActionStatusUpdateFailureCount 증가
- PUBLIC_API_AUTH_ERROR

P2:

- PublicContextRunPartialCount 증가
- PublicContextSourceStaleCount 증가
- RevenueUploadRejectedRowCount 증가
- PUBLIC_API_TIMEOUT
- PUBLIC_API_RATE_LIMITED
- PUBLIC_API_EMPTY_RESPONSE

## 14. CloudWatch와 연결

후속 metric 후보:

- RevenueUploadFailedCount
- RevenueUploadRejectedRowCount
- PublicContextRunFailedCount
- PublicContextRunPartialCount
- PublicContextSourceFailedCount
- PublicContextSourceStaleCount
- RetryAttemptCount
- RetryExhaustedCount

dimension 권장:

- Environment
- RunType
- SourceName
- ErrorClass
- Status

피해야 할 dimension:

- store_id
- user_id
- email
- detailed address

store_id는 로그에는 남길 수 있지만 metric dimension에는 넣지 않는다.

## 15. 최종 결정

M7 Retry / DLQ는 Kafka 기반 DLQ가 아니라 Revenue OS 작업 단위 retry/quarantine으로 간다. retry 대상은 revenue upload processing과 public context collection이다. CSV row 오류는 rejected_rows로 다루고 전체 실패와 분리한다. 공공데이터 수집 실패는 source별 status로 남기며, 사용자 UI에는 DLQ라는 단어를 쓰지 않는다. 자동 retry는 timeout, 429, 5xx, network error에만 적용하고 validation/auth/config 오류는 자동 retry하지 않는다.
