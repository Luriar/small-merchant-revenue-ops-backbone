# M7 CloudWatch 관측성 기준

## 1. 목적

Revenue OS의 CloudWatch 관측성은 단순히 서버 생존 여부를 보는 것이 아니라, 실제 매장 분석 흐름이 어디서 저하됐는지 구분하기 위한 운영 계층이다.

관측 대상은 다음으로 나눈다.

- API/Lambda 장애
- CloudFront/프론트 배포 장애
- 인증/세션 문제
- 공공데이터 수집 실패 또는 지연
- 매출 업로드/가게 생성/액션 변경 같은 실제 업무 흐름 실패
- demo fallback 발생

핵심 원칙은 다음과 같다.

- 정본 쓰기 실패는 실제 장애로 본다.
- 공공데이터 일부 실패는 전체 장애가 아니라 degraded state로 본다.
- demo fallback은 실제 데이터 실패와 혼동되지 않도록 별도 metric/log로 관측한다.

## 2. CloudWatch Dashboard 구성

Dashboard 이름 후보:

- revenue-ops-revenue-dev-ops-dashboard

구성 섹션:

1. API Health
2. Lambda Health
3. Frontend / CloudFront Health
4. Auth / Session Health
5. Public Context Health
6. Revenue Ops Business Health
7. Recent Error Logs

## 3. API Health

대상은 API Gateway다.

기본 메트릭:

- Count
- 4XXError
- 5XXError
- Latency
- IntegrationLatency

해석:

- 5XX 증가: API/Lambda 내부 장애 가능성
- 4XX 급증: 인증 실패, 권한 실패, validation 실패, 잘못된 요청 증가 가능성
- Latency 증가: Lambda 지연, DB 지연, 외부 API 지연 가능성
- IntegrationLatency 증가: API Gateway보다 backend/Lambda 쪽 지연 가능성

알람 초안:

- P0: API Gateway 5XXError >= 1
- P1: 4XXError rate 급증, 예: 4XX / Count > 10~20%
- P1: Latency p95 > 3s

## 4. Lambda Health

대상 Lambda:

- revenue-ops-revenue-dev-revenue-api

기본 메트릭:

- Invocations
- Errors
- Throttles
- Duration p95/p99
- ConcurrentExecutions

알람 초안:

- P0: Lambda Errors >= 1
- P0: Lambda Throttles >= 1
- P1: Duration p95 > 5s
- P1: Duration p99 > 10s

오류 해석은 error_class 기준으로 분리한다.

- DB_WRITE_FAILED: 핵심 장애
- PUBLIC_API_TIMEOUT: 공공 맥락 수집 저하
- VALIDATION_ERROR: 사용자 입력 문제
- AUTH_REQUIRED / FORBIDDEN: 인증/권한 문제

## 5. Frontend / CloudFront Health

기본 메트릭:

- Requests
- 4xxErrorRate
- 5xxErrorRate
- TotalErrorRate
- BytesDownloaded

알람 초안:

- P0: CloudFront 5xxErrorRate > 1%
- P1: TotalErrorRate 급증
- P2: CloudFront 4xxErrorRate 급증

SPA에서는 4xx가 항상 장애는 아니므로 5xx를 더 강하게 본다.

## 6. Auth / Session Health

M7에서는 Cognito 자체 metric보다 앱 로그 기반으로 본다.

추적 이벤트:

- auth_callback_started
- auth_callback_completed
- auth_callback_failed
- logout_completed
- token_refresh_failed
- api_auth_required
- api_forbidden

후속 metric 후보:

- AuthCallbackFailureCount
- TokenRefreshFailureCount
- ApiAuthRequiredCount
- ApiForbiddenCount

## 7. Public Context Health

현재 Seoul Open Data endpoint:

- VwsmTrdarSelngQq: 상권 추정매출 benchmark
- VwsmTrdarFlpopQq: 상권 유동인구 proxy
- VwsmTrdarStorQq: 상권 점포수 / 점포 밀도 proxy

내부 상태값:

- ok
- partial
- failed
- skipped
- stale

사용자 표시값:

- ok: 수집됨
- partial: 참고 지표
- failed: 확인 필요
- skipped: 미연동
- stale: 갱신 대기

CloudWatch metric 후보:

- PublicContextRunStartedCount
- PublicContextRunCompletedCount
- PublicContextRunPartialCount
- PublicContextRunFailedCount
- PublicContextSourceOkCount
- PublicContextSourcePartialCount
- PublicContextSourceFailedCount
- PublicContextSourceStaleCount

