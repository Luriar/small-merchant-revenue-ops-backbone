# STEP 2-D API Gateway + Lambda Activation Plan

## 1. 단계 목적

STEP 2-D의 목적은 기존 small-merchant Revenue Ops API를 AWS API Gateway + Lambda로 활성화하기 전, API 전용 Terraform plan을 검토 가능한 상태로 준비하는 것이다.

2026-05-06 업데이트:

- 이 문서는 apply 전 plan 문서다.
- 이후 승인된 apply는 IAM/Lambda까지 부분 성공했고 API Gateway 생성 권한 부족으로 중단되었다.
- 적용 결과와 남은 권한 게이트는 `docs/step2d_api_gateway_lambda_apply_report_kr.md`를 기준으로 본다.

이번 단계는 적용 전 단계다. `terraform apply`는 실행하지 않았다.

## 2. 유지한 범위와 비활성 범위

활성 대상:

- `enable_artifacts = true`
- `enable_frontend = true`
- `enable_api = true`

계속 비활성:

- `enable_pipeline_foundation = false`
- `enable_auth = false`
- `enable_aurora = false`
- `enable_saas_observability = false`
- `enable_schedule = false`

의도적으로 하지 않은 일:

- Cognito/Auth 활성화 없음
- Aurora/RDS 활성화 없음
- ETL 파이프라인 기반 활성화 없음
- EventBridge 스케줄 활성화 없음
- live collector 실행 없음
- POS ingestion 없음
- 프론트엔드 자산 재배포 없음
- Terraform apply 없음

## 3. API 패키징 방식

기존 로컬 API 서버는 더 넓은 API 모듈을 함께 로드한다. STEP 2-D에서는 Auth/Aurora/ETL을 켜지 않기 때문에 Lambda 패키지는 Revenue Ops API 표면만 포함하도록 좁혔다.

추가된 Lambda 어댑터:

- `apps/api/src/lambda-handler.js`
- API Gateway HTTP API v2 event를 기존 Revenue Ops handler가 기대하는 Node request/response 형태로 변환한다.
- 기존 local `createServer()` 동작은 변경하지 않았다.

Lambda 진입점:

- `apps/api/lambda-index.js`
- Terraform module handler 값 `index.handler`에 맞춘 패키지 루트 진입점이다.

패키징 스크립트:

- `scripts/package_step2d_revenue_api_lambda.sh`
- 포함 파일:
  - `index.js`
  - `src/lambda-handler.js`
  - `src/revenue-ops/revenue-ops-handler.js`
  - `src/revenue-ops/revenue-ops-store.js`
  - `src/revenue-ops/data/revenue_ops_export.json`
- 제외:
  - Terraform tfvars/state/plan
  - `.env`
  - unrelated repo files
  - frontend build output

## 4. Lambda 아티팩트

생성 파일:

- Local: `build/revenue-api-step2d.zip`

업로드 위치:

- Bucket: `revenue-ops-artifacts-dev-827913617635`
- Key: `api-packages/revenue-api-step2d.zip`

업로드 확인:

- `aws s3api head-object --bucket revenue-ops-artifacts-dev-827913617635 --key api-packages/revenue-api-step2d.zip`
- 결과:
  - `ContentLength`: 7720
  - `ContentType`: `application/zip`
  - `ServerSideEncryption`: `AES256`
  - artifact bucket lifecycle rule 적용 대상

주의:

- Lambda ZIP 업로드는 API plan 준비를 위한 아티팩트 업로드이며, Terraform apply 또는 API 서비스 생성은 아니다.

## 5. 예상 API 라우트

Terraform route:

- `ANY /api/v1/revenue/{proxy+}`

Lambda adapter가 처리하는 Revenue Ops routes:

- `GET /api/v1/revenue/briefs`
- `GET /api/v1/revenue/briefs/:id`
- `GET /api/v1/revenue/anomalies`
- `GET /api/v1/revenue/anomalies/:id/evidence`
- `GET /api/v1/revenue/actions`
- `PATCH /api/v1/revenue/actions/:id/status`
- `GET /api/v1/revenue/context`
- `GET /api/v1/revenue/pipeline-meta`
- `OPTIONS /api/v1/revenue...`

현재 데이터 기준:

- Lambda 패키지 안의 export-backed JSON을 읽는다.
- Aurora persistence는 이 단계에서 사용하지 않는다.
- Action Planner status update는 Lambda 실행 환경의 in-memory store 기준으로 동작하며, 영속화는 이후 Aurora 단계의 범위다.

## 6. 실행한 검증

API 테스트:

```bash
node --test apps/api/src/revenue-ops/revenue-ops-routes.test.js apps/api/src/lambda-handler.test.js
```

결과:

- 8 tests passed
- 0 failed

문법 확인:

```bash
node --check apps/api/src/lambda-handler.js
node --check apps/api/lambda-index.js
```

결과:

- passed

패키징 스크립트 확인:

```bash
bash -n scripts/package_step2d_revenue_api_lambda.sh
```

결과:

- passed

참고:

- `shellcheck`는 현재 환경에 없어 skipped: script not present로 처리한다.

Terraform 확인:

```bash
terraform fmt -recursive -check infra/terraform
terraform -chdir=infra/terraform/envs/revenue-dev validate
```

결과:

- fmt check passed
- validate passed
- warning: backend `dynamodb_table` parameter deprecated. 현재 배포 차단 요인은 아니며 이후 backend 설정 정리 후보다.

