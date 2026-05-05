# STEP 2-D API Gateway + Lambda Apply Report

## 1. 실행 범위

승인 문구:

```text
Approved to apply tfplan.step2d.api-activation for STEP 2-D API Gateway + Lambda only.
```

실행 명령:

```bash
terraform -chdir=infra/terraform/envs/revenue-dev apply -no-color tfplan.step2d.api-activation
```

적용 대상은 기존에 검토한 STEP 2-D API Gateway + Lambda plan만이었다.

유지한 비활성 범위:

- Auth/Cognito disabled
- Aurora/RDS disabled
- ETL pipeline foundation disabled
- EventBridge schedules disabled
- live collector disabled
- POS ingestion disabled
- frontend asset redeploy 없음

## 2. 적용 결과 요약

결과:

- Partial success
- Terraform apply가 일부 리소스를 생성한 뒤 API Gateway 생성 권한 부족으로 중단되었다.

성공적으로 생성된 리소스:

- `module.revenue_api.aws_iam_role.api_lambda[0]`
- `module.revenue_api.aws_iam_policy.api_lambda[0]`
- `module.revenue_api.aws_iam_role_policy_attachment.api_lambda[0]`
- `module.revenue_api.aws_lambda_function.api[0]`

중단된 리소스:

- `module.revenue_api.aws_apigatewayv2_api.api[0]`

아직 생성되지 않은 리소스:

- `module.revenue_api.aws_apigatewayv2_api.api[0]`
- `module.revenue_api.aws_apigatewayv2_integration.lambda[0]`
- `module.revenue_api.aws_apigatewayv2_route.revenue[0]`
- `module.revenue_api.aws_apigatewayv2_stage.default[0]`
- `module.revenue_api.aws_lambda_permission.api_gateway[0]`

## 3. 실패 원인

Terraform apply 중 API Gateway HTTP API 생성 단계에서 다음 권한 오류가 발생했다.

```text
AccessDeniedException: User: arn:aws:iam::827913617635:user/de-ai-12 is not authorized to perform: apigateway:POST on resource: arn:aws:apigateway:ap-northeast-2::/tags/arn%3Aaws%3Aapigateway%3Aap-northeast-2%3A%3A%2Fv2%2Fapis%2F*
```

추가 read-only 확인에서도 API Gateway list/read 권한이 없었다.

```text
apigateway:GET on resource: arn:aws:apigateway:ap-northeast-2::/apis
```

현재 `de-ai-12` inline policy 목록:

- `RevenueOpsFrontendCloudFrontFoundationAccess`
- `TerraformDynamoDBLockTableAccess`

현재 API Gateway 권한 시뮬레이션 결과:

- `apigateway:POST`: implicitDeny
- `apigateway:GET`: implicitDeny

Lambda permission 관련 시뮬레이션:

- `lambda:AddPermission`: allowed
- `lambda:GetPolicy`: allowed

## 4. 생성된 Lambda 검증

명령:

```bash
aws lambda get-function --function-name revenue-ops-revenue-dev-revenue-api
```

확인 결과:

- Function name: `revenue-ops-revenue-dev-revenue-api`
- Function ARN: `arn:aws:lambda:ap-northeast-2:827913617635:function:revenue-ops-revenue-dev-revenue-api`
- Runtime: `nodejs20.x`
- Handler: `index.handler`
- Code size: 7720 bytes
- Memory: 512 MB
- Timeout: 30 seconds
- State: `Active`
- LastUpdateStatus: `Successful`
- Environment:
  - `ARTIFACT_BUCKET = revenue-ops-artifacts-dev-827913617635`
- Tracing:
  - `Active`
- Package source:
  - `s3://revenue-ops-artifacts-dev-827913617635/api-packages/revenue-api-step2d.zip`

## 5. Terraform state 확인

명령:

```bash
terraform -chdir=infra/terraform/envs/revenue-dev state list | sort
```

STEP 2-D 관련 state 포함 리소스:

- `module.revenue_api.aws_iam_policy.api_lambda[0]`
- `module.revenue_api.aws_iam_role.api_lambda[0]`
- `module.revenue_api.aws_iam_role_policy_attachment.api_lambda[0]`
- `module.revenue_api.aws_lambda_function.api[0]`

STEP 2-D 관련 state 미포함 리소스:

- API Gateway API
- API Gateway integration
- API Gateway route
- API Gateway stage
- Lambda permission for API Gateway

