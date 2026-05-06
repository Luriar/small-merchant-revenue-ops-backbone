# Remaining Work Master Handoff

## 1. 목적과 현재 기준

이 문서는 2026-05-06 KST 기준 final high-capacity execution pass를 시작하기 전의 durable handoff snapshot이다.

현재 프로젝트 정체성은 **small-merchant Revenue Ops SaaS**다. 저장소의 legacy reference와 `AGENTS.md`에는 Product Ops Backbone/traceability 기준이 남아 있으나, 이번 실행에서는 Product Ops stack 가정을 도입하지 않는다.

명시적으로 도입하지 않는 범위:

- MSK, EKS, Strimzi, Kubernetes
- Debezium, ClickHouse, CDC read-model stack
- Argo CD, Argo Rollouts
- release/flag governance stack
- Product Ops/productops resource

기준 문서는 수정하지 않고 구현/운영 handoff 문서만 추가한다.

## 2. 시작 상태

Git 상태:

```text
git status --short
<clean>
```

최근 commit:

```text
71766b0 (HEAD -> main) docs: record STEP 2-D partial API apply and IAM blocker
7d356d3 chore: prepare STEP 2-D API Gateway Lambda activation
d81695b docs: record STEP 2-C CloudFront invalidation completion
99a36e8 docs: record STEP 2-C frontend asset deploy smoke test
68e8055 docs: record STEP 2-B frontend foundation completion
7ffd630 docs: record STEP 2-B tag permission fix and taint blocker
fd6a09c docs: record STEP 2-B CloudFront partial completion and tag permission blocker
a737d7e docs: record STEP 2-B CloudFront IAM fix and remaining plan
d7dc637 docs: plan STEP 2-B CloudFront IAM permission fix
c0c9181 docs: record STEP 2-B frontend foundation partial apply
d97f3b5 chore: connect revenue-dev to revenue-ops backend and record first plan
d9fc200 docs: record STEP 2-A backend bootstrap complete
3b94616 docs: document STEP 2-A backend bootstrap and IAM blocker
17b26f6 docs: add STEP 2-A first AWS activation plan report
17ebe1b chore: prepare STEP 1-E first AWS activation readiness package
3268dd8 chore: gate pipeline foundation for frontend-first plan
f3d3f44 chore: prepare STEP 1-C Terraform plan readiness
615bb99 chore: add STEP 1-B production-min AWS foundation skeleton
921375e docs: clarify M6 production transition baseline
bbab0cf chore: complete STEP 1-A AWS deployment preflight
```

검토한 문서/상태:

- `docs/step2d_api_gateway_lambda_apply_report_kr.md`
- `docs/step2d_api_gateway_lambda_activation_plan_kr.md`
- `docs/step2c_frontend_asset_deploy_smoke_test_kr.md`
- `infra/terraform/envs/revenue-dev/backend.tf`
- `infra/terraform/envs/revenue-dev/terraform.step1c.first-subset.tfvars`
- `terraform -chdir=infra/terraform/envs/revenue-dev state list`
- `aws apigatewayv2 get-api --api-id 7q8hxxta67`
- `aws apigatewayv2 get-stages --api-id 7q8hxxta67`
- `aws lambda get-function --function-name revenue-ops-revenue-dev-revenue-api`

## 3. 현재 라이브 엔드포인트

Frontend:

- Live frontend URL: `https://d1fquuc7vsf9cu.cloudfront.net/`
- Revenue Cockpit URL: `https://d1fquuc7vsf9cu.cloudfront.net/#revenue-cockpit`
- Revenue Cockpit API-mode URL: `https://d1fquuc7vsf9cu.cloudfront.net/#revenue-cockpit?data=api`

API Gateway:

- API ID: `7q8hxxta67`
- Endpoint: `https://7q8hxxta67.execute-api.ap-northeast-2.amazonaws.com`
- API name: `revenue-ops-revenue-dev-revenue-api`
- Protocol: HTTP API
- Region: `ap-northeast-2`

Lambda:

- Function name: `revenue-ops-revenue-dev-revenue-api`
- Runtime: `nodejs20.x`
- Handler: `index.handler`
- State: `Active`
- Last update status: `Successful`
- Current environment includes `ARTIFACT_BUCKET = revenue-ops-artifacts-dev-827913617635`
- Auth/Aurora env wiring is not enabled yet.