## 7. Terraform plan 결과

실행 명령:

```bash
terraform -chdir=infra/terraform/envs/revenue-dev plan \
  -var-file=terraform.step1c.first-subset.tfvars \
  -out=tfplan.step2d.api-activation \
  -no-color
```

최종 결과:

- Plan: 9 to add, 0 to change, 0 to destroy
- Plan file: `infra/terraform/envs/revenue-dev/tfplan.step2d.api-activation`

초기 plan 중단 이력:

- 최초 plan은 Auth/Aurora disabled 상태의 nullable env var 처리 문제로 실패했다.
- API module의 Lambda environment variable 구성을 수정하여 Auth/Aurora가 disabled일 때 해당 env key를 포함하지 않도록 정리했다.
- 재실행한 최종 plan은 destroy 없이 API-only create plan으로 성공했다.

## 8. 생성 예정 리소스

최종 plan에서 생성 예정인 리소스:

- `module.revenue_api.aws_apigatewayv2_api.api[0]`
- `module.revenue_api.aws_apigatewayv2_integration.lambda[0]`
- `module.revenue_api.aws_apigatewayv2_route.revenue[0]`
- `module.revenue_api.aws_apigatewayv2_stage.default[0]`
- `module.revenue_api.aws_iam_role.api_lambda[0]`
- `module.revenue_api.aws_iam_policy.api_lambda[0]`
- `module.revenue_api.aws_iam_role_policy_attachment.api_lambda[0]`
- `module.revenue_api.aws_lambda_function.api[0]`
- `module.revenue_api.aws_lambda_permission.api_gateway[0]`

Lambda 설정:

- Runtime: `nodejs20.x`
- Handler: `index.handler`
- Memory: 512 MB
- Timeout: 30 seconds
- Artifact:
  - `s3://revenue-ops-artifacts-dev-827913617635/api-packages/revenue-api-step2d.zip`
- Environment:
  - `ARTIFACT_BUCKET = revenue-ops-artifacts-dev-827913617635`
- X-Ray:
  - enabled by current tfvars/module setting

API Gateway 설정:

- HTTP API
- Route: `ANY /api/v1/revenue/{proxy+}`
- Authorization: `NONE`
- Stage: `$default`
- Auto deploy: enabled
- Throttling:
  - burst 50
  - rate 25

## 9. 예상 외 리소스 점검

최종 plan에서 나타나지 않은 리소스:

- Cognito
- Aurora/RDS
- Glue
- Athena
- Step Functions
- EventBridge schedule
- live collectors
- POS ingestion
- frontend bucket replacement
- CloudFront distribution replacement
- artifact bucket replacement
- destroy action

판정:

- STEP 2-D API activation plan은 범위상 적합하다.
- apply 전 사용자가 plan 내용을 승인해야 한다.

## 10. 비용 및 보안 메모

비용:

- API Gateway HTTP API 요청 기반 과금
- Lambda 요청 수/실행 시간 기반 과금
- CloudWatch Logs는 Lambda 실행 시 로그 그룹/스트림/이벤트 저장 비용 발생 가능
- X-Ray enabled 상태이므로 trace 수집 비용이 발생할 수 있다.
- Aurora/Auth/ETL이 disabled라 고정 비용 증가는 제한적이다.

보안:

- 현재 API route authorization은 `NONE`이다.
- 이 단계는 frontend fallback에서 실제 API mode로 넘어가기 위한 최소 활성화 단계다.
- 공개 API 노출 전 rate limit, CORS, 로그 PII, error response를 smoke test에서 재확인해야 한다.
- Cognito 기반 인증은 이후 단계에서 별도 활성화해야 한다.
- Lambda IAM은 CloudWatch Logs, artifact bucket read, X-Ray write로 제한되어 있다.

## 11. Apply 승인 게이트

다음 문구로 명시 승인되기 전까지 apply를 실행하지 않는다.

```text
Approved to apply tfplan.step2d.api-activation for STEP 2-D API Gateway + Lambda only.
```

승인 후 적용 명령:

```bash
terraform -chdir=infra/terraform/envs/revenue-dev apply tfplan.step2d.api-activation
```

적용 후에도 다음은 금지:

- Cognito/Auth 활성화
- Aurora 활성화
- ETL/pipeline/schedule 활성화
- live collector 실행
- POS ingestion
- frontend asset redeploy

## 12. Post-Apply Smoke Test 계획

apply 승인 및 성공 후 수행할 smoke test:

1. Terraform output에서 `api_endpoint` 확인
2. API Gateway endpoint 직접 호출
   - `/api/v1/revenue/briefs`
   - `/api/v1/revenue/anomalies`
   - `/api/v1/revenue/actions`
   - `/api/v1/revenue/context`
   - `/api/v1/revenue/pipeline-meta`
3. Action Planner PATCH 확인
   - `/api/v1/revenue/actions/:id/status`
4. CORS preflight 확인
   - `OPTIONS /api/v1/revenue/actions/:id/status`
5. CloudWatch Lambda logs 확인
6. frontend `#revenue-cockpit?data=api`가 API Gateway endpoint로 연결 가능한지 별도 프론트 설정 경로 확인

주의:

- 현재 STEP 2-D는 API Gateway + Lambda만 생성한다.
- 프론트엔드가 새 API endpoint를 사용하도록 별도 설정/재배포가 필요하면 STEP 2-E 범위로 분리한다.