## 6. 후속 plan

부분 적용 후 남은 범위를 확인하기 위해 non-mutating plan을 다시 실행했다.

명령:

```bash
terraform -chdir=infra/terraform/envs/revenue-dev plan \
  -var-file=terraform.step1c.first-subset.tfvars \
  -out=tfplan.step2d.remaining-api-gateway \
  -no-color
```

결과:

- Plan: 5 to add, 0 to change, 0 to destroy
- Plan file: `infra/terraform/envs/revenue-dev/tfplan.step2d.remaining-api-gateway`

남은 생성 예정 리소스:

- `module.revenue_api.aws_apigatewayv2_api.api[0]`
- `module.revenue_api.aws_apigatewayv2_integration.lambda[0]`
- `module.revenue_api.aws_apigatewayv2_route.revenue[0]`
- `module.revenue_api.aws_apigatewayv2_stage.default[0]`
- `module.revenue_api.aws_lambda_permission.api_gateway[0]`

계속 나타나지 않은 리소스:

- Cognito/Auth
- Aurora/RDS
- Glue
- Athena
- Step Functions
- EventBridge schedule
- live collectors
- POS ingestion
- frontend or CloudFront replacement
- destroy action

## 7. 필요한 IAM 보정안

다음 단계는 IAM 보정 plan/approval을 별도로 거친 뒤 남은 API Gateway plan만 적용해야 한다.

제안 inline policy 이름:

- `RevenueOpsApiGatewayFoundationAccess`

필요 최소 범위:

- API Gateway HTTP API 생성 및 조회
- integration/route/stage 생성 및 조회
- API Gateway resource tagging

권한 후보:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "RevenueOpsApiGatewayFoundationReadWrite",
      "Effect": "Allow",
      "Action": [
        "apigateway:GET",
        "apigateway:POST"
      ],
      "Resource": [
        "arn:aws:apigateway:ap-northeast-2::/apis",
        "arn:aws:apigateway:ap-northeast-2::/apis/*",
        "arn:aws:apigateway:ap-northeast-2::/v2/apis",
        "arn:aws:apigateway:ap-northeast-2::/v2/apis/*",
        "arn:aws:apigateway:ap-northeast-2::/v2/apis/*/integrations",
        "arn:aws:apigateway:ap-northeast-2::/v2/apis/*/routes",
        "arn:aws:apigateway:ap-northeast-2::/v2/apis/*/stages",
        "arn:aws:apigateway:ap-northeast-2::/tags/arn%3Aaws%3Aapigateway%3Aap-northeast-2%3A%3A%2Fv2%2Fapis%2F*"
      ]
    }
  ]
}
```

주의:

- 이 정책은 다음 단계에서 시뮬레이션 후 적용해야 한다.
- 아직 IAM mutation을 수행하지 않았다.
- API Gateway provider가 생성 직후 조회하는 세부 resource ARN이 추가로 필요할 수 있다. 그 경우에도 STEP 2-D remaining plan 범위 안에서만 보정한다.

## 8. 현재 서비스 상태

현재 상태:

- Lambda function exists and is active
- API Gateway endpoint does not exist yet
- `terraform output`에 `api_endpoint`는 아직 없다
- frontend `#revenue-cockpit?data=api`는 아직 AWS API Gateway로 연결되지 않는다
- STEP 2-C의 CloudFront frontend는 기존 상태 그대로 유지된다

API smoke test:

- API Gateway가 생성되지 않았으므로 endpoint smoke test는 skipped
- Lambda direct invoke는 CloudWatch log group 생성 등 추가 side effect 가능성이 있어 실행하지 않았다

## 9. 다음 승인 게이트

다음 단계는 STEP 2-D continuation으로 진행한다.

권장 순서:

1. `RevenueOpsApiGatewayFoundationAccess` inline IAM policy 추가 승인
2. IAM policy 적용
3. `aws iam simulate-principal-policy`로 `apigateway:GET`/`apigateway:POST` 확인
4. 남은 plan 확인
5. `tfplan.step2d.remaining-api-gateway` 또는 재생성된 remaining plan만 apply
6. API Gateway endpoint smoke test

다음 단계 승인 문구 예시:

```text
Approved to add RevenueOpsApiGatewayFoundationAccess to de-ai-12 and apply only the remaining STEP 2-D API Gateway plan with 0 destroy.
```
