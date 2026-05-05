# STEP 1-A AWS Deployment Foundation Preflight

## 1. 목적

STEP 1-A의 목적은 AWS 배포를 수행하는 것이 아니라, M5에서 완성한 local/static/export-backed MVP를 M6 production-grade minimal AWS architecture로 옮기기 위한 repo/AWS/Terraform 준비 상태를 점검하고 가장 안전한 STEP 1 배포 경로를 정리하는 것이다.

Hard stop:

- `terraform apply` 실행하지 않음
- AWS 리소스 생성/수정/삭제하지 않음
- 배포하지 않음
- AWS mutating command 실행하지 않음

## 2. 초기 점검 결과

작업 디렉터리:

```text
/home/lunar/projects/small-merchant-revenue-ops-backbone
```

Git branch:

```text
main
```

초기 working tree:

```text
clean
```

최근 커밋:

```text
d9d4ee5 (HEAD -> main) docs: finalize M6 portfolio packaging
804f9fd (origin/main) chore: harden M5 revenue cockpit engineering closure
a164d43 docs: close M4 revenue cockpit validation
a9eb8aa feat: add standalone M4 revenue cockpit frontend
4567781 docs: add M4 Claude Design cockpit reference
7e40c07 feat: add M4 revenue ops API foundation
cc777c0 feat: complete M3 revenue ops medallion foundation
7ec46aa docs: add small merchant revenue ops planning baseline
beeff2b chore: initialize small merchant revenue ops backbone
```

## 3. 현재 Repo 배포 준비 상태

현재 repo는 small-merchant Revenue Ops SaaS의 productionization 출발점이다. M5의 완료 기준은 local/static/export-backed MVP였고, M6의 목표는 이를 real-service-grade minimal AWS architecture로 전환하는 것이다.

현재 repo에는 두 가지 구현 축이 있다.

1. M3 Terraform: serverless batch ETL foundation
2. M4/M5 Revenue Cockpit: local/static/export-backed frontend/API MVP

현재 Terraform은 웹 호스팅, Revenue Ops API hosting, Cognito, Aurora Serverless v2를 아직 직접 배포하지 않는다. `infra/terraform/envs/revenue-dev`는 S3 data lake, Glue Catalog/Jobs, Athena, Lambda extractors, Step Functions, EventBridge Scheduler, CloudWatch, SSM Parameter Store를 배포하는 ETL stack이다.

Revenue Cockpit frontend는 `apps/web` Vite app이며, API는 `apps/api/src/server.js` Node entrypoint다. API는 현재 `apps/api/src/revenue-ops/data/revenue_ops_export.json`을 읽는 export-backed API foundation이고, Aurora persistence나 live external collector는 아직 연결하지 않는다. M6에서는 이 경계를 유지한 채, 서비스 운영에 필요한 AWS hosting/API/auth/persistence 기반을 단계적으로 추가한다.

## 4. STEP 1에서 가장 안전한 AWS 배포 아키텍처

STEP 1의 권장 아키텍처는 small-merchant SaaS production-min target을 기준으로 한다. 다만 첫 배포 increment에서는 export-backed data와 fallback behavior를 유지해 운영 리스크를 낮춘다.

```text
React/Vite frontend
  -> S3 + CloudFront + Route 53
  -> API Gateway + Lambda Revenue Ops API
  -> S3 data/artifact bucket for export-backed JSON
  -> Cognito for auth
  -> Aurora Serverless v2 for action status, merchant/store/user/account, pipeline metadata
  -> Glue/Athena/Step Functions/EventBridge/Lambda extractors pipeline
  -> SSM Parameter Store / Secrets Manager
  -> CloudWatch logs/alarms and X-Ray where useful
  -> Terraform IaC
```

STEP 1-B에서 가장 안전한 첫 배포 후보:

- frontend: `apps/web/dist` 정적 build
- hosting: S3 + CloudFront + Route 53 설계/계획
- API: API Gateway + Lambda Revenue Ops API 설계/계획
- data: export-backed JSON artifact를 S3에 두는 경로 설계
- auth/persistence: Cognito/Aurora Serverless v2는 schema와 Terraform 경계를 먼저 설계하고, apply는 별도 승인 후 진행
- fallback: M5 fallback behavior는 초기 운영 안정성 장치로 유지

기존 Terraform ETL stack은 pipeline foundation으로 유지한다. 다만 STEP 1-B에서는 웹/API/auth/persistence 배포 경계와 ETL stack 배포 경계를 분리해 plan을 검토하는 것이 안전하다.

## 5. 지금 배포 가능한 것과 나중으로 미뤄야 할 것

지금 준비 가능한 것:

- `apps/web` production build 검증
- S3 + CloudFront + Route 53 frontend 배포 계획 수립
- API Gateway + Lambda Revenue Ops API 배포 계획 수립
- Cognito/Aurora Serverless v2 배포 범위와 Terraform module 경계 정의
- Terraform formatting 정리
- Terraform bootstrap validate
- Terraform backend/tfvars 준비 목록화
- S3 artifact/static JSON hosting 설계

다음 단계 전까지 대기해야 하는 것:

- Terraform bootstrap apply
- `revenue-dev` Terraform apply
- S3 + CloudFront + Route 53 apply
- API Gateway + Lambda apply/deploy
- Cognito user pool/client/domain apply
- Aurora Serverless v2 cluster/schema apply
- AWS SSM secret update
- Lambda code upload/update
- Step Functions execution
- EventBridge schedule enable
- Aurora persistence 연결
- live external API collector 운영

## 6. 누락된 변수/Secrets

Terraform backend:

- S3 backend `bucket`
- S3 backend `key`
- backend `region`
- DynamoDB lock table name
- backend encryption setting

`revenue-dev` tfvars:

- `data_lake_bucket_name`
- `athena_results_bucket_name`
- 실제 `tags.Contact`
- `use_kms` 선택
- optional schedule policy: `enable_schedule`은 초기에는 반드시 `false` 권장

M6 production-min stack 추가 변수:

- frontend bucket name
- CloudFront distribution aliases
- Route 53 hosted zone ID/domain
- ACM certificate ARN 또는 certificate 생성 경로
- API Gateway domain/base path
- Lambda package/build artifact path
- Cognito user pool/client/domain 설정
- Aurora Serverless v2 engine/version, min/max ACU, subnet/security group, database name
- Secrets Manager 또는 SSM parameter naming convention
- X-Ray enablement 여부

Secrets:

- `/revenue-ops-revenue-dev/SEOUL_OPENAPI_KEY`
- `/revenue-ops-revenue-dev/DATA_GO_KR_SERVICE_KEY`
- `/revenue-ops-revenue-dev/KMA_ASOS_STATION_ID`는 기본 `108`이지만 운영 대상에 맞게 확인 필요
- Aurora master/user credential secret
- Cognito callback/logout URL values
- API runtime environment variables

AWS environment:

- AWS account ID
- AWS profile or environment credentials
- allowed region: `ap-northeast-2`
- IAM permission boundary for Terraform planning/apply

## 7. 비용 리스크

낮은 비용 리스크:

- S3 + CloudFront frontend hosting
- S3 hosted JSON
- S3 data lake idle storage
- SSM standard parameters

중간 비용 리스크:

- Glue Python Shell jobs가 반복 실행될 경우 누적 비용 발생
- Athena query는 scan volume 기준 과금
- CloudWatch logs/metrics는 장기 보존과 로그량에 따라 증가
- API Gateway/Lambda는 트래픽 증가 시 요청량 기반 과금
- Aurora Serverless v2는 min ACU 설정이 지속 비용을 만든다
- Route 53 hosted zone과 CloudFront/ACM 운영 비용이 발생한다

제어 장치:

- `enable_schedule = false` 기본값 유지
- Athena workgroup has 1 GB query scan cutoff
- S3 lifecycle policy 존재
- CloudWatch log retention 30일
- Lambda/Glue는 수동 검증 전 자동 실행 금지
- Aurora Serverless v2는 초기 min ACU를 낮게 잡고 pause/scale 정책을 검토
- CloudFront cache policy와 log retention을 비용 기준으로 제한

## 8. 보안 리스크

현재 긍정적 요소:

- S3 public access block 설정
- S3 server-side encryption 설정
- optional KMS 지원
- SSM SecureString parameter 사용
- Lambda/Glue/Step Functions IAM role 분리
- EventBridge schedule disabled by default

주의할 리스크:

- `use_kms = false` 기본값이면 AWS-managed/AES256 중심이다. production은 KMS 사용 여부를 결정해야 한다.
- Glue role은 data lake bucket read/write/delete 권한을 가진다.
- 일부 Glue Catalog IAM resource가 `*`로 열려 있어 production 최소 권한 점검이 필요하다.
- Terraform state backend 설정 전에는 state 저장 위치와 접근 권한이 확정되지 않았다.
- API Gateway/Lambda에는 Cognito authorizer, CORS, throttling/rate limit, safe error response를 별도 점검해야 한다.
- Aurora Serverless v2는 private subnet/security group, credential rotation, migration role/runtime role 분리가 필요하다.
- CloudFront/S3 frontend는 public bucket이 아니라 OAC/OAI 기반 private origin으로 구성해야 한다.

## 9. 실행한 명령과 결과

Repo inspection:

