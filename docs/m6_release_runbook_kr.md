# M6 Release Runbook

## 맥락
Revenue OS M6는 S3/CloudFront 프론트엔드, API Gateway/Lambda/Aurora 백엔드, Cognito 인증, 공개 맥락 수집기를 운영 가능한 SaaS 릴리스 단위로 묶는다. 자동 원인 확정이 아니라 "함께 관측된 근거"와 "실행 후보"를 제공한다.

## Preflight
- `git status --short`
- `node --test apps/api/src/revenue-ops/context-collectors.test.js`
- `node --test apps/api/src/revenue-ops/revenue-ops-saas-routes.test.js`
- `node --test apps/api/src/revenue-ops/revenue-upload-parsers.test.js`
- `find apps/api/src -name "*.js" -print0 | xargs -0 -n1 node --check`
- `node scripts/validate_step3_lambda_package_manifest.js`
- `npm --prefix apps/web run check`
- `npm --prefix apps/web run build`
- `terraform fmt -recursive infra/terraform`
- `terraform -chdir=infra/terraform/envs/revenue-dev validate`

## CI Workflow
`.github/workflows/ci.yml`는 Node test, JS syntax check, Lambda package manifest, web check/build, Terraform fmt/validate를 수행한다. Terraform validate 전에는 `terraform init -backend=false`를 실행한다.

## Frontend Deploy
```bash
bash scripts/deploy_frontend_release.sh \
  --release-id <release_id> \
  --bucket revenue-ops-frontend-dev-827913617635 \
  --distribution-id E31KH7PFML1A6N \
  --region ap-northeast-2
```

배포 흐름은 `apps/web/dist`를 `s3://bucket/releases/<release_id>/`에 올린 뒤 선택 릴리스를 S3 root로 sync하고 CloudFront invalidation을 만든다.

## Backend Deploy
```bash
bash scripts/package_step2d_revenue_api_lambda.sh

bash scripts/deploy_lambda_canary.sh \
  --function-name revenue-ops-revenue-dev-revenue-api \
  --alias live \
  --artifact-bucket revenue-ops-artifacts-dev-827913617635 \
  --release-id <release_id> \
  --codedeploy-app revenue-ops-revenue-dev-revenue-api \
  --codedeploy-group revenue-ops-revenue-dev-revenue-api-live \
  --region ap-northeast-2
```

이 명령은 Lambda ZIP을 S3에 올리고, 새 Lambda version을 publish한 뒤 CodeDeploy AppSpec으로 alias traffic shift를 시작한다. Terraform apply 전에는 CodeDeploy 리소스가 없을 수 있다.

## Terraform Plan/Apply
Plan:
```bash
terraform -chdir=infra/terraform/envs/revenue-dev plan \
  -var-file=terraform.step2f.jwt-enforcement.tfvars \
  -out=tfplan.m6-release-canary
```

Apply는 명시 승인 후에만 실행한다:
```bash
terraform -chdir=infra/terraform/envs/revenue-dev apply tfplan.m6-release-canary
```

## Smoke Test
```bash
bash scripts/smoke_m6_runtime.sh \
  --api-base https://7q8hxxta67.execute-api.ap-northeast-2.amazonaws.com \
  --id-token <manual_id_token>
```

ID token은 GitHub secret에 상시 저장하지 않는 것을 기본으로 한다. 필요한 경우 짧은 수명 토큰으로 수동 실행한다.

## Rollback Decision Table
| 증상 | 판단 | 조치 |
| --- | --- | --- |
| 프론트 표시 오류 | CloudFront/S3 release 문제 | `rollback_frontend_release.sh`로 이전 release prefix sync |
| Lambda Errors/Throttles/Duration alarm | 백엔드 canary 위험 | CodeDeploy 자동 rollback 확인, 필요 시 alias 수동 rollback |
| API Gateway 5XX alarm | 통합 또는 Lambda 장애 | CodeDeploy 상태 확인 후 alias rollback |
| 공개 맥락 collector 일부 skipped | Toss/Delivery credential 미설정이면 장애 아님 | UI에는 연동 대기로 유지 |
| Aurora write failure | 운영 정본 장애 | 릴리스 중단, Aurora/secret/network 우선 복구 |

## Rollback Commands
Frontend:
```bash
bash scripts/rollback_frontend_release.sh \
  --release-id <previous_release_id> \
  --bucket revenue-ops-frontend-dev-827913617635 \
  --distribution-id E31KH7PFML1A6N \
  --region ap-northeast-2
```

Lambda alias:
```bash
bash scripts/rollback_lambda_alias.sh \
  --function-name revenue-ops-revenue-dev-revenue-api \
  --alias live \
  --target-version <previous_version> \
  --region ap-northeast-2
```

## Verification
```bash
aws lambda get-alias --function-name revenue-ops-revenue-dev-revenue-api --name live --region ap-northeast-2
aws deploy list-deployment-groups --application-name revenue-ops-revenue-dev-revenue-api --region ap-northeast-2
aws cloudwatch describe-alarms --alarm-names revenue-ops-revenue-dev-revenue-api-live-errors --region ap-northeast-2
aws apigatewayv2 get-integrations --api-id <api_id> --region ap-northeast-2
```

## 수용 기준
- 프론트 릴리스는 release prefix로 되돌릴 수 있다.
- Lambda alias, API Gateway alias integration, CodeDeploy group, alarms가 Terraform plan에 잡힌다.
- Terraform apply와 CodeDeploy deployment가 실제 완료되기 전에는 자동 rollback이 active라고 주장하지 않는다.
