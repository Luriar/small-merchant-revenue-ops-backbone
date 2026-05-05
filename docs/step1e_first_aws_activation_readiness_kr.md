# STEP 1-E First AWS Activation Readiness Package

## 1. 목적

STEP 1-E의 목적은 small-merchant Revenue Ops SaaS의 첫 AWS activation review가 바로 진행될 수 있도록 backend, tfvars, plan command, guardrail, smoke test 기준을 한 곳에 묶는 것이다.

이 단계는 activation이 아니다.

Hard stop:

- `terraform apply` 실행 금지
- frontend asset deploy 금지
- AWS resource 생성/수정/삭제 금지
- live collector 실행 금지
- EventBridge schedule enable 금지
- Aurora migration 실행 금지
- secret 또는 local `.tfvars` commit 금지

## 2. 현재 Git/단계 상태

작업 시작 시 working tree는 clean이었다.

최근 완료 커밋:

```text
3268dd8 chore: gate pipeline foundation for frontend-first plan
f3d3f44 chore: prepare STEP 1-C Terraform plan readiness
615bb99 chore: add STEP 1-B production-min AWS foundation skeleton
```

STEP 1-D는 commit되어 있다. `enable_pipeline_foundation = false` 기본값으로 기존 ETL foundation이 첫 full plan에 포함되지 않도록 gate되었다.

## 3. Small-Merchant Backend 판정

현재 repo에 확인된 small-merchant Terraform backend 값은 없다.

`infra/terraform/bootstrap/terraform.tfstate`와 `.backup`은 local, gitignored state 파일이며 `productops-*` 이름을 참조한다. 이는 small-merchant Revenue Ops SaaS backend source of truth로 사용하면 안 된다.

확인해야 할 backend 값:

```text
bucket         = <small-merchant-revenue-ops-tfstate-bucket>
key            = revenue-ops/revenue-dev/terraform.tfstate
region         = ap-northeast-2
dynamodb_table = <small-merchant-revenue-ops-tflock-table>
encrypt        = true
AWS profile/account = <explicit profile and account id>
```

backend resource가 아직 없다면 bootstrap은 별도 reviewed plan/apply 단계가 필요하다. STEP 1-E에서는 bootstrap apply를 실행하지 않았다.

## 4. First Enabled Subset

첫 activation review 대상은 frontend-first subset이다.

```hcl
enable_pipeline_foundation = false
enable_artifacts           = true
enable_frontend            = true
enable_api                 = false
enable_auth                = false
enable_aurora              = false
enable_saas_observability  = false
enable_schedule            = false
```

목표:

- S3 artifact bucket과 S3 + CloudFront frontend hosting foundation만 먼저 plan한다.
- M5 export-backed/fallback behavior는 유지한다.
- API Gateway/Lambda, Cognito, Aurora, SaaS alarms, ETL pipeline은 다음 단계로 분리한다.

## 5. tfvars 준비

사용할 template:

```text
infra/terraform/envs/revenue-dev/terraform.step1c.first-subset.tfvars.example
```

로컬 준비:

```bash
cd infra/terraform/envs/revenue-dev
cp terraform.step1c.first-subset.tfvars.example terraform.step1c.first-subset.tfvars
```

로컬 `.tfvars`에서 바꿀 값:

- `YOURACCOUNTID`가 들어간 bucket name
- `tags.Contact`
- 필요 시 `aws_region`
- 첫 plan에서는 DNS/custom domain 값을 기본값 그대로 비활성 유지 권장

commit 금지:

- `terraform.step1c.first-subset.tfvars`
- 기타 `*.tfvars`
- `tfplan*`
- `*.tfstate`
- `.terraform/`

`.gitignore`는 위 항목을 보호하도록 업데이트되었다.

## 6. 첫 Plan에서 기대하는 Resource

반드시 포함될 수 있는 resource family:

- `module.artifacts`
  - S3 artifact bucket
  - S3 versioning
  - SSE configuration
  - public access block
  - lifecycle rule
  - prefix marker objects
- `module.frontend_hosting`
  - private S3 frontend bucket
  - S3 versioning
  - SSE configuration
  - public access block
  - CloudFront OAC
  - CloudFront distribution
  - S3 bucket policy for CloudFront read

Route 53/ACM 관련 resource는 `frontend_domain_aliases`, `frontend_hosted_zone_id`, `frontend_acm_certificate_arn`, `create_frontend_dns_records`를 명시적으로 켤 때만 포함되어야 한다.

## 7. 첫 Plan에 나오면 안 되는 Resource

아래 resource family가 첫 frontend-first full plan에 나오면 plan을 중단하고 원인을 확인한다.

- API Gateway
- Lambda Revenue Ops API
- Cognito
- Aurora / RDS / Secrets Manager DB credential
- SaaS observability alarm resources
- Glue
- Athena
- Step Functions
- EventBridge Scheduler
- live collector Lambda resources
- SSM external API key parameters
- Aurora schema migration resource
- frontend asset upload/deploy resource

