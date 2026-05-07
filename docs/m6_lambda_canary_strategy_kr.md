# M6 Lambda Canary Strategy

## 왜 ALB가 필요 없는가
현재 백엔드는 API Gateway HTTP API가 Lambda를 직접 호출한다. 이 경로에서는 ALB target group canary가 아니라 Lambda version/alias와 CodeDeploy Lambda deployment group이 표준 canary 단위다.

## 왜 Lambda Alias를 쓰는가
API Gateway가 unqualified Lambda ARN이나 `$LATEST`를 호출하면 CodeDeploy가 traffic shifting을 제어할 수 없다. API Gateway integration은 `live` 같은 alias invoke ARN을 호출해야 한다.

## 핵심 개념
- Version: publish된 immutable Lambda 코드 단위.
- Alias: `live` 같은 traffic pointer. API Gateway는 alias를 호출한다.
- CodeDeploy Application: Lambda compute platform release controller.
- Deployment Group: alias traffic shifting, alarm rollback, deployment config를 묶는 단위.
- CloudWatch Alarm: CodeDeploy가 rollback을 판단하는 신호.

## Terraform Readiness
`infra/terraform/modules/revenue_api_gateway_lambda`는 다음을 plan-ready로 제공한다.
- Lambda `publish`
- Lambda alias `live`
- API Gateway integration alias invoke ARN
- alias-qualified Lambda permission
- CodeDeploy Lambda application/deployment group
- `CodeDeployDefault.LambdaCanary10Percent5Minutes`
- rollback event: `DEPLOYMENT_FAILURE`, `DEPLOYMENT_STOP_ON_ALARM`, `DEPLOYMENT_STOP_ON_REQUEST`
- Lambda Errors, Throttles, Duration p95, API Gateway 5XX alarms

## 실제 Active 조건
다음 조건이 모두 참이어야 자동 rollback이 active다.
- Lambda alias가 Terraform으로 apply됨.
- API Gateway integration URI가 alias invoke ARN임.
- API Gateway Lambda permission이 alias qualifier에 대해 존재함.
- CodeDeploy application/deployment group이 apply됨.
- CloudWatch alarms가 deployment group에 연결됨.
- CodeDeploy deployment가 새 Lambda version으로 traffic shift를 수행함.

## Commands
Plan:
```bash
terraform -chdir=infra/terraform/envs/revenue-dev plan \
  -var-file=terraform.step2f.jwt-enforcement.tfvars \
  -out=tfplan.m6-release-canary
```

Apply:
```bash
terraform -chdir=infra/terraform/envs/revenue-dev apply tfplan.m6-release-canary
```

Canary deploy:
```bash
bash scripts/deploy_lambda_canary.sh \
  --function-name revenue-ops-revenue-dev-revenue-api \
  --alias live \
  --artifact-bucket revenue-ops-artifacts-dev-827913617635 \
  --release-id <release_id> \
  --codedeploy-app revenue-ops-revenue-dev-revenue-api \
  --codedeploy-group revenue-ops-revenue-dev-revenue-api-live \
  --region ap-northeast-2
```

Inspect:
```bash
bash scripts/show_lambda_release_state.sh \
  --function-name revenue-ops-revenue-dev-revenue-api \
  --codedeploy-app revenue-ops-revenue-dev-revenue-api \
  --codedeploy-group revenue-ops-revenue-dev-revenue-api-live \
  --region ap-northeast-2
```

Rollback:
```bash
bash scripts/rollback_lambda_alias.sh \
  --function-name revenue-ops-revenue-dev-revenue-api \
  --alias live \
  --target-version <previous_version> \
  --region ap-northeast-2
```

## Guardrail
이 문서는 "canary 준비"를 설명한다. Terraform apply와 실제 CodeDeploy deployment 확인 전에는 자동 rollback active로 분류하지 않는다.
