# M6 Architecture Overview

## 1. 제품 정의

이 프로젝트는 소상공인 Revenue Ops SaaS를 M6 기준으로 제품화한 slice다. 흐름은 `store registration -> revenue/POS upload -> public/private context collection -> normalized evidence observations -> candidate causes -> action planner -> action status/result tracking`이다.

단순 매출 대시보드가 아니라 매출 변화와 함께 관측된 맥락 신호를 근거 카드와 실행 액션 후보로 연결한다. 인과는 확정하지 않는다.

## 2. Runtime Architecture

```text
Frontend #revenue-cockpit
  -> API Gateway + Cognito authorizer
  -> Revenue API Lambda
  -> Aurora PostgreSQL operational SaaS tables
  -> public context collectors via NAT egress
  -> context observations / collector_runs / job_runs / action planner
```

구현된 AWS runtime:

- API Gateway + Cognito auth
- Lambda in VPC private subnets
- Aurora access from Lambda
- `single_nat` egress profile
- Seoul Open Data TCP 8088 egress
- Secrets Manager 기반 public context credential loading
- timeout-safe partial collector result

## 3. Data Responsibility

- Aurora: 운영 정본. stores, revenue uploads, context observations, collector/job runs, action status를 보관한다.
- ClickHouse: 기준 문서상 분석/집계/CDC read-model layer다. 이번 M6 packaging pass에서는 신규 ClickHouse 변경을 하지 않는다.
- Frontend: Cognito login 후 store-scoped API를 사용하고, API 실패 시 demo fallback을 유지한다.

## 4. Collector Flow

Context collection은 `/api/v1/stores/:storeId/context/collect`에서 시작한다.

Collector set:

- Kakao geocoding
- KMA weather
- Seoul commercial benchmark
- Seoul foot traffic proxy
- Seoul store density proxy
- Naver Local Search
- Naver DataLab
- Korean holiday calendar
- Toss Place connector smoke foundation
- Delivery provider connector smoke foundation

각 collector는 `completed`, `skipped`, `failed`를 독립적으로 기록한다. 하나가 timeout/403/missing credential이어도 전체 onboarding은 멈추지 않는다.

## 5. Evidence Flow

Live collector 결과는 `context_sources`, `context_observations`, `nearby_store_snapshots`, `public_revenue_benchmarks`, `collector_runs.metadata`에 정규화된다.

문구 원칙:

- 함께 관측되었습니다
- 가능성 높은 원인 후보
- 추가 확인이 필요합니다
- 인과가 확정된 것은 아닙니다
- 실행 효과를 단정하지 않습니다

## 6. Why Not Platform-Scale Async Yet

M6는 초기 유료 SaaS runtime 검증 단계다. API Gateway/Lambda/Aurora와 NAT 기반 live collector가 실제 동작하는지를 먼저 닫는다.

아직 하지 않는 것:

- Terraform/SQS/EventBridge 기반 platform-scale collector orchestration
- public collector Lambda + S3/SQS + VPC writer 분리
- multi-AZ NAT 확대
- Toss Place 실연동 claim
- Delivery app direct login automation

이 확장은 비용/운영/보안 결정을 동반하므로 다음 milestone에서 다룬다.
