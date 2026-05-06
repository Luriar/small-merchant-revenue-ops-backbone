# STEP 2-E Cognito + Aurora Core Runtime Plan

## 1. 현재 완료 기준

2026-05-06 KST 기준 small-merchant Revenue Ops SaaS의 현재 baseline:

- STEP 2-A backend bootstrap 완료
- STEP 2-B S3 + CloudFront frontend foundation 완료
- STEP 2-C frontend asset deploy + CloudFront invalidation 완료
- STEP 2-D API Gateway + Lambda activation 완료
- STEP 2-D Frontend API Wiring 완료

Live endpoints:

- Frontend: `https://d1fquuc7vsf9cu.cloudfront.net/`
- Revenue Cockpit API mode: `https://d1fquuc7vsf9cu.cloudfront.net/#revenue-cockpit?data=api`
- API Gateway: `https://7q8hxxta67.execute-api.ap-northeast-2.amazonaws.com`

현재 의도적으로 비활성 상태:

- Cognito/Auth
- Aurora/RDS persistence
- ETL/pipeline/schedule
- live external collector
- POS/real merchant ingestion

## 2. STEP 2-E Scope

Plan-only 범위:

- Cognito User Pool
- Cognito User Pool Client
- Aurora PostgreSQL Serverless v2 minimum/dev-prod-min foundation
- Secrets Manager DB credential secret
- API Gateway JWT authorizer and route auth update if Auth is enabled
- Lambda environment/IAM update for Auth/Aurora references
- 관련 outputs

명시적 제외:

- Terraform apply
- Terraform destroy
- Glue/Athena/Step Functions/EventBridge
- live collector/POS ingestion
- WAF/rate-limit hardening
- CloudFront/frontend replacement
- API Gateway/Lambda replacement
- Product Ops/productops resource

## 3. Tfvars

사용한 local ignored tfvars:

```text
infra/terraform/envs/revenue-dev/terraform.step2e.auth-aurora.tfvars
```

비밀 값은 포함하지 않았다. Aurora master password는 `random_password`와 Secrets Manager secret version으로 생성되도록 module이 모델링되어 있다.

핵심 gate:

```hcl
enable_artifacts           = true
enable_frontend            = true
enable_api                 = true
enable_auth                = true
enable_aurora              = true
enable_pipeline_foundation = false
enable_schedule            = false
enable_saas_observability  = false
```

Cognito callback/logout URL:

```text
https://d1fquuc7vsf9cu.cloudfront.net/
```

Aurora network inputs:

```hcl
aurora_vpc_id             = null
aurora_private_subnet_ids = []
```

이 값은 의도적으로 비워 두었다. AWS account 안에 기존 VPC/subnet은 있었지만 Revenue Ops용으로 식별되는 VPC/private subnet tag/name이 없었고, 다른 workload로 보이는 VPC를 임의로 재사용하지 않았다.

## 4. Validation

실행:

```bash
terraform fmt -recursive -check infra/terraform
terraform -chdir=infra/terraform/envs/revenue-dev validate
```

결과:

- `terraform fmt -recursive -check infra/terraform`: passed
- `terraform validate`: passed
- warning: backend `dynamodb_table` parameter deprecated, `use_lockfile` 권장

STEP 2-E plan 중 API authorizer count가 새 Cognito resource output에 의존하는 문제가 있었다. 이를 known boolean인 `enable_cognito_authorizer`로 제어하도록 module을 좁게 수정했다.

## 5. Plan Result

실행:

```bash
terraform -chdir=infra/terraform/envs/revenue-dev plan \
  -var-file=terraform.step2e.auth-aurora.tfvars \
  -out=tfplan.step2e.auth-aurora \
  -no-color
```

결과:

- command exit code: `1`
- saved planfile was produced, but the command ended with validation errors
- `terraform show -json tfplan.step2e.auth-aurora` inspection succeeded
- apply recommendation: **do not apply**

Planfile action counts from `terraform show -json`:

```json
{
  "create": 6,
  "update": 3,
  "delete": 0,
  "replace": 0
}
```

Exact non-no-op resource list:

```text
create module.aurora.aws_secretsmanager_secret.master[0]
create module.aurora.aws_secretsmanager_secret_version.master[0]
create module.aurora.random_password.master[0]
create module.auth.aws_cognito_user_pool.main[0]
create module.auth.aws_cognito_user_pool_client.web[0]
read   module.revenue_api.data.aws_iam_policy_document.api_lambda_permissions[0]
create module.revenue_api.aws_apigatewayv2_authorizer.cognito[0]
update module.revenue_api.aws_apigatewayv2_route.revenue[0]
update module.revenue_api.aws_iam_policy.api_lambda[0]
update module.revenue_api.aws_lambda_function.api[0]
```