## 4. 완료된 단계

완료:

- STEP 1
- STEP 2-A backend bootstrap
- STEP 2-B frontend foundation
- STEP 2-C frontend asset deploy, CloudFront invalidation, smoke test

STEP 2-C 결과:

- Frontend S3 bucket upload 완료
- CloudFront distribution `E31KH7PFML1A6N` deployed
- Invalidation `/*` 완료
- Root, `index.html`, static JS/CSS, `#revenue-cockpit`, `#revenue-cockpit?data=api`는 SPA shell 기준 HTTP 200 확인

## 5. STEP 2-D 현재 부분 상태

STEP 2-D는 부분 완료 상태다.

Terraform state에 존재하는 STEP 2-D 리소스:

```text
module.revenue_api.data.aws_caller_identity.current
module.revenue_api.data.aws_iam_policy_document.api_lambda_permissions[0]
module.revenue_api.data.aws_iam_policy_document.lambda_trust
module.revenue_api.data.aws_region.current
module.revenue_api.aws_apigatewayv2_api.api[0]
module.revenue_api.aws_apigatewayv2_integration.lambda[0]
module.revenue_api.aws_apigatewayv2_route.revenue[0]
module.revenue_api.aws_iam_policy.api_lambda[0]
module.revenue_api.aws_iam_role.api_lambda[0]
module.revenue_api.aws_iam_role_policy_attachment.api_lambda[0]
module.revenue_api.aws_lambda_function.api[0]
module.revenue_api.aws_lambda_permission.api_gateway[0]
```

Terraform state에 없는 STEP 2-D 리소스:

```text
module.revenue_api.aws_apigatewayv2_stage.default[0]
```

AWS live 확인:

- API Gateway API exists: `7q8hxxta67`
- API Gateway endpoint exists: `https://7q8hxxta67.execute-api.ap-northeast-2.amazonaws.com`
- `$default` stage exists remotely and has `AutoDeploy = true`
- Lambda function exists and is active
- Lambda permission exists in Terraform state

주의:

- `$default` stage는 AWS에는 존재하지만 Terraform state에는 없다.
- 다음 plan에서 stage create가 다시 나타날 수 있다.
- 이 경우 apply 전에 import 또는 narrow self-heal 필요성을 판단하고, state 변경 후에는 반드시 새 plan을 생성한다.

마지막으로 알려진 blocker:

```text
apigateway:TagResource on arn:aws:apigateway:ap-northeast-2::/apis/7q8hxxta67/stages
```

요청된 stage TagResource simulation 대상:

```text
arn:aws:apigateway:ap-northeast-2::/apis/7q8hxxta67/stages
arn:aws:apigateway:ap-northeast-2::/apis/7q8hxxta67/stages/*
arn:aws:apigateway:ap-northeast-2::/apis/*/stages
arn:aws:apigateway:ap-northeast-2::/apis/*/stages/*
```

## 6. 생성된 AWS 리소스 요약

이미 생성된 리소스 계열:

- Terraform backend bucket: `revenue-ops-tfstate-827913617635`
- Terraform lock table: `revenue-ops-tflock`
- Artifact bucket: `revenue-ops-artifacts-dev-827913617635`
- Frontend bucket: `revenue-ops-frontend-dev-827913617635`
- CloudFront OAC
- CloudFront distribution: `E31KH7PFML1A6N`
- Revenue API Lambda function/IAM role/IAM policy/attachment
- API Gateway HTTP API: `7q8hxxta67`
- API Gateway integration
- API Gateway route
- Lambda permission for API Gateway
- API Gateway `$default` stage exists remotely but is not yet recorded in Terraform state

현재 Terraform state 전체 주요 목록:

```text
module.artifacts.aws_s3_bucket.artifacts[0]
module.artifacts.aws_s3_bucket_lifecycle_configuration.artifacts[0]
module.artifacts.aws_s3_bucket_public_access_block.artifacts[0]
module.artifacts.aws_s3_bucket_server_side_encryption_configuration.artifacts[0]
module.artifacts.aws_s3_bucket_versioning.artifacts[0]
module.artifacts.aws_s3_object.prefix_markers["api-packages/"]
module.artifacts.aws_s3_object.prefix_markers["exports/"]
module.artifacts.aws_s3_object.prefix_markers["frontend-builds/"]
module.artifacts.aws_s3_object.prefix_markers["pipeline-artifacts/"]
module.frontend_hosting.data.aws_iam_policy_document.frontend_bucket_policy[0]
module.frontend_hosting.aws_cloudfront_distribution.frontend[0]
module.frontend_hosting.aws_cloudfront_origin_access_control.frontend[0]
module.frontend_hosting.aws_s3_bucket.frontend[0]
module.frontend_hosting.aws_s3_bucket_policy.frontend[0]
module.frontend_hosting.aws_s3_bucket_public_access_block.frontend[0]
module.frontend_hosting.aws_s3_bucket_server_side_encryption_configuration.frontend[0]
module.frontend_hosting.aws_s3_bucket_versioning.frontend[0]
module.revenue_api.data.aws_caller_identity.current
module.revenue_api.data.aws_iam_policy_document.api_lambda_permissions[0]
module.revenue_api.data.aws_iam_policy_document.lambda_trust
module.revenue_api.data.aws_region.current
module.revenue_api.aws_apigatewayv2_api.api[0]
module.revenue_api.aws_apigatewayv2_integration.lambda[0]
module.revenue_api.aws_apigatewayv2_route.revenue[0]
module.revenue_api.aws_iam_policy.api_lambda[0]
module.revenue_api.aws_iam_role.api_lambda[0]
module.revenue_api.aws_iam_role_policy_attachment.api_lambda[0]
module.revenue_api.aws_lambda_function.api[0]
module.revenue_api.aws_lambda_permission.api_gateway[0]
```

## 7. 의도적으로 활성화하지 않은 리소스

현재까지 의도적으로 활성화하지 않았다:

- Cognito/Auth
- Aurora/RDS
- ETL pipeline
- Glue, Athena, Step Functions
- EventBridge schedules
- live collectors
- POS ingestion
- real merchant/POS data ingestion
- multi-tenancy hardening
- WAF/rate limit production hardening

## 8. 커밋 금지/주의 로컬 산출물

커밋 금지:

- `build/`
- `dist/`
- `apps/web/dist/`
- Terraform plan files: `tfplan*`, `*.tfplan`
- Terraform state files: `*.tfstate`, `*.tfstate.*`
- local tfvars: `*.tfvars`
- ZIP artifacts
- `.terraform/` directories
- local env/secrets: `.env`, `.env.*`
- `apps/web/tsconfig.tsbuildinfo` build mutation

현재 ignored local artifacts:

```text
apps/web/dist/
build/
infra/terraform/envs/revenue-dev/.terraform.lock.hcl
infra/terraform/envs/revenue-dev/.terraform/
infra/terraform/envs/revenue-dev/terraform.step1c.first-subset.tfvars
infra/terraform/envs/revenue-dev/tfplan.step2.frontend-first
infra/terraform/envs/revenue-dev/tfplan.step2b.bucket-policy-final
infra/terraform/envs/revenue-dev/tfplan.step2b.bucket-policy-only
infra/terraform/envs/revenue-dev/tfplan.step2b.frontend-first
infra/terraform/envs/revenue-dev/tfplan.step2b.remaining-cloudfront
infra/terraform/envs/revenue-dev/tfplan.step2d.api-activation
infra/terraform/envs/revenue-dev/tfplan.step2d.remaining-api-gateway
```

추가 local tfvars 규칙:

- 기존 `terraform.step1c.first-subset.tfvars`를 덮어쓰지 않는다.
- STEP 2-D 추가 값이 필요하면 `terraform.step2d.api.tfvars`를 새로 만든다.
- STEP 2-E는 `terraform.step2e.auth-aurora.tfvars`를 새로 만든다.
- STEP 3은 `terraform.step3.ingestion-context.tfvars`를 새로 만든다.
- 위 local tfvars는 모두 gitignored이며 commit하지 않는다.

## 9. 정확한 계속 진행 순서

계속 진행 순서:

1. STEP 2-D finish
2. Frontend API wiring
3. STEP 2-E Cognito/Auth + Aurora core runtime
4. STEP 3 real data ingestion + external context
5. STEP 4 production hardening + multi-tenancy closure

## 10. 공통 safety gates

모든 Terraform apply 전 필수:

- saved plan을 사용한다.
- `terraform show -json <planfile> | jq resource_changes`로 resource address를 전부 표시한다.
- create/change/delete count를 요약한다.
- delete/destroy count는 반드시 0이어야 한다.
- current phase 외 리소스가 없어야 한다.
- Product Ops/productops resource가 없어야 한다.
- broad IAM wildcard를 자동으로 추가하지 않는다.
- Terraform state 변경 후에는 저장된 plan을 재사용하지 않고 반드시 새 plan을 만든다.

하드 스톱:

- destroy plan
- `terraform destroy`
- Product Ops/productops resource risk
- broad unsafe IAM permission
- unknown cost/risk
- missing secrets
- uncontrolled schedule/collector activation
- real merchant/POS data ingestion risk

IAM self-heal 제한:

- AWS service별 narrow correction은 최대 2회만 허용한다.
- 3번째 correction이 필요하면 해당 phase를 중단하고 blocker를 문서화한다.
- service-wide wildcard로 자동 확장하지 않는다.

## 11. STEP 2-D 다음 명령/게이트

상태 확인:

```bash
terraform -chdir=infra/terraform/envs/revenue-dev state list
aws apigatewayv2 get-api --api-id 7q8hxxta67 --region ap-northeast-2
aws apigatewayv2 get-stages --api-id 7q8hxxta67 --region ap-northeast-2
aws apigatewayv2 get-routes --api-id 7q8hxxta67 --region ap-northeast-2
aws apigatewayv2 get-integrations --api-id 7q8hxxta67 --region ap-northeast-2
aws lambda get-function --function-name revenue-ops-revenue-dev-revenue-api --region ap-northeast-2
aws lambda get-policy --function-name revenue-ops-revenue-dev-revenue-api --region ap-northeast-2
```

IAM policy 확인:

```bash
aws iam get-user-policy \
  --user-name de-ai-12 \
  --policy-name RevenueOpsApiGatewayFoundationAccess
```

TagResource simulation:

```bash
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::827913617635:user/de-ai-12 \
  --action-names apigateway:TagResource \
  --resource-arns \
    arn:aws:apigateway:ap-northeast-2::/apis/7q8hxxta67/stages \
    arn:aws:apigateway:ap-northeast-2::/apis/7q8hxxta67/stages/* \
    arn:aws:apigateway:ap-northeast-2::/apis/*/stages \
    arn:aws:apigateway:ap-northeast-2::/apis/*/stages/*
```

주의:

- AWS에는 `$default` stage가 있으나 Terraform state에는 없으므로, `terraform plan`이 stage create를 제안하면 remote conflict 가능성을 먼저 판단한다.
- 필요한 경우 `terraform import 'module.revenue_api.aws_apigatewayv2_stage.default[0]' '7q8hxxta67/$default'`를 검토한다.
- import는 remote resource를 만들거나 삭제하지 않는 state reconciliation이지만, 실행 후에는 반드시 새 plan을 만든다.

검증/plan/apply 게이트:

```bash
terraform -chdir=infra/terraform/envs/revenue-dev validate
terraform -chdir=infra/terraform/envs/revenue-dev plan \
  -var-file=terraform.step1c.first-subset.tfvars \
  -out=tfplan.step2d.final-api-gateway \
  -no-color
terraform -chdir=infra/terraform/envs/revenue-dev show -json tfplan.step2d.final-api-gateway | jq '.resource_changes'
terraform -chdir=infra/terraform/envs/revenue-dev apply -no-color tfplan.step2d.final-api-gateway
```

STEP 2-D smoke test:

```bash
API_BASE="https://7q8hxxta67.execute-api.ap-northeast-2.amazonaws.com"
curl -i "$API_BASE/api/v1/revenue/briefs"
curl -i "$API_BASE/api/v1/revenue/anomalies"
curl -i "$API_BASE/api/v1/revenue/actions"
curl -i "$API_BASE/api/v1/revenue/context"
curl -i "$API_BASE/api/v1/revenue/pipeline-meta"
curl -i -X OPTIONS "$API_BASE/api/v1/revenue/actions/<known-action-id>/status"
curl -i -X PATCH "$API_BASE/api/v1/revenue/actions/<known-action-id>/status" \
  -H 'content-type: application/json' \
  --data '{"status":"planned"}'
```

응답 확인:

- JSON이어야 한다.
- stack trace/local path/secret/tfvars/tfstate/tfplan/raw error가 없어야 한다.

## 12. STEP 2-E 다음 게이트

`terraform.step2e.auth-aurora.tfvars`를 새 local ignored 파일로 만들고 다음 범위를 유지한다:

```hcl
enable_artifacts = true
enable_frontend = true
enable_api = true
enable_auth = true
enable_aurora = true
enable_pipeline_foundation = false
enable_schedule = false
enable_saas_observability = false
```

진행 전 확인:

- Aurora subnet/VPC 입력이 현재 modeled 되어 있는지 확인한다.
- missing VPC/subnet/secrets가 있으면 apply하지 않고 plan 문서로 중단한다.
- Aurora는 minimum dev/prod-min viable size만 허용한다.
- ETL/schedule/live collector는 계속 꺼둔다.

## 12-A. 2026-05-06 STEP 2-E Plan-Only Update

STEP 2-E Cognito + Aurora Core Runtime은 plan-only로 시작했다.

생성한 local ignored tfvars:

```text
infra/terraform/envs/revenue-dev/terraform.step2e.auth-aurora.tfvars
```

설정:

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

검증:

- `terraform fmt -recursive -check infra/terraform`: passed
- `terraform -chdir=infra/terraform/envs/revenue-dev validate`: passed, backend `dynamodb_table` deprecation warning only

좁은 Terraform planning fix:

- `revenue_api_gateway_lambda` module의 Cognito authorizer `count`가 새 Cognito output에 의존해 plan이 실패했다.
- `enable_cognito_authorizer` known boolean을 추가하고 revenue-dev에서는 `var.enable_auth`로 전달했다.
- 이 변경은 plan-time unknown count 문제를 제거하기 위한 code/config fix이며 apply는 실행하지 않았다.

STEP 2-E plan:

```bash
terraform -chdir=infra/terraform/envs/revenue-dev plan \
  -var-file=terraform.step2e.auth-aurora.tfvars \
  -out=tfplan.step2e.auth-aurora \
  -no-color
```

결과:

- command exit code: `1`
- saved planfile inspection showed `6 create, 3 update, 0 delete, 0 replace`
- apply는 권장하지 않음

Inspectable resource changes:

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

Blocker:

```text
vpc_id is required when enable_aurora is true.
At least two private_subnet_ids are required when enable_aurora is true.
```

AWS read-only discovery found existing VPC/subnet resources, but none were clearly Revenue Ops-owned. Do not use unrelated workload VPCs for Aurora. Next gate is reviewed Revenue Ops VPC/private subnet selection, then a regenerated plan.

Additional apply risk:

- The plan changes the API route auth from `NONE` to `JWT`.
- Frontend Cognito login/token flow is not implemented yet.
- Applying Auth before frontend auth wiring may break current unauthenticated API mode.

Detailed report:

- `docs/step2e_cognito_aurora_core_runtime_plan_kr.md`

## 13. STEP 3 다음 게이트

STEP 3은 controlled sample path가 있을 때만 apply한다.

허용:

- sample POS/order ingestion endpoint 또는 upload path가 이미 modeled 되고 안전한 경우
- disabled-by-default external context collector scaffolding
- freshness metadata/run log/retry behavior 문서화

금지:

- uncontrolled EventBridge schedule
- live external API calls
- real merchant/POS data
- broad ETL activation
- unclear cost resources

## 14. STEP 4 다음 게이트

STEP 4는 destructive migration 없이 문서/체크리스트/작은 low-cost hardening만 진행한다.

검토 항목:

- tenant_id / merchant_id / store_id isolation
- RBAC
- WAF/rate limit
- backup/restore
- CloudWatch alarms/log retention
- cost guardrails
- security checklist
- final runbook
- validation checklist

