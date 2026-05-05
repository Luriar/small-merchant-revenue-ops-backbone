# STEP 2-A: First AWS Activation Plan Report

## 1. 목적

STEP 2-A는 첫 `terraform plan`(artifacts + frontend)을 실행하기 위한 사전 조건을 점검하고, plan이 가능하면 실행하며, 불가하면 정확한 blocker를 기록한다. `terraform apply`는 이 단계에서 실행하지 않는다.

Hard stop:

- `terraform apply` 실행 금지
- frontend asset deploy 금지
- AWS resource 생성/수정/삭제 금지 (`terraform plan`은 읽기 전용)
- live collector/schedule 활성화 금지
- secret 또는 `.tfvars`/`tfplan*` commit 금지

---

## 2. 작업 시작 시 Git 상태

```
HEAD: 17ebe1b  chore: prepare STEP 1-E first AWS activation readiness package
branch: main (clean)
```

최근 완료 커밋:

```
17ebe1b  chore: prepare STEP 1-E first AWS activation readiness package
3268dd8  chore: gate pipeline foundation for frontend-first plan
f3d3f44  chore: prepare STEP 1-C Terraform plan readiness
```

---

## 3. Non-Mutating Precheck 결과

### 3-1. 실행 명령

```bash
terraform fmt -recursive -check infra/terraform
bash -n scripts/step2_frontend_first_plan_precheck.sh
bash scripts/step2_frontend_first_plan_precheck.sh
```

### 3-2. 결과 요약

| 항목 | 결과 | 비고 |
|------|------|------|
| `git status` | ✅ clean | working tree 변경 없음 |
| Terraform version | ✅ v1.15.0 | minor update available (1.15.1) |
| AWS CLI version | ✅ 2.34.38 | |
| `terraform fmt -recursive -check` | ✅ PASS | 모든 `.tf` HCL 형식 일치 |
| `bash -n` script syntax check | ✅ PASS | |
| local tfvars | ✅ 존재 | 이 단계에서 신규 생성 (아래 §5 참조) |
| AWS caller identity | ✅ 확인됨 | account `827913617635`, user `de-ai-12` |
| AWS region | ✅ `ap-northeast-2` | |
| `AWS_PROFILE` | ℹ️ not set | default credential chain 사용 |

---

## 4. AWS Identity 확인

```text
Account:  827913617635
ARN:      arn:aws:iam::827913617635:user/de-ai-12
Region:   ap-northeast-2
Profile:  (default credential chain; AWS_PROFILE not set)
```

이 account는 small-merchant Revenue Ops SaaS 전용으로 확인된다. `productops-*` account와 동일한 account이지만 backend는 별도로 생성한다.

---

## 5. Local tfvars 상태

| 파일 | 상태 |
|------|------|
| `terraform.step1c.first-subset.tfvars.example` | 이미 존재 (tracked) |
| `terraform.step1c.first-subset.tfvars` | 신규 생성 (gitignored) |

`terraform.step1c.first-subset.tfvars`는 example을 복사한 뒤 아래 값을 채웠다:

- `YOURACCOUNTID` → `827913617635` (3개 bucket name에 반영)
- `Contact` → `joophila@naver.com`

placeholder 점검:

```bash
grep -n "YOURACCOUNTID\|your@email.com" terraform.step1c.first-subset.tfvars
# (no output — placeholder 없음)
```

이 파일은 `.gitignore`의 `*.tfvars` 규칙으로 보호된다. commit 금지.

---

## 6. Backend 판정: ❌ BLOCKED

### 6-1. 확인 결과

| 리소스 | 발견 여부 | 판정 |
|--------|-----------|------|
| S3 tfstate bucket (revenue-ops-*) | ❌ 없음 | 생성 필요 |
| DynamoDB lock table (revenue-ops-*) | ❌ 없음 | 생성 필요 |
| bootstrap local state | ✅ 존재 | `productops-*` 값 → **사용 금지** |

`infra/terraform/bootstrap/terraform.tfstate` (gitignored, 로컬)에는 아래 리소스가 기록되어 있다:

```text
aws_s3_bucket:     productops-tfstate-b68d831a   ← 사용 금지
aws_dynamodb_table: productops-tflock             ← 사용 금지
```

이 값들은 이 프로젝트의 small-merchant revenue-ops backend로 사용할 수 없다.

### 6-2. Terraform plan이 실행되지 않은 이유

`terraform init`에 `bucket`과 `dynamodb_table` 값을 제공해야 하는데, 해당하는 small-merchant backend 리소스가 AWS에 존재하지 않는다. backend 없이는 state 저장소가 없고, state 없이는 plan 실행이 안 된다.

---

