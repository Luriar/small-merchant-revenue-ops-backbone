# M6 Platform Transition Note

## 현재 선택
M6는 초기 paid SaaS 검증에 맞춘 serverless runtime이다. CloudFront/S3, Cognito, API Gateway, Lambda, Aurora, NAT, Secrets Manager, CloudWatch로 운영한다.

## 왜 MSK/EKS/Airflow/ClickHouse를 미룰 수 있는가
- 현재 핵심 흐름은 store onboarding, public context bootstrap, revenue upload, cause/action generation이다.
- Aurora가 운영 정본이며, ClickHouse는 분석/CDC read model 레이어로 남아 있다.
- MSK/EKS/Airflow는 multi-tenant high-volume pipeline과 worker orchestration이 분명해진 뒤 도입해야 한다.
- 지금 도입하면 운영 표면과 비용이 제품 검증보다 먼저 커진다.

## 언제 SQS/EventBridge/Worker Lambda를 넣는가
- revenue upload 후 cause/action generation이 사용자 요청 latency를 넘어설 때.
- public context collector가 API Gateway timeout보다 오래 걸릴 때.
- action outcome evaluation을 예약 실행해야 할 때.
- outbox event를 비동기로 publish해야 할 때.

## 전환 경로
1. 현재: API Gateway + Lambda + Aurora synchronous path.
2. 다음: EventBridge/SQS + worker Lambda for context collect and mart build.
3. 성장: CDC read model and ClickHouse for analytical query acceleration.
4. Platform scale: MSK/Debezium, EKS workers, Airflow/Step Functions orchestration, Grafana/Prometheus.

## Guardrail
플랫폼 확장은 Revenue OS의 가치가 "근거 기반 액션"이라는 사실을 흐리면 안 된다. raw data exhaust와 observability dashboard로 넓히는 것은 non-goal이다.
