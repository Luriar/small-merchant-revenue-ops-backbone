# M6 Production Transition Baseline

## 1. 문서 목적

이 문서는 M5에서 완성한 small-merchant Revenue Ops local MVP를 M6에서 real-service-grade minimal AWS architecture로 전환하기 위한 기준선이다.

중요한 구분:

- M5: static/export-backed local MVP 완료
- M6: production-grade minimal AWS deployment transition

M6 초기 배포에서도 export-backed data와 fallback behavior를 유지할 수 있다. 이는 포트폴리오 한정 전략이 아니라, productionization 초기 단계에서 운영 리스크를 낮추는 rollout control이다.

## 2. M5 Completed State

M5 완료 상태:

- M3 Gold/export 기반 deterministic JSON artifact
- Revenue Ops API foundation
- `#revenue-cockpit` standalone frontend
- `#revenue-cockpit?data=api` API mode
- API failure -> demo fallback
- Action Planner status PATCH wiring
- Revenue Ops API Node tests
- web check/build validation
- Python pipeline/export tests
- M5 validation script
- AWS deployment readiness document

M5의 데이터 경계:

- context data는 static/export-backed
- API mode는 local JSON export 기반
- Action Planner status persistence는 local/in-memory 수준
- AWS deployment, Aurora persistence, live external collection은 아직 완료하지 않음

## 3. M6 Productionization Goal

M6의 목표는 M5 MVP를 small-merchant SaaS로 운영 가능한 최소 AWS 구조에 올리는 것이다.

M6에서 달성하려는 방향:

- 실제 AWS-hosted frontend
- API Gateway + Lambda 기반 Revenue Ops API
- S3 기반 data/artifact layer
- Cognito auth boundary
- Aurora Serverless v2 persistence boundary
- Glue/Athena/Step Functions/EventBridge/Lambda extractor pipeline foundation
- SSM Parameter Store / Secrets Manager configuration
- CloudWatch/X-Ray observability
- Terraform IaC로 plan/apply 가능한 구조

M6는 "포트폴리오 정적 데모"가 아니라 production transition이다. 단, 첫 단계에서는 export-backed data와 fallback behavior를 유지해 배포 blast radius를 줄인다.

## 4. Small-Merchant SaaS Product Definition

제품 정의:

소상공인이 매출 변화의 원인 후보를 근거와 함께 이해하고, 다음 실행 액션을 계획/추적할 수 있게 돕는 Revenue Ops SaaS.

핵심 사용자:

- 소상공인/매장 운영자
- 프랜차이즈 소규모 지점 운영 담당자
- 매출 운영을 관리하는 owner/operator

핵심 product surface:

- Revenue Brief
- Cause Evidence
- Action Planner
- Data Reliability

핵심 운영 데이터:

- merchant/account/user
- store metadata
- revenue brief/anomaly/evidence/action artifacts
- action status and history
- pipeline run metadata
- data source reliability metadata

## 5. Current Completed Progress

완료된 구현:

- M3 medallion/gold pipeline foundation
- Gold -> JSON export
- Revenue Ops API route foundation
- React/Vite Revenue Cockpit frontend
- API mode and fallback behavior
- Action Planner PATCH route
- local validation suite
- M6 packaging docs
- STEP 1-A AWS preflight report

완료된 Terraform 기반:

- bootstrap backend resources definition
- `revenue-dev` ETL stack definition
- S3 data lake / Athena / Glue / Lambda extractors / Step Functions / EventBridge / CloudWatch / SSM modules

아직 Terraform에 없는 production-min SaaS 요소:

- S3 + CloudFront + Route 53 frontend hosting module
- API Gateway + Lambda Revenue Ops API module
- Cognito auth module
- Aurora Serverless v2 persistence module
- API runtime packaging/deployment path
- production domain/certificate path

## 6. Current Non-Goals

M6 STEP 1 target에서 제외:

- MSK
- EKS
- Strimzi
- Debezium
- ClickHouse
- Argo CD
- Argo Rollouts
- Kafka/CDC streaming platform
- multi-region production HA
- enterprise observability stack

M6 STEP 1에서 즉시 하지 않는 것:

- `terraform apply`
- production traffic cutover
- live external collector schedule enablement
- Aurora schema migration apply
- Cognito real user onboarding
- paid domain/certificate changes without approval

## 7. Production-Min AWS Target Stack

Target stack:

- Frontend: React/Vite static build on S3 + CloudFront + Route 53
- API: API Gateway + Lambda for Revenue Ops API
- Data/artifacts: S3 for export-backed JSON and pipeline artifacts
- Pipeline: Glue, Athena, Step Functions, EventBridge, Lambda extractors
- Config/secrets: SSM Parameter Store / Secrets Manager
- Auth: Cognito
- Persistence: Aurora Serverless v2
- Observability: CloudWatch logs/alarms, X-Ray where useful
- IaC: Terraform

Persistence target:

- Action Planner status
- merchant/store metadata
- user/account data
- pipeline run metadata

Initial rollout policy:

- keep `enable_schedule = false`
- keep fallback behavior
- begin with export-backed data path
- add Aurora-backed persistence behind explicit migration and runtime config
- require plan review before apply

## 8. Distinction From Product Ops Backbone

이 프로젝트는 `small-merchant-revenue-ops-backbone`이다.

현재 STEP 1 target은 small-merchant Revenue Ops SaaS이며, 과거 Product Ops Backbone의 heavy platform stack이 아니다.

명시적으로 가져오지 않는 Product Ops assumptions:

- Kafka/MSK streaming backbone
- Debezium CDC
- Strimzi operator
- EKS workload platform
- ClickHouse read model
- Argo CD / Argo Rollouts deployment model

현재 방향은 small merchant revenue operation에 필요한 최소 SaaS runtime이다.

## 9. What Remains For STEP 1-B

STEP 1-B에서 해야 할 일:

- production-min Terraform module boundary 확정
- frontend hosting module 설계: S3, CloudFront, Route 53, ACM/OAC
- API module 설계: API Gateway, Lambda, IAM, logs, X-Ray option
- Cognito module 설계: user pool, app client, domain/callback/logout settings
- Aurora Serverless v2 module 설계: subnet/security group, cluster, credentials, schema migration boundary
- S3 artifact/export JSON hosting path 설계
- backend/tfvars configuration 준비
- non-mutating `terraform validate` / `terraform plan` 경로 확정
- cost/security review checklist 작성

STEP 1-B에서도 hard stop:

- `terraform apply` 금지
- AWS resource mutation 금지
- deployment 금지
- plan review 전 production changes 금지

## 10. Baseline Decision

M6 production transition의 기본 결정:

M5의 export-backed/fallback model을 버리지 않는다. 대신 이를 초기 AWS rollout의 safety layer로 유지하면서, frontend/API/auth/persistence/pipeline/observability/IaC를 real-service-grade minimal architecture로 끌어올린다.