Terraform also reported:

```text
Plan: 6 to add, 3 to change, 0 to destroy.
```

## 6. Blockers

The plan command failed on Aurora input validation:

```text
vpc_id is required when enable_aurora is true.
```

```text
At least two private_subnet_ids are required when enable_aurora is true.
```

Exact variables:

- `aurora_vpc_id` is `null`
- `aurora_private_subnet_ids` is `[]`

Read-only AWS EC2 discovery found existing VPCs/subnets, but none were clearly Revenue Ops-owned. Because Aurora is required to be private-subnet-only and this is a small-merchant Revenue Ops SaaS, the safe gate is to select or create a reviewed Revenue Ops VPC/private subnet pair before apply.

## 7. Expected vs Unexpected

Expected resources in the partial plan:

- Cognito user pool and web client
- Secrets Manager secret and generated secret version
- generated DB password
- API Gateway Cognito JWT authorizer
- API route update from `NONE` to `JWT`
- Lambda IAM policy update for secret read
- Lambda env update for Auth/Aurora references

Expected but not present because the plan failed before a complete Aurora plan:

- Aurora DB subnet group
- Aurora security group and rules
- Aurora PostgreSQL Serverless v2 cluster
- Aurora cluster instance

Unexpected resources:

- none observed in the inspectable planfile

Not present:

- Glue
- Athena
- Step Functions
- EventBridge/Scheduler
- collector
- POS ingestion
- CloudFront/frontend replacement
- API Gateway replacement
- Lambda replacement

## 8. Cost Notes

Modeled Aurora defaults:

- engine: Aurora PostgreSQL
- engine version: `16.4`
- instance class: `db.serverless`
- min ACU: `0.5`
- max ACU: `1`
- backup retention: `7`
- deletion protection: enabled
- PostgreSQL log export enabled

Cost risk:

- Aurora Serverless v2 still has ongoing ACU/storage/backup/log costs once applied.
- Secrets Manager secret has recurring cost.
- Cognito is low/no cost at this stage for minimal users, but not free at arbitrary user scale.

Apply should wait until the Aurora VPC/private subnet decision is reviewed.

## 9. Security Notes

Cognito module:

- email username and auto-verify
- admin-created users only
- password minimum length 12 with upper/lower/number/symbol
- token validity: access/id 60 minutes, refresh 30 days
- MFA currently `OFF`
- hosted domain disabled because `cognito_domain_prefix = null`

Aurora module:

- generated password stored in Secrets Manager
- storage encrypted
- deletion protection enabled
- private subnet IDs required by module validation
- ingress allowed only from supplied security group IDs

API integration impact:

- enabling Auth plans to create API Gateway JWT authorizer
- existing `ANY /api/v1/revenue/{proxy+}` route changes from unauthenticated `NONE` to `JWT`
- frontend auth login/token flow is not implemented yet
- applying this as-is would likely break unauthenticated Revenue Cockpit API mode until frontend auth wiring exists

## 10. Persistence Status

Aurora persistence is not wired into current handlers yet. Even after the DB foundation exists, the current API remains export-backed/static-data-backed until application code is updated to use Aurora for durable action status and runtime state.

## 11. Apply Gate

Do not apply the current saved plan.

Reasons:

- plan command exited with validation errors
- Aurora VPC/private subnet inputs are missing
- saved plan is incomplete for Aurora core runtime
- API route would switch to JWT before frontend auth flow is available

Before an apply can be considered:

1. Select or provision a Revenue Ops-owned VPC and at least two private subnets.
2. Set `aurora_vpc_id` and `aurora_private_subnet_ids` in the local STEP 2-E tfvars.
3. Decide whether API JWT enforcement should be applied now or staged after frontend auth wiring.
4. Regenerate the Terraform plan.
5. Confirm `0 destroy`, `0 replace`, and only expected Auth/Aurora/API env/auth changes.
6. Confirm no ETL/pipeline/schedule/live collector/POS resources.

Exact approval phrase for a later run:

```text
Approve STEP 2-E apply after updating aurora_vpc_id and aurora_private_subnet_ids; regenerate the plan first and apply only if it has 0 destroy, 0 replace, and expected Auth/Aurora/API changes only.
```
