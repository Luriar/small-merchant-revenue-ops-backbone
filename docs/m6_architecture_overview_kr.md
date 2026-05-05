# M6 Architecture Overview

## 1. Implemented Now

현재 구현은 M3 Gold/export data를 Revenue Ops API와 standalone cockpit으로 연결하는 로컬 포트폴리오 아키텍처다.

```text
M3 medallion/gold
  -> deterministic JSON export
  -> Revenue Ops API
  -> #revenue-cockpit API mode
  -> fallback to demo data
```

## 2. Data Flow

1. M3 pipeline이 Bronze/Silver/Gold 구조로 public commerce/context sample data를 처리한다.
2. Gold mart에서 revenue brief, anomaly, evidence, action, context, pipeline metadata가 생성된다.
3. `scripts/export_gold_to_json.py`가 Gold 결과를 deterministic JSON artifact로 변환한다.
4. JSON artifact는 `apps/api/src/revenue-ops/data/revenue_ops_export.json`에 위치한다.
5. Revenue Ops API는 `/api/v1/revenue/*` endpoint로 export-backed 데이터를 제공한다.
6. `#revenue-cockpit?data=api`는 API를 호출해 화면 scenario를 구성한다.
7. API 호출 실패 시 frontend는 bundled demo data로 fallback한다.

## 3. API Layer Responsibility

API layer의 현재 책임:

- export-backed JSON 로드
- briefs/anomalies/actions/context/pipeline-meta 응답 제공
- action status update validation
- 로컬 demo용 in-memory action status 관리
- safe error response와 route test coverage 유지

현재 API layer가 하지 않는 것:

- Revenue Ops action status를 Aurora에 영구 저장
- live external API를 호출해 context를 수집
- AWS Lambda/API Gateway로 배포

## 4. Frontend Responsibility

Frontend의 현재 책임:

- standalone `#revenue-cockpit` 경험 제공
- demo/static mode와 API mode 분리
- API failure fallback
- Revenue Brief, Cause Evidence, Action Planner, Data Reliability 표시
- Action Planner 상태 변경 UI와 API PATCH 요청
- KO/EN, Light/Dark/System 전환

## 5. Validation/Test Layer

현재 validation layer:

- `npm --prefix apps/web run check`: TypeScript check
- `npm --prefix apps/web run build`: production build
- `python3 -m pytest tests/ -q`: M3/export/pipeline 관련 Python tests
- `node --test apps/api/src/**/*.test.js`: Node API tests
- `npm run validate:m5:engineering`: 위 검증을 묶는 M5 validation wrapper

validation은 로컬 검증만 수행한다. AWS resource mutation, Terraform apply, deployment는 포함하지 않는다.

## 6. AWS Readiness Boundary

`docs/m5_aws_deployment_readiness_kr.md`는 AWS 배포 경로와 선행 조건을 정리한 readiness 문서다.

현재 repo state에서 실제로 수행하지 않은 것:

- AWS deployment
- Terraform apply
- Aurora runtime connection
- production API hosting
- live external context collector

## 7. Future Production Expansion

미래 production architecture 후보:

- POS/order/sales live ingestion
- external context collectors for weather/events/commerce signals
- Aurora persistence for action status and operational state
- scheduled pipeline orchestration
- deployed frontend on Amplify or S3 + CloudFront
- API Gateway + Lambda or containerized API
- observability, alerting, runbook, rollback workflow
- tenant/account model and access control

## 8. Separation of Claims

Implemented now:

- medallion foundation
- Gold to JSON export
- local Revenue Ops API
- standalone cockpit
- API mode and fallback
- local validation
- portfolio documentation

Future production expansion:

- real deployment
- real persistence
- live collection
- multi-tenant production operations