## 7. 정확한 Blocker 목록

Terraform plan을 실행하려면 아래 3가지가 필요하다:

| # | Blocker | 해결 방법 |
|---|---------|-----------|
| 1 | S3 tfstate bucket 없음 | bootstrap apply로 `revenue-ops-tfstate-827913617635` 생성 |
| 2 | DynamoDB lock table 없음 | bootstrap apply로 `revenue-ops-tflock` 생성 |
| 3 | `backend.tf`에 실제 값 없음 | bootstrap output으로 채우거나 `-backend-config` flag 사용 |

---

## 8. Bootstrap 경로 (apply 별도 승인 필요)

### 8-1. 현재 bootstrap 상태

bootstrap 디렉토리 (`infra/terraform/bootstrap/`)에 `terraform.tfstate`가 존재하며 `productops-*` 리소스를 추적하고 있다. 이 state를 그대로 쓰면 productops 리소스를 관리하게 된다. 따라서 새 revenue-ops backend를 만들 때는 아래 두 경로 중 하나를 선택한다.

### 경로 A — bootstrap state 초기화 후 재실행 (권장)

> **주의:** 아래 명령 중 `rm` 이후는 복구 불가. local state가 있으면 backup 후 진행.

```bash
# local state backup (선택)
cp infra/terraform/bootstrap/terraform.tfstate \
   infra/terraform/bootstrap/terraform.tfstate.productops.backup

# bootstrap state 초기화
rm infra/terraform/bootstrap/terraform.tfstate
rm infra/terraform/bootstrap/terraform.tfstate.backup 2>/dev/null || true

cd infra/terraform/bootstrap
terraform init

# plan 검토 (non-mutating)
terraform plan \
  -var='state_bucket_name=revenue-ops-tfstate-827913617635' \
  -var='project_name=revenue-ops' \
  -var='aws_region=ap-northeast-2'

# --- explicit approval 후 apply ---
# terraform apply \
#   -var='state_bucket_name=revenue-ops-tfstate-827913617635' \
#   -var='project_name=revenue-ops' \
#   -var='aws_region=ap-northeast-2'
```

### 경로 B — AWS CLI로 backend 리소스 직접 생성 (bootstrap Terraform 우회)

```bash
# S3 bucket 생성
aws s3api create-bucket \
  --bucket revenue-ops-tfstate-827913617635 \
  --region ap-northeast-2 \
  --create-bucket-configuration LocationConstraint=ap-northeast-2

# 버전 관리 활성화
aws s3api put-bucket-versioning \
  --bucket revenue-ops-tfstate-827913617635 \
  --versioning-configuration Status=Enabled

# 서버 측 암호화
aws s3api put-bucket-encryption \
  --bucket revenue-ops-tfstate-827913617635 \
  --server-side-encryption-configuration \
    '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

# public access block
aws s3api put-public-access-block \
  --bucket revenue-ops-tfstate-827913617635 \
  --public-access-block-configuration \
    'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true'

# DynamoDB lock table 생성
aws dynamodb create-table \
  --table-name revenue-ops-tflock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region ap-northeast-2

echo "backend resources created"
```

> 경로 B는 Terraform state 추적 없이 리소스를 직접 생성한다. 관리 편의상 경로 A가 권장되지만, 경로 B가 더 단순하다. 어느 경로든 mutating 명령은 **별도 explicit approval** 후 실행한다.

### 8-2. Bootstrap 후 backend.tf 업데이트

bootstrap이 완료되면 `backend.tf`에 실제 값을 채운다:

```hcl
terraform {
  backend "s3" {
    bucket         = "revenue-ops-tfstate-827913617635"
    key            = "revenue-ops/revenue-dev/terraform.tfstate"
    region         = "ap-northeast-2"
    dynamodb_table = "revenue-ops-tflock"
    encrypt        = true
  }
}
```

또는 `-backend-config` flag로 제공한다:

```bash
terraform init \
  -backend-config="bucket=revenue-ops-tfstate-827913617635" \
  -backend-config="key=revenue-ops/revenue-dev/terraform.tfstate" \
  -backend-config="region=ap-northeast-2" \
  -backend-config="dynamodb_table=revenue-ops-tflock" \
  -backend-config="encrypt=true"
```

---

## 9. Backend 준비 후 Plan 실행 순서

backend가 존재하고 local tfvars가 준비된 후:

```bash
# script 방식
TF_BACKEND_BUCKET=revenue-ops-tfstate-827913617635 \
TF_BACKEND_KEY=revenue-ops/revenue-dev/terraform.tfstate \
TF_BACKEND_REGION=ap-northeast-2 \
TF_BACKEND_DYNAMODB_TABLE=revenue-ops-tflock \
scripts/step2_frontend_first_plan_precheck.sh --plan

# 또는 수동 방식
cd infra/terraform/envs/revenue-dev

terraform init \
  -backend-config="bucket=revenue-ops-tfstate-827913617635" \
  -backend-config="key=revenue-ops/revenue-dev/terraform.tfstate" \
  -backend-config="region=ap-northeast-2" \
  -backend-config="dynamodb_table=revenue-ops-tflock" \
  -backend-config="encrypt=true"

terraform validate

terraform plan \
  -var-file="terraform.step1c.first-subset.tfvars" \
  -out="tfplan.step2.frontend-first"

terraform show -no-color tfplan.step2.frontend-first > /tmp/tfplan.step2.frontend-first.txt
```

---

## 10. 첫 Plan에서 기대하는 Resource

backend 준비 후 plan이 실행되면 아래 resource만 나와야 한다:

**`module.artifacts`**
- `aws_s3_bucket` — `revenue-ops-artifacts-dev-827913617635`
- `aws_s3_bucket_versioning`
- `aws_s3_bucket_server_side_encryption_configuration`
- `aws_s3_bucket_public_access_block`
- `aws_s3_bucket_lifecycle_configuration`
- `aws_s3_object` × 4 (prefix markers: `exports/`, `api-packages/`, `frontend-builds/`, `pipeline-artifacts/`)

**`module.frontend_hosting`**
- `aws_s3_bucket` — `revenue-ops-frontend-dev-827913617635`
- `aws_s3_bucket_versioning`
- `aws_s3_bucket_server_side_encryption_configuration`
- `aws_s3_bucket_public_access_block`
- `aws_cloudfront_origin_access_control`
- `aws_cloudfront_distribution`
- `aws_s3_bucket_policy`

Route 53 / ACM resource는 `create_frontend_dns_records = false`이므로 포함 안 됨.

**ETL / API / Auth / Aurora**는 전부 0개여야 한다.

---

## 11. Plan에 나오면 즉시 중단해야 하는 Resource

아래 resource 중 하나라도 plan에 나타나면 즉시 중단하고 원인을 확인한다:

- `aws_api_gateway_*` / `aws_lambda_function` (Revenue Ops API)
- `aws_cognito_user_pool*`
- `aws_rds_cluster*` / `aws_secretsmanager_secret` (Aurora)
- `aws_glue_*`
- `aws_athena_*`
- `aws_sfn_state_machine`
- `aws_scheduler_schedule`
- `aws_lambda_function` (extractor)
- `aws_ssm_parameter` (external API key)
- `aws_cloudwatch_metric_alarm` (SaaS observability)

---

## 12. Apply Approval Gate

plan review 후에도 아래 명시적 승인 없이는 `terraform apply`를 실행하지 않는다:

```text
"Approved to run terraform apply for STEP 2 frontend-first artifacts + frontend subset only."
```

필수 검토 항목:

- [ ] plan resource list에 API/Auth/Aurora/ETL 없음 확인
- [ ] bucket name에 올바른 account ID 반영 확인
- [ ] CloudFront `PriceClass_100` 유지 확인
- [ ] 예상 비용 낮음 확인 (S3 idle + CloudFront idle)
- [ ] backend bucket/table 이름 확인
- [ ] rollback plan 확인

---

## 13. STEP 2-A 결론

| 항목 | 상태 |
|------|------|
| AWS account 확인 | ✅ `827913617635` / `de-ai-12` |
| AWS region 확인 | ✅ `ap-northeast-2` |
| `terraform fmt` | ✅ PASS |
| precheck script (non-plan) | ✅ PASS |
| local tfvars | ✅ 생성됨 (placeholder 없음) |
| Small-merchant backend | ❌ 없음 — **주요 blocker** |
| Terraform plan | ❌ 미실행 (backend blocker) |
| `terraform apply` | ❌ 금지 (hard stop) |

**Next action:** bootstrap 경로(A 또는 B)를 선택하고 explicit approval 후 backend 리소스 생성 → `backend.tf` 업데이트 → init/validate/plan 실행.

---

## 14. 변경된 파일

```
infra/terraform/envs/revenue-dev/
  terraform.step1c.first-subset.tfvars   # 신규 (gitignored — commit 금지)

docs/
  step2a_first_aws_activation_plan_report_kr.md  # 이 문서
```

---

## 15. 권장 커밋 명령 (docs only)

```bash
git add docs/step2a_first_aws_activation_plan_report_kr.md

git commit -m "docs: add STEP 2-A first AWS activation plan report (backend blocker)"
```

`terraform.step1c.first-subset.tfvars`는 `.gitignore`가 보호하므로 stage되지 않는다.