## 15. 다음 산출물

예상 문서:

- `docs/step2d_closure_kr.md`
- `docs/step2d_frontend_api_wiring_smoke_kr.md`
- `docs/step2e_cognito_aurora_core_runtime_apply_report_kr.md` 또는 `docs/step2e_cognito_aurora_core_runtime_plan_kr.md`
- `docs/step3_real_data_ingestion_external_context_apply_or_plan_kr.md`
- `docs/step4_production_hardening_multitenancy_final_closure_plan_kr.md`

최종 validation 후보:

```bash
node --test apps/api/src/revenue-ops/revenue-ops-routes.test.js apps/api/src/lambda-handler.test.js
node --check apps/api/src/lambda-handler.js
terraform fmt -recursive -check infra/terraform
terraform -chdir=infra/terraform/envs/revenue-dev validate
npm --prefix apps/web run check
npm --prefix apps/web run build
```

## 16. 2026-05-06 STEP 2-D Continuation Update

handoff commit 후 STEP 2-D를 재개했다.

추가로 완료한 것:

- `RevenueOpsApiGatewayFoundationAccess` inline policy 확인
- requested stage `apigateway:TagResource` resources 4개 simulation: all `allowed`
- `terraform validate`: success, backend deprecation warning only
- 첫 STEP 2-D plan: `1 add, 0 change, 0 destroy`
- AWS에는 이미 존재하지만 Terraform state에 없던 `$default` stage 식별
- `terraform import -var-file=terraform.step1c.first-subset.tfvars 'module.revenue_api.aws_apigatewayv2_stage.default[0]' '7q8hxxta67/$default'`: success
- import 후 state에 `module.revenue_api.aws_apigatewayv2_stage.default[0]` 포함 확인
- import 후 새 plan: `0 add, 1 change, 0 destroy`

최신 pending plan:

```text
tfplan.step2d.final-api-gateway
0 add, 1 change, 0 destroy
only expected address: module.revenue_api.aws_apigatewayv2_stage.default[0]
```

Pending change:

- `$default` stage tags 추가
- throttling burst/rate를 `50`/`25`로 설정

중단 사유:

- 사용자 safety gate인 `terraform show -json tfplan.step2d.final-api-gateway | jq '.resource_changes'`를 apply 직전에 완료해야 한다.
- sandbox 안에서는 Terraform provider schema load 실패가 발생했다.
- sandbox 밖 실행 escalation은 사용량 한도로 거부되었다.
- 따라서 saved plan resource list를 apply 직전에 표시할 수 없어 apply하지 않았다.

다음 재개 시 첫 명령:

```bash
terraform -chdir=infra/terraform/envs/revenue-dev show -json tfplan.step2d.final-api-gateway | jq '.resource_changes'
```

그 다음 `apigateway:PATCH` simulation을 별도로 실행한다. `PATCH`가 필요한 경우 narrow action/resource만 보정하고 plan을 재생성한 뒤 진행한다.

## 17. 2026-05-06 STEP 2-D Finish Attempt Update

STEP 2-D만 완료하기 위해 재개했으나 최종 상태는 여전히 blocked다.

확인된 plan gate:

```text
tfplan.step2d.final-api-gateway
create: 0
update: 1
delete: 0
changed resource: module.revenue_api.aws_apigatewayv2_stage.default[0]
```

나타나지 않은 범위:

- Cognito/Auth
- Aurora/RDS
- ETL/Glue/Athena/Step Functions/EventBridge
- schedule/live collector/POS ingestion
- frontend/CloudFront replacement
- Product Ops/productops resources

IAM 변경:

- `RevenueOpsApiGatewayFoundationAccess` inline policy를 좁게 보정했다.
- 첫 update는 policy size limit으로 실패했으며 권한 변경 없음.
- 성공한 update는 기존 중복 `/v2/apis...` resource patterns를 제거해 크기를 줄이고 `apigateway:PATCH` stage resources를 추가했다.
- 최종 `PATCH` resources:

```text
arn:aws:apigateway:ap-northeast-2::/apis/7q8hxxta67/stages/$default
arn:aws:apigateway:ap-northeast-2::/apis/7q8hxxta67/stages/%24default
arn:aws:apigateway:ap-northeast-2::/apis/7q8hxxta67/stages/*
```

