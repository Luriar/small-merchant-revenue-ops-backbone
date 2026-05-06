# STEP 2-E-A Auth Split + Network Foundation Plan

## 1. 맥락

현재 small-merchant Revenue Ops SaaS baseline:

- STEP 2-D API Gateway + Lambda activation 완료
- STEP 2-D Frontend API Wiring 완료
- Live frontend: `https://d1fquuc7vsf9cu.cloudfront.net/`
- Live Revenue Cockpit API mode: `https://d1fquuc7vsf9cu.cloudfront.net/#revenue-cockpit?data=api`
- Live API Gateway: `https://7q8hxxta67.execute-api.ap-northeast-2.amazonaws.com`

이전 STEP 2-E plan-only에서 확인한 blocker:

- Aurora가 reviewed VPC/private subnet input을 요구한다.
- `enable_auth = true`가 API route JWT enforcement까지 유발해 현재 unauthenticated API mode를 깨뜨릴 수 있다.

이번 작업은 apply 없이 plan-only로 다음 두 가지를 분리했다.

1. Cognito resource creation
2. API Gateway route JWT enforcement

## 2. Auth Split

새 env variable:

```hcl
enable_api_jwt_authorizer = false
```

의미:

- `enable_auth = true`: Cognito User Pool/User Pool Client만 생성한다.
- `enable_api_jwt_authorizer = false`: API route는 `authorization_type = "NONE"`을 유지한다.
- `enable_api_jwt_authorizer = true`: API Gateway JWT authorizer를 만들고 route를 `JWT`로 전환한다.

Terraform wiring:

- revenue-dev env에 `enable_api_jwt_authorizer`를 추가했다.
- `module.revenue_api.enable_cognito_authorizer`는 `var.enable_api_jwt_authorizer`로만 구동한다.
- Cognito user pool/client IDs도 `enable_api_jwt_authorizer = true`일 때만 API module에 전달한다.
- 따라서 Cognito만 만들 때 Lambda env와 API route는 변경되지 않는다.

현재 route 확인:

```text
module.revenue_api.aws_apigatewayv2_route.revenue[0]
authorization_type = "NONE"
authorizer_id      = null
```

## 3. Cognito-Only Plan

Local ignored tfvars:

```text
infra/terraform/envs/revenue-dev/terraform.step2e.auth-only.tfvars
```

핵심 설정:

```hcl
enable_artifacts                 = true
enable_frontend                  = true
enable_api                       = true
enable_auth                      = true
enable_api_jwt_authorizer        = false
enable_aurora                    = false
enable_aurora_network_foundation = false
enable_pipeline_foundation       = false
enable_schedule                  = false
enable_saas_observability        = false
```

Plan command:

```bash
terraform -chdir=infra/terraform/envs/revenue-dev plan \
  -var-file=terraform.step2e.auth-only.tfvars \
  -out=tfplan.step2e.auth-only \
  -no-color
```

Result:

```text
Plan: 2 to add, 0 to change, 0 to destroy.
```

Action counts:

```json
{
  "create": 2,
  "update": 0,
  "delete": 0,
  "replace": 0
}
```

Resource changes:

```text
create module.auth.aws_cognito_user_pool.main[0]
create module.auth.aws_cognito_user_pool_client.web[0]
```

API route status in the plan:

- `module.revenue_api.aws_apigatewayv2_route.revenue[0]`: `no-op`
- before `authorization_type`: `NONE`
- after `authorization_type`: `NONE`

Safe-plan assessment:

- 0 destroy
- 0 replace
- Cognito resources only
- no API route JWT enforcement
- no Lambda env update
- no Aurora/RDS
- no CloudFront/frontend replacement
- no ETL/pipeline/schedule/live collector/POS ingestion

This plan is apply-eligible only after explicit approval. It was not applied.

## 4. Network Strategy

No Revenue Ops-owned VPC/private subnets were found in existing Terraform state or committed configuration.

Existing AWS VPCs/subnets discovered earlier were not clearly Revenue Ops-owned, so they were not reused.

Added a small dedicated `revenue_network` module for plan-only review:

- Revenue Ops-owned VPC
- two private isolated subnets in separate AZs
- private route table with no internet gateway and no NAT gateway
- Lambda security group for future runtime attachment
- Aurora security group
- PostgreSQL-only security group access from Lambda SG to Aurora SG
- tags marking Revenue Ops ownership and purpose

