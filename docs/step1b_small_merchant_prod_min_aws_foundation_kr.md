# STEP 1-B Small Merchant Production-Min AWS Foundation

## 1. 목적

STEP 1-B의 목적은 small-merchant Revenue Ops SaaS를 위한 production-min AWS foundation의 Terraform module boundary를 설계하고 skeleton으로 준비하는 것이다.

Hard stop:

- `terraform apply` 실행하지 않음
- 배포하지 않음
- AWS 리소스 생성/수정/삭제하지 않음
- live external collector schedule enable하지 않음
- Aurora schema migration apply하지 않음
- POS ingestion, multi-tenancy, product feature 변경하지 않음

## 2. 기준 프레이밍

M5는 local/static/export-backed MVP를 완료한 단계다.

M6는 이 MVP를 real-service-grade minimal AWS architecture로 옮기는 productionization 단계다. 초기 배포에서 export-backed data와 fallback behavior를 유지하는 것은 productionization을 부정하는 것이 아니라 rollout risk를 낮추기 위한 control이다.

이 프로젝트는 `small-merchant-revenue-ops-backbone`이다. Product Ops Backbone의 MSK, EKS, Strimzi, Debezium, ClickHouse, Argo CD, Argo Rollouts assumptions를 가져오지 않는다.

## 3. Architecture Decision

결정: 기존 `infra/terraform/envs/revenue-dev` 환경을 확장하되, production-min SaaS runtime은 별도 module group으로 분리한다.

이유:

- 기존 `revenue-dev`는 이미 Revenue Ops ETL foundation을 대표한다.
- frontend/API/auth/persistence도 같은 small-merchant SaaS environment의 일부다.
- 별도 environment를 만들면 backend/tfvars/state 관리가 불필요하게 분리된다.
- module boundary를 분리하면 ETL, frontend, API, auth, persistence를 enable flag로 독립 제어할 수 있다.

Cost guardrail 결정:

- `enable_frontend = false`
- `enable_api = false`
- `enable_auth = false`
- `enable_aurora = false`
- `enable_artifacts = false`
- `enable_saas_observability = false`
- 기존 `enable_schedule = false`

즉, skeleton은 Terraform code로 존재하지만 apply 전까지 리소스를 만들지 않는다.

## 4. Final STEP 1-B Target Architecture

```text
React/Vite frontend
  -> revenue_frontend_hosting
     S3 private origin + CloudFront + optional Route 53 alias + OAC

Revenue Ops API
  -> revenue_api_gateway_lambda
     API Gateway HTTP API + Lambda + optional Cognito JWT authorizer + optional custom domain

Data/artifacts
  -> revenue_artifacts
     S3 bucket for export-backed JSON, API packages, frontend builds, pipeline artifacts

Auth
  -> revenue_cognito
     User Pool + Web App Client + optional hosted UI domain

Persistence
  -> revenue_aurora
     Aurora PostgreSQL Serverless v2 + subnet group + security group + Secrets Manager credentials

Pipeline
  -> existing modules
     S3 data lake + Glue + Athena + Step Functions + EventBridge + Lambda extractors + SSM

Observability
  -> existing revenue_observability for ETL
  -> revenue_saas_observability for API/frontend alarms
```

## 5. Terraform Structure Created/Updated

Updated environment:

- `infra/terraform/envs/revenue-dev/providers.tf`
- `infra/terraform/envs/revenue-dev/variables.tf`
- `infra/terraform/envs/revenue-dev/main.tf`
- `infra/terraform/envs/revenue-dev/outputs.tf`
- `infra/terraform/envs/revenue-dev/terraform.tfvars.example`

New module groups:

- `infra/terraform/modules/revenue_artifacts`
- `infra/terraform/modules/revenue_frontend_hosting`
- `infra/terraform/modules/revenue_api_gateway_lambda`
- `infra/terraform/modules/revenue_cognito`
- `infra/terraform/modules/revenue_aurora`
- `infra/terraform/modules/revenue_saas_observability`

## 6. Module Boundary Summary

### revenue_artifacts

Purpose:

- export-backed JSON
- Lambda/API packages
- frontend build artifacts
- pipeline artifacts

Resources when enabled:

- private S3 bucket
- versioning
- SSE
- public access block
- lifecycle for old API packages
- prefix markers

### revenue_frontend_hosting

Purpose:

- React/Vite static hosting foundation

Resources when enabled:

- private S3 frontend bucket
- CloudFront distribution
- CloudFront OAC
- S3 bucket policy allowing CloudFront read only
- optional Route 53 aliases

Guardrails:

- bucket is private
- public access blocked
- HTTPS redirect
- SPA 403/404 fallback to `index.html`
- `PriceClass_100` default

### revenue_api_gateway_lambda

Purpose:

- Revenue Ops API hosting foundation

Resources when enabled:

- Lambda execution role/policy
- Lambda function from S3 package artifact
- HTTP API Gateway
- API route for `/api/v1/revenue/{proxy+}`
- optional Cognito JWT authorizer
- optional custom domain and Route 53 alias
- optional X-Ray tracing

Guardrails:

- Lambda package must be explicit S3 bucket/key
- throttling defaults on `$default` stage
- CORS limited to HTTPS origins
- auth can be attached when Cognito is enabled and wired

### revenue_cognito

Purpose:

- small-merchant SaaS auth boundary

Resources when enabled:

- Cognito user pool
- web app client
- optional hosted UI domain

Guardrails:

- admin-created users only in initial skeleton
- email as username
- strong password policy
- no generated client secret for SPA

### revenue_aurora