```bash
pwd
git branch --show-current
git status --short
git log --oneline --decorate -n 10
find . -maxdepth 3 -type f | sort | sed -n '1,200p'
find infra -maxdepth 4 -type f | sort
find docs -maxdepth 2 -type f | sort
```

Result: repo는 STEP 1-A 시작 시 clean. Terraform은 `infra/terraform/bootstrap`, `infra/terraform/envs/revenue-dev`, `infra/terraform/modules/*` 구조.

Local validation:

```bash
npm --prefix apps/web run check
npm --prefix apps/web run build
python3 -m pytest tests/ -q
node --test apps/api/src/**/*.test.js
```

Result:

- web TypeScript check: passed
- web production build: passed
- Python tests: passed, 76 tests
- Node API tests: passed, 46 tests

Terraform:

```bash
terraform version
terraform fmt -recursive -check infra/terraform
terraform fmt -recursive infra/terraform
terraform fmt -recursive -check infra/terraform
terraform -chdir=infra/terraform/bootstrap init -upgrade
terraform -chdir=infra/terraform/bootstrap validate
terraform -chdir=infra/terraform/envs/revenue-dev init -backend=false
terraform -chdir=infra/terraform/envs/revenue-dev validate
```

Result:

- Terraform version: `1.15.0`
- initial `fmt -check`: failed on three files
- `terraform fmt -recursive infra/terraform`: applied formatting only
- final `fmt -check`: passed
- bootstrap init: succeeded after provider access approval
- bootstrap validate: passed after provider plugin execution approval
- revenue-dev init with `-backend=false`: succeeded after provider access approval
- revenue-dev validate: failed because `backend.tf` has an intentionally empty S3 backend block and is missing `bucket` and `key`

Provider prep:

- `hashicorp/archive` provider was added to `infra/terraform/envs/revenue-dev/versions.tf` because `revenue_lambda_extractors` uses `archive_file`.

## 10. Terraform Plan Result

Terraform plan was skipped.

Reason:

- `infra/terraform/envs/revenue-dev/backend.tf` does not yet include S3 backend values.
- `infra/terraform/envs/revenue-dev/terraform.tfvars` is not present.
- account-specific bucket names are not configured.
- AWS credentials/profile were not verified for this preflight.

This is the correct stop point for STEP 1-A. Running `terraform plan` before backend/vars are explicitly configured would produce an unreliable plan and could accidentally bind local state or wrong credentials.

## 11. STEP 1-B Recommended Next Commands

STEP 1-B should still stop before `apply` unless explicitly approved. STEP 1-B의 우선순위는 M6 production-min target을 Terraform 설계/계획으로 구체화하는 것이다.

Recommended first command sequence for existing ETL stack planning prep:

```bash
cd infra/terraform/envs/revenue-dev
cp terraform.tfvars.example terraform.tfvars
```

Then edit `terraform.tfvars` with account-specific bucket names and contact tags.

Recommended STEP 1-B design direction:

- add or design Terraform modules for S3 + CloudFront + Route 53 frontend hosting
- add or design Terraform modules for API Gateway + Lambda Revenue Ops API
- add or design Cognito auth boundary
- add or design Aurora Serverless v2 persistence boundary for Action Planner, merchant/store/user/account, and pipeline metadata
- keep ETL stack schedule disabled until pipeline run approval
- keep M5 export-backed/fallback behavior as an initial rollout safety mechanism

After backend values are known from an approved bootstrap path:

```bash
terraform init \
  -backend-config="bucket=<tfstate-bucket>" \
  -backend-config="key=revenue-ops/revenue-dev/terraform.tfstate" \
  -backend-config="region=ap-northeast-2" \
  -backend-config="dynamodb_table=<tfstate-lock-table>" \
  -backend-config="encrypt=true"

terraform validate
terraform plan -out=tfplan.step1b
terraform show -no-color tfplan.step1b
```

Hard stop remains:

```text
Do not run terraform apply until explicitly approved.
```

## 12. STEP 1-A Closure Judgment

STEP 1-A is complete as a preflight.

Current readiness:

- local app/test validation passed
- Terraform formatting is clean
- bootstrap Terraform validates
- revenue-dev Terraform is structurally present but blocked on backend/tfvars configuration
- Terraform plan is intentionally skipped
- no AWS resource mutation was performed

Recommended STEP 1 architecture:

- first M6 deployment increment: S3 + CloudFront + Route 53 frontend hosting with M5 fallback retained
- second increment: API Gateway + Lambda Revenue Ops API over export-backed S3/JSON data
- third increment: Cognito + Aurora Serverless v2 persistence for SaaS account/action state
- fourth increment: ETL Terraform stack after backend, tfvars, IAM, secrets, and cost controls are approved