Default network shape:

```text
VPC CIDR: 10.42.0.0/20
Private subnet 1: 10.42.0.0/24, ap-northeast-2a
Private subnet 2: 10.42.1.0/24, ap-northeast-2b
```

The network module does not create Aurora/RDS.

## 5. Network-Only Plan

Local ignored tfvars:

```text
infra/terraform/envs/revenue-dev/terraform.step2e.network.tfvars
```

핵심 설정:

```hcl
enable_artifacts                 = true
enable_frontend                  = true
enable_api                       = true
enable_auth                      = false
enable_api_jwt_authorizer        = false
enable_aurora                    = false
enable_aurora_network_foundation = true
enable_pipeline_foundation       = false
enable_schedule                  = false
```

Plan command:

```bash
terraform -chdir=infra/terraform/envs/revenue-dev plan \
  -var-file=terraform.step2e.network.tfvars \
  -out=tfplan.step2e.network \
  -no-color
```

Result:

```text
Plan: 10 to add, 0 to change, 0 to destroy.
```

Action counts:

```json
{
  "create": 10,
  "update": 0,
  "delete": 0,
  "replace": 0
}
```

Resource changes:

```text
create module.aurora_network.aws_vpc.main[0]
create module.aurora_network.aws_subnet.private["0"]
create module.aurora_network.aws_subnet.private["1"]
create module.aurora_network.aws_route_table.private[0]
create module.aurora_network.aws_route_table_association.private["0"]
create module.aurora_network.aws_route_table_association.private["1"]
create module.aurora_network.aws_security_group.lambda[0]
create module.aurora_network.aws_security_group.aurora[0]
create module.aurora_network.aws_security_group_rule.lambda_to_aurora_egress[0]
create module.aurora_network.aws_security_group_rule.aurora_from_lambda_ingress[0]
```

Not present:

- Aurora/RDS
- Cognito/Auth
- API Gateway route/auth updates
- Lambda updates
- CloudFront/frontend replacement
- Glue/Athena/Step Functions/EventBridge/schedule
- live collector/POS ingestion

## 6. Aurora Next Gate

Do not enable Aurora yet.

Next Aurora plan should happen only after:

1. Network foundation plan is reviewed and, in a later approved run, applied.
2. Network outputs are copied into a new local Aurora tfvars:
   - `aurora_vpc_id`
   - `aurora_private_subnet_ids`
   - `aurora_allowed_security_group_ids`
3. A new Aurora-only plan confirms:
   - 0 destroy
   - 0 replace
   - Aurora/RDS + Secrets Manager only
   - no API JWT enforcement
   - no ETL/pipeline/schedule/live collector/POS ingestion

## 7. Later Apply Sequence

Exact recommended sequence:

1. Network foundation
2. Aurora foundation
3. Application persistence wiring
4. Cognito frontend login
5. API JWT enforcement

Do not reverse steps 4 and 5, because API JWT enforcement before frontend login/token wiring would break the current working unauthenticated API mode.

## 8. Cost and Security Notes

Cost:

- Cognito-only plan is low cost at minimal user count.
- Network-only plan has no NAT gateway and no RDS, which keeps baseline network cost minimal.
- VPC/subnets/route tables/security groups are generally low/no hourly cost, but account-level limits still apply.
- Aurora Serverless v2 is not part of this plan and remains the next cost gate.

Security:

- Cognito user pool is admin-create-only with email usernames and 12-character password policy requiring upper/lower/number/symbol.
- MFA remains off in the current Cognito module.
- API route remains unauthenticated until `enable_api_jwt_authorizer = true`.
- Network subnets are isolated and have no internet gateway/NAT route.
- Aurora SG allows PostgreSQL only from the modeled Lambda SG.

## 9. Do-Not-Apply Warnings

No apply was run.

Do not apply saved planfiles if any of these are true:

- plan contains destroy or replacement
- plan includes API route JWT enforcement before frontend auth is ready
- plan includes Aurora before network outputs are reviewed
- plan includes ETL/pipeline/schedule/live collector/POS resources
- plan touches unrelated Product Ops/productops resources

Saved planfiles are local ignored artifacts and must not be committed.