권장 dimension:

- Environment
- SourceName
- Endpoint
- Status

피해야 할 dimension:

- store_id
- user_id
- email
- detailed address
- raw commercial_area_name

store_id는 로그에는 남겨도 되지만 CloudWatch metric dimension에는 넣지 않는다.

## 8. Revenue Ops Business Health

후속 app metric 후보:

- StoreCreateSuccessCount
- StoreCreateFailureCount
- RevenueUploadStartedCount
- RevenueUploadCompletedCount
- RevenueUploadFailedCount
- RevenueUploadAcceptedRowCount
- RevenueUploadRejectedRowCount
- ActionStatusUpdateSuccessCount
- ActionStatusUpdateFailureCount
- DemoFallbackServedCount

초기 우선순위:

1. RevenueUploadFailedCount
2. PublicContextRunFailedCount
3. PublicContextRunPartialCount
4. DemoFallbackServedCount
5. StoreCreateFailureCount
6. ActionStatusUpdateFailureCount

DemoFallbackServedCount는 반드시 실제 데이터 실패와 분리해서 관측한다.

## 9. 알람 등급

### P0

- API Gateway 5XXError >= 1
- Lambda Errors >= 1
- Lambda Throttles >= 1
- CloudFront 5xxErrorRate > 1%
- DB_WRITE_FAILED 발생
- RevenueUploadFailedCount 급증

### P1

- API Gateway 4XX rate 급증
- Lambda Duration p95/p99 증가
- PublicContextRunFailedCount 증가
- StoreCreateFailureCount 증가
- ActionStatusUpdateFailureCount 증가
- AuthCallbackFailureCount 증가

### P2

- PublicContextRunPartialCount 증가
- PublicContextSourceStaleCount 증가
- RevenueUploadRejectedRowCount 증가
- DemoFallbackServedCount 소량 발생
- CloudFront 4xx 증가

## 10. Structured Log 기준

M7에서는 처음부터 모든 경로에 PutMetricData를 직접 심기보다, structured JSON log를 표준화하고 CloudWatch Logs Insights / Metric Filter로 확장한다.

ops metric 로그 예시:

- event_type: ops_metric
- metric_name: PublicContextRunFailedCount
- environment: revenue-dev
- service: revenue-api
- store_id: store_123
- source_name: seoul_commercial_sales
- endpoint: VwsmTrdarSelngQq
- status: failed
- error_class: PUBLIC_API_TIMEOUT
- request_id: req_abc
- occurred_at: 2026-05-08T00:00:00.000Z

audit 로그 예시:

- event_type: audit
- environment: revenue-dev
- actor_user_id: cognito-sub
- actor_email: user@example.com
- store_id: store_123
- action: revenue_upload_completed
- resource_type: revenue_upload
- resource_id: upload_456
- outcome: success
- request_id: req_abc
- metadata.accepted_rows: 52
- metadata.rejected_rows: 4
- occurred_at: 2026-05-08T00:00:00.000Z

로그 금지 항목:

- JWT
- refresh token
- Seoul Open Data API key
- CSV 원문 전체
- 매출 raw row 전체
- 사용자의 상세 주소 전체
- 고객 개인정보

## 11. M7 실행 범위

지금 당장 할 수 있는 것:

- CloudWatch dashboard/alarm 설계 확정
- AWS 기본 metric 기반 dashboard skeleton
- Lambda/API/CloudFront alarm skeleton
- structured log metric 이름 확정
- error_class 표준 초안 확정

코드 흐름 확인 후 할 것:

- PublicContextRunFailedCount 실제 로그/metric 심기
- RevenueUploadFailedCount 실제 로그/metric 심기
- DemoFallbackServedCount 실제 로그/metric 심기
- AuthCallbackFailureCount 실제 로그/metric 심기
- CloudWatch Metric Filter 생성
- Audit log 정식화

## 12. 최종 결정

M7 CloudWatch 관측성은 AWS 기본 메트릭으로 API/Lambda/CloudFront의 인프라 상태를 먼저 감시하고, Revenue OS 도메인 이벤트는 structured JSON log 또는 후속 custom metric으로 확장한다. 공공데이터 수집 실패는 전체 장애가 아니라 degraded state로 분류하며, 정본 쓰기 실패와 명확히 분리한다. Demo fallback은 실제 데이터 실패와 혼동되지 않도록 별도 metric으로 관측한다.
