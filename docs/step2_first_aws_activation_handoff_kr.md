# STEP 2 First AWS Activation Handoff

## 1. 목적

이 문서는 STEP 2에서 첫 AWS activation planning/review를 시작하기 위한 handoff다. STEP 2의 첫 목표는 apply가 아니라 `artifacts + frontend`만 포함하는 Terraform plan을 만들고 검토하는 것이다.

## 2. STEP 2 진입 조건

필수 확인:

- small-merchant 전용 tfstate S3 bucket 이름
- small-merchant 전용 DynamoDB lock table 이름
- backend key: `revenue-ops/revenue-dev/terraform.tfstate`
- backend region: `ap-northeast-2`
- AWS profile과 account id
- local `terraform.step1c.first-subset.tfvars`

사용 금지:

- local bootstrap state의 `productops-*` 값
- committed `.tfvars`
- committed tfplan/state 파일

## 3. First Plan Scope

활성화:

```hcl
enable_pipeline_foundation = false
enable_artifacts           = true
enable_frontend            = true
```

비활성화:

```hcl
enable_api                 = false
enable_auth                = false
enable_aurora              = false
enable_saas_observability  = false
enable_schedule            = false
```

## 4. Plan 실행 전 Precheck

기본 precheck:

```bash
scripts/step2_frontend_first_plan_precheck.sh
```

이 명령은 plan을 실행하지 않는다.

Plan까지 실행하려면 명시적 `--plan`과 backend env var가 필요하다.

```bash
TF_BACKEND_BUCKET=<small-merchant-tfstate-bucket> \
TF_BACKEND_KEY=revenue-ops/revenue-dev/terraform.tfstate \
TF_BACKEND_REGION=ap-northeast-2 \
TF_BACKEND_DYNAMODB_TABLE=<small-merchant-tflock-table> \
AWS_PROFILE=<explicit-profile> \
scripts/step2_frontend_first_plan_precheck.sh --plan
```

## 5. 수동 Init/Validate/Plan

```bash
cd infra/terraform/envs/revenue-dev

terraform init \
  -backend-config="bucket=<small-merchant-tfstate-bucket>" \
  -backend-config="key=revenue-ops/revenue-dev/terraform.tfstate" \
  -backend-config="region=ap-northeast-2" \
  -backend-config="dynamodb_table=<small-merchant-tflock-table>" \
  -backend-config="encrypt=true"

terraform validate

terraform plan \
  -var-file="terraform.step1c.first-subset.tfvars" \
  -out="tfplan.step2.frontend-first"
```

검토용 plan text:

```bash
terraform show -no-color tfplan.step2.frontend-first > /tmp/tfplan.step2.frontend-first.txt
```

## 6. Plan Review Checklist

포함되어야 하는 것:

- artifact S3 bucket
- frontend S3 bucket
- S3 versioning/encryption/public access block
- CloudFront OAC
- CloudFront distribution
- frontend S3 bucket policy

포함되면 안 되는 것:

- API Gateway
- Lambda API
- Cognito
- Aurora/RDS
- Secrets Manager DB credential
- Glue/Athena/Step Functions/EventBridge
- EventBridge enabled schedule
- external collector 실행 관련 변경
- frontend asset upload/deploy

## 7. Apply Approval Gate

STEP 2 plan review가 끝나도 아래 승인 전에는 apply하지 않는다.

필수 승인 항목:

- plan resource list
- estimated cost
- AWS account/profile
- backend bucket/table
- bucket names
- CloudFront distribution settings
- no API/Auth/Aurora/ETL resources in first plan
- rollback/destroy review

승인 문구 예:

```text
Approved to run terraform apply for STEP 2 frontend-first artifacts + frontend subset only.
```

## 8. Post-Apply Smoke Test

apply가 별도 승인되어 실행된 이후:

1. Terraform output 확인
2. CloudFront domain 접근 확인
3. asset deploy 전 상태를 정상 baseline으로 기록
4. asset deploy가 별도 승인된 뒤 `/#revenue-cockpit` 확인
5. API disabled 상태에서 `/#revenue-cockpit?data=api` fallback 확인
6. AWS console/state에서 API/Auth/Aurora/ETL이 생성되지 않았는지 확인

## 9. 중단 기준

즉시 중단:

- backend가 `productops-*`를 가리킴
- tfvars에 placeholder가 남아 있음
- AWS account/profile이 기대값과 다름
- plan에 API/Auth/Aurora/ETL resource가 포함됨
- schedule enable resource가 나타남
- 비용 또는 public exposure가 예상보다 큼

## 10. 다음 산출물

STEP 2에서 생성할 산출물:

- first plan command output summary
- plan resource summary
- cost/security risk review
- apply approval request 또는 apply 보류 사유

STEP 2에서도 explicit approval 전까지 `terraform apply`는 실행하지 않는다.