Purpose:

- persistence foundation for Action Planner status, merchant/store metadata, user/account data, pipeline run metadata

Resources when enabled:

- Aurora PostgreSQL Serverless v2 cluster
- one serverless cluster instance
- DB subnet group
- security group
- generated master password
- Secrets Manager secret

Guardrails:

- requires VPC ID and at least two private subnets
- ingress only from approved security group IDs
- deletion protection enabled
- backup retention 7 days
- min/max ACU default `0.5/1`
- no schema migration apply in STEP 1-B

### revenue_saas_observability

Purpose:

- API/frontend runtime alarm skeleton

Resources when enabled:

- API Lambda log group
- Lambda error alarm
- API Gateway 5xx alarm
- CloudFront 5xx rate alarm

Guardrails:

- alarms only attach when referenced resources exist
- alarm actions are explicit input

## 7. Variables/Secrets Required Before Plan/Apply

Existing ETL/backend:

- Terraform backend S3 bucket
- Terraform backend key
- Terraform backend DynamoDB lock table
- `data_lake_bucket_name`
- `athena_results_bucket_name`
- `glue_database_name`
- `use_kms`
- `enable_schedule = false`

Production-min SaaS:

- `artifact_bucket_name`
- `frontend_bucket_name`
- `frontend_domain_aliases`
- `frontend_hosted_zone_id`
- `frontend_acm_certificate_arn`
- `api_lambda_s3_bucket`
- `api_lambda_s3_key`
- `api_custom_domain_name`
- `api_acm_certificate_arn`
- `api_hosted_zone_id`
- `cognito_callback_urls`
- `cognito_logout_urls`
- `cognito_domain_prefix`
- `aurora_vpc_id`
- `aurora_private_subnet_ids`
- `aurora_allowed_security_group_ids`
- `aurora_database_name`
- `aurora_master_username`
- `aurora_min_acu`
- `aurora_max_acu`
- `alarm_actions`

Secrets:

- Seoul OpenAPI key
- data.go.kr key
- optional KMA station config
- Aurora generated master secret
- future API runtime secrets

## 8. Cost Guardrails

- All new SaaS modules default disabled.
- Existing `enable_schedule` remains false.
- CloudFront default price class is `PriceClass_100`.
- Aurora default max ACU is `1`.
- API Gateway throttling defaults are low for the initial foundation.
- Artifact bucket expires old API packages after 90 days.
- CloudWatch log retention defaults to 30 days for new API log group.

## 9. Security Guardrails

- S3 frontend origin uses CloudFront OAC, not public bucket hosting.
- S3 public access block is enabled for frontend/artifacts.
- API can use Cognito JWT authorizer.
- Aurora is private-subnet-only by input contract and allows ingress only from approved security groups.
- Aurora credentials are generated and stored in Secrets Manager.
- Terraform state backend must be configured before plan/apply.
- Runtime secrets must use SSM/Secrets Manager; no secrets in tfvars except non-secret identifiers.

## 10. Validation Results

Validation performed in STEP 1-B:

- Terraform layout/docs inspected.
- `terraform fmt -recursive infra/terraform`: completed.
- `terraform fmt -recursive -check infra/terraform`: passed.
- `npm --prefix apps/web run check`: passed.
- `npm --prefix apps/web run build`: passed.
- `python3 -m pytest tests/ -q`: passed, 76 tests.
- `node --test apps/api/src/**/*.test.js`: passed, 46 tests.
- `terraform -chdir=infra/terraform/envs/revenue-dev init -backend=false`: passed after provider access approval.
- `terraform -chdir=infra/terraform/envs/revenue-dev validate`: blocked by intentionally incomplete S3 backend config (`bucket`, `key` missing).
- module-level Terraform init/validate sweep: completed for the six new modules; all returned valid. The API module emitted a provider deprecation warning for `data.aws_region.current.name`.
- Follow-up API module validate after replacing the deprecated provider attribute with `data.aws_region.current.region`: not rerun because the approval system rejected the additional provider-validation request due usage limit. Formatting remained clean.

Generated artifact note:

- `npm --prefix apps/web run build` dirtied `apps/web/tsconfig.tsbuildinfo`.
- Attempted cleanup with `git restore apps/web/tsconfig.tsbuildinfo`, but the command failed because `.git/index.lock` could not be created in the sandbox (`Read-only file system`).

Terraform plan intentionally not run in STEP 1-B until backend/tfvars/profile are explicit and safe.

## 11. What Remains Before Plan

Before `terraform plan`:

- Decide whether STEP 1-B plan should cover only new disabled modules or an enabled subset.
- Configure backend safely.
- Prepare `terraform.tfvars` with account-specific values.
- Decide domain and hosted zone.
- Decide ACM certificate strategy.
- Build/package API Lambda artifact and place it in an approved artifact bucket path.
- Decide Cognito callback/logout URLs.
- Select VPC/private subnets/security group model for Aurora.
- Confirm Aurora schema migration boundary and do not apply it yet.
- Confirm cost cap expectations for Aurora/API/CloudFront.

## 12. Next Direction

Recommended next step:

1. Review this skeleton and decide enabled subset for the first plan.
2. Keep `enable_schedule = false`.
3. Keep `enable_aurora = false` until network and schema migration boundaries are reviewed.
4. Start with `enable_artifacts`, `enable_frontend`, and possibly `enable_api` only after Lambda package path and domain/cert decisions are ready.
5. Run only `terraform plan` after backend/tfvars/profile are explicit.

Hard stop remains: no `terraform apply` or deployment without explicit approval.