Simulation:

- `apigateway:PATCH`: allowed for literal `$default`, encoded `%24default`, and stage wildcard
- requested stage `apigateway:TagResource`: allowed

Apply attempts:

- First apply failed with `apigateway:PATCH` denied on `$default` stage during API Gateway V2 stage tagging.
- Plan was regenerated after failure.
- Second apply failed with the same `apigateway:PATCH` denial.
- A final encoded-stage ARN correction was added, but final apply was blocked by the IAM correction-round safety gate and was not executed.

Current live state:

- API Gateway API exists: `7q8hxxta67`
- Endpoint exists: `https://7q8hxxta67.execute-api.ap-northeast-2.amazonaws.com`
- Lambda exists and active: `revenue-ops-revenue-dev-revenue-api`
- `$default` stage exists and is imported into Terraform state
- Stage tags appear partially applied from the failed apply
- Pending diff remains stage-only update for `tags_all`/throttling

Current blocker:

```text
Actual Terraform apply still receives apigateway:PATCH denied during stage tag update,
despite IAM simulation returning allowed. Further apply was stopped by the IAM
self-healing correction-round safety gate.
```

Next exact safe diagnostic before any further apply:

```bash
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=TagResource \
  --region ap-northeast-2 \
  --max-results 10
```

Use CloudTrail only to identify the exact evaluated action/resource/context. Do not add broad API Gateway wildcard permissions without explicit approval.

## 18. 2026-05-06 STEP 2-D Frontend API Wiring Update

STEP 2-D frontend API wiring was completed for Revenue Cockpit API mode.

Code change:

- `apps/web/src/revenue-cockpit/revenueCockpitApi.ts`
- Changed Revenue Cockpit API base from relative `/api/v1/revenue` to a Vite-configurable origin:
  - `VITE_REVENUE_API_BASE_URL` if provided
  - default: `https://7q8hxxta67.execute-api.ap-northeast-2.amazonaws.com`

Live frontend:

- `https://d1fquuc7vsf9cu.cloudfront.net/`
- `https://d1fquuc7vsf9cu.cloudfront.net/#revenue-cockpit`
- `https://d1fquuc7vsf9cu.cloudfront.net/#revenue-cockpit?data=api`

API endpoint used:

```text
https://7q8hxxta67.execute-api.ap-northeast-2.amazonaws.com
```

Build/deploy:

- `npm --prefix apps/web run check`: passed
- `npm --prefix apps/web run build`: passed
- dist safety scan: no tfvars/tfstate/tfplan/env/AWS key/private key markers
- upload target: `s3://revenue-ops-frontend-dev-827913617635/`
- uploaded only `apps/web/dist`
- CloudFront invalidation:
  - distribution: `E31KH7PFML1A6N`
  - id: `I6D2N3JDMDI967RDWT2KOE117J`
  - path: `/*`
  - final status: `Completed`

Smoke:

- CloudFront root: HTTP 200 HTML
- `#revenue-cockpit`: HTTP 200 SPA shell
- `#revenue-cockpit?data=api`: HTTP 200 SPA shell
- JS asset `assets/index-_S6L24XV.js`: HTTP 200 JavaScript
- Direct API:
  - `GET /api/v1/revenue/briefs`: HTTP 200 JSON
  - `GET /api/v1/revenue/anomalies`: HTTP 200 JSON
  - `GET /api/v1/revenue/actions`: HTTP 200 JSON
  - `GET /api/v1/revenue/context`: HTTP 200 JSON
  - `GET /api/v1/revenue/pipeline-meta`: HTTP 200 JSON

Manual browser check still needed:

- curl verifies SPA shell/assets only for hash routes because fragments are not sent to CloudFront.
- Browser DevTools should confirm `#revenue-cockpit?data=api` fetches `https://7q8hxxta67.execute-api.ap-northeast-2.amazonaws.com/api/v1/revenue/*`.

Still intentionally disabled:

- Cognito/Auth
- Aurora/RDS persistence
- ETL/pipeline/schedule
- live external collector
- POS real ingestion
- Product Ops/productops resources