## 8. Cost Guardrails

첫 subset 비용 리스크는 낮음-중간이다.

- S3 idle storage는 낮은 비용
- CloudFront distribution은 idle 비용이 낮지만 traffic-dependent
- Route 53 hosted zone은 새로 만들지 않는다
- API/Lambda/Cognito/Aurora/ETL은 disabled
- EventBridge schedule disabled
- frontend asset deploy 없음

첫 apply 승인 전 확인:

- CloudFront `PriceClass_100` 유지
- S3 lifecycle rule 확인
- 불필요한 logging 또는 long retention 미도입
- custom domain은 별도 승인 전 disabled 유지

## 9. Security Guardrails

첫 subset 보안 기준:

- frontend S3 bucket은 public bucket이 아니다
- S3 public access block enabled
- CloudFront OAC로만 frontend origin read
- SSE enabled
- HTTPS redirect enabled
- local tfvars와 state/plan 파일 commit 금지
- IAM/API/Auth/Aurora는 첫 subset에서 제외

AWS credential 기준:

- plan/apply 권한 profile을 명시한다
- account id를 확인한다
- productops backend/account와 혼동하지 않는다

## 10. Non-Mutating Precheck Script

추가 helper:

```bash
scripts/step2_frontend_first_plan_precheck.sh
```

기본 실행은 plan을 실행하지 않는다.

```bash
scripts/step2_frontend_first_plan_precheck.sh
```

확인 항목:

- git status
- Terraform version
- AWS CLI version
- local tfvars 존재 여부
- Terraform formatting
- AWS caller identity

명시적 plan 모드:

```bash
TF_BACKEND_BUCKET=<small-merchant-tfstate-bucket> \
TF_BACKEND_KEY=revenue-ops/revenue-dev/terraform.tfstate \
TF_BACKEND_REGION=ap-northeast-2 \
TF_BACKEND_DYNAMODB_TABLE=<small-merchant-tflock-table> \
AWS_PROFILE=<explicit-profile> \
scripts/step2_frontend_first_plan_precheck.sh --plan
```

`--plan` 모드는 backend env var와 local tfvars가 없으면 실패한다. 이 script는 `terraform apply`를 실행하지 않는다.

## 11. Exact Init/Validate/Plan Commands

script 없이 수동 실행할 때:

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

terraform show -no-color tfplan.step2.frontend-first > /tmp/tfplan.step2.frontend-first.txt
```

Hard stop: plan review 후에도 explicit approval 전까지 `terraform apply` 금지.

## 12. Rollback/Delete Notes

첫 apply가 승인된 이후 문제가 생기면 rollback은 즉시 delete가 아니라 plan 기반으로 한다.

원칙:

- CloudFront distribution은 disable/delete propagation 시간이 걸린다.
- S3 bucket은 object가 있으면 destroy가 실패할 수 있다.
- Terraform state는 절대 수동 삭제하지 않는다.
- 긴급 정리도 `terraform plan -destroy` 검토 후 별도 승인으로 진행한다.
- frontend asset deploy가 아직 없으면 S3 object cleanup 범위는 제한적이어야 한다.

STEP 1-E에서는 rollback/delete command를 실행하지 않는다.

## 13. Post-Apply Frontend Smoke Test Plan

첫 apply가 나중에 승인되고 완료된 뒤에만 수행한다.

확인 순서:

1. Terraform output에서 CloudFront domain 확인
2. 아직 asset deploy 전이면 CloudFront가 403/404 또는 placeholder 상태임을 확인
3. asset deploy가 별도 승인된 뒤 `https://<cloudfront-domain>/#revenue-cockpit` 접속
4. `#revenue-cockpit?data=api`는 API disabled 상태에서 fallback behavior 확인
5. browser console/network error가 portfolio demo를 깨지 않는지 확인
6. API/Auth/Aurora가 생성되지 않았음을 AWS console/plan/state로 재확인

## 14. STEP 1-E Validation Results

실행한 safe validation:

```bash
terraform fmt -recursive -check infra/terraform
bash -n scripts/step2_frontend_first_plan_precheck.sh
```

`shellcheck`가 설치되어 있으면 script lint도 실행한다. 없으면 `bash -n`으로 syntax check를 대체한다.

Terraform plan은 실행하지 않는다. backend/tfvars/profile이 아직 explicit and safe로 확인되지 않았기 때문이다.

## 15. STEP 1-E 결론

Readiness package는 준비되었다.

다음 단계에서 바로 할 일:

1. small-merchant backend bucket/table 값을 확정한다.
2. AWS profile/account를 확정한다.
3. local `terraform.step1c.first-subset.tfvars`를 작성한다.
4. precheck script 또는 수동 command로 init/validate/plan을 실행한다.
5. plan review 후 apply 승인 여부를 별도로 결정한다.

현재 상태에서는 next step이 Terraform plan을 즉시 실행할 수 없다. backend 값과 local tfvars가 아직 missing이다.
