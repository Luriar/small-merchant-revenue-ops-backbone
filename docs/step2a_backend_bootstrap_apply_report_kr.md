# STEP 2-A Backend Bootstrap Apply Report

## 1. 목적

Revenue-ops 전용 Terraform backend bootstrap apply를 실행하고 결과를 기록한다.

Hard stop:

- `terraform apply` (revenue-dev) 실행 금지 — 이 단계에서는 bootstrap backend만 대상
- productops 리소스 수정/삭제 금지
- secret/tfstate/tfplan commit 금지

---

## 2. Apply 명령

plan file이 stale(prior state 불일치)로 거부되어 직접 `-state`/`-state-out` 방식으로 실행:

```bash
cd infra/terraform/bootstrap

terraform apply \
  -state=revenue-ops-bootstrap.tfstate \
  -state-out=revenue-ops-bootstrap.tfstate \
  -var='state_bucket_name=revenue-ops-tfstate-827913617635' \
  -var='project_name=revenue-ops' \
  -var='aws_region=ap-northeast-2' \
  -var='tags={"Project":"revenue-ops","ManagedBy":"terraform","Purpose":"tf-state-backend","Contact":"joophila@naver.com"}' \
  -auto-approve \
  -no-color
```

> `-state` / `-state-out` flags는 Terraform 1.15.0에서 deprecated warning이 표시되나 정상 동작한다.
> `-auto-approve`는 plan이 이미 검토 및 승인되었기 때문에 사용.
> `revenue-ops-bootstrap.tfstate`가 존재하지 않으면 empty state로 처리 → productops state(`terraform.tfstate`)는 완전히 격리된다.

---

## 3. Apply 결과: 부분 성공

### 3-1. 성공한 리소스 (5개)

| 리소스 | 값 | 상태 |
|--------|-----|------|
| `aws_s3_bucket.tfstate` | `revenue-ops-tfstate-827913617635` | ✅ 생성됨 |
| `aws_s3_bucket_versioning.tfstate` | Enabled | ✅ 생성됨 |
| `aws_s3_bucket_server_side_encryption_configuration.tfstate` | AES256 | ✅ 생성됨 |
| `aws_s3_bucket_public_access_block.tfstate` | 4개 block 모두 true | ✅ 생성됨 |
| `random_id.bucket_suffix` | hex=d94a24ca | ✅ 생성됨 |

### 3-2. 실패한 리소스 (1개)

| 리소스 | 실패 이유 |
|--------|-----------|
| `aws_dynamodb_table.tflock` (`revenue-ops-tflock`) | ❌ IAM `AccessDeniedException` |

**DynamoDB 실패 원인:**

`de-ai-12`의 inline policy `TerraformDynamoDBLockTableAccess`가 DynamoDB 권한을 다음 ARN에만 허용한다:

```json
"Resource": "arn:aws:dynamodb:ap-northeast-2:827913617635:table/productops-tflock"
```

`revenue-ops-tflock`은 이 ARN에 포함되지 않으므로 `dynamodb:CreateTable`이 거부된다.

---

## 4. S3 Bucket 검증

AWS CLI로 독립 검증:

```bash
aws s3api head-bucket --bucket revenue-ops-tfstate-827913617635
# → BucketRegion: ap-northeast-2 ✅

aws s3api get-bucket-versioning --bucket revenue-ops-tfstate-827913617635
# → Enabled ✅

aws s3api get-bucket-encryption --bucket revenue-ops-tfstate-827913617635
# → AES256 ✅

aws s3api get-public-access-block --bucket revenue-ops-tfstate-827913617635
# → BlockPublicAcls: true, IgnorePublicAcls: true,
#   BlockPublicPolicy: true, RestrictPublicBuckets: true ✅
```

---

## 5. Productops 격리 확인 ✅

```text
terraform.tfstate serial: 12 (변경 없음)
aws_s3_bucket:     productops-tfstate-b68d831a  (변경 없음)
aws_dynamodb_table: productops-tflock           (변경 없음)
```

`revenue-ops-bootstrap.tfstate`(serial: 7)와 `terraform.tfstate`(serial: 12)는 완전히 독립된 state file이다.

---

## 6. IAM 제약 분석

| IAM 구성 요소 | 내용 |
|---------------|------|
| User inline policy | `TerraformDynamoDBLockTableAccess`: DynamoDB 전 작업 허용, **resource: `productops-tflock` ARN만** |
| Group policy | `DE-AI-Resource-Isolation-Policy`: `s3:*`, `iam:*`, `glue:*`, `athena:*`, `lambda:*` 등 허용 — **`dynamodb:*` 없음** |

`de-ai-12`는 `iam:*` 권한이 있으므로 자신의 inline policy를 확장할 수 있으나, IAM 정책 변경은 별도 explicit approval이 필요하다.

---

## 7. 경로 분기: DynamoDB 없이 진행하는 두 가지 방법

### 경로 A — S3 Native Locking (권장, 즉시 가능)

Terraform 1.10+에서 DynamoDB 없이 S3 native conditional write를 사용한 state locking을 지원한다.

backend config:

```hcl
# infra/terraform/envs/revenue-dev/backend.tf
terraform {
  backend "s3" {
    bucket       = "revenue-ops-tfstate-827913617635"
    key          = "revenue-ops/revenue-dev/terraform.tfstate"
    region       = "ap-northeast-2"
    encrypt      = true
    use_lockfile = true
  }
}
```

장점:
- IAM 변경 없이 즉시 진행 가능
- S3 bucket은 이미 생성되어 있음
- single-developer 환경에서 안전
- Terraform 1.10+에서 공식 지원

단점:
- S3 conditional write 기반이므로 DynamoDB보다 lock 내구성이 약간 낮음
- concurrent apply를 강하게 막아야 하는 팀 환경에서는 DynamoDB가 권장됨

### 경로 B — IAM Policy 확장 후 DynamoDB 생성

`TerraformDynamoDBLockTableAccess` inline policy의 `Resource`를 확장:

```json
"Resource": [
  "arn:aws:dynamodb:ap-northeast-2:827913617635:table/productops-tflock",
  "arn:aws:dynamodb:ap-northeast-2:827913617635:table/revenue-ops-tflock"
]
```

이후 재실행:

```bash
cd infra/terraform/bootstrap
terraform apply \
  -state=revenue-ops-bootstrap.tfstate \
  -state-out=revenue-ops-bootstrap.tfstate \
  -var='state_bucket_name=revenue-ops-tfstate-827913617635' \
  -var='project_name=revenue-ops' \
  -var='aws_region=ap-northeast-2' \
  -auto-approve
```

이 경우 이미 S3 리소스가 state에 존재하므로 DynamoDB table만 추가 생성된다.

backend config (DynamoDB 사용):

```hcl
# infra/terraform/envs/revenue-dev/backend.tf
terraform {
  backend "s3" {
    bucket         = "revenue-ops-tfstate-827913617635"
    key            = "revenue-ops/revenue-dev/terraform.tfstate"
    region         = "ap-northeast-2"
    encrypt        = true
    dynamodb_table = "revenue-ops-tflock"
  }
}
```

---

## 8. 현재 상태 요약

| 항목 | 상태 |
|------|------|
| S3 tfstate bucket (`revenue-ops-tfstate-827913617635`) | ✅ 생성됨, 보안 설정 완료 |
| DynamoDB lock table (`revenue-ops-tflock`) | ❌ IAM 제약으로 생성 실패 |
| Productops bucket (`productops-tfstate-b68d831a`) | ✅ 영향 없음 |
| Productops lock table (`productops-tflock`) | ✅ 영향 없음 |
| `revenue-ops-bootstrap.tfstate` | ✅ 생성됨 (gitignored), 5개 S3 리소스 추적 |
| `terraform.tfstate` (productops) | ✅ serial=12 unchanged |

**다음 단계 결정 필요:**
- 경로 A (S3 native locking, 즉시 진행 가능) 또는
- 경로 B (IAM 정책 확장 후 DynamoDB 추가 생성) 중 선택

---

## 9. 변경된 파일

```
infra/terraform/bootstrap/
  revenue-ops-bootstrap.tfstate   # 신규 (gitignored — commit 금지)
  revenue-ops-bootstrap.tfplan    # 기존 (gitignored — commit 금지)

docs/
  step2a_backend_bootstrap_apply_report_kr.md  # 이 문서 (commit 대상)
```

---

## 10. 권장 커밋 명령 (docs only)

```bash
git add docs/step2a_backend_bootstrap_apply_report_kr.md

git commit -m "docs: add STEP 2-A backend bootstrap apply report (S3 created, DynamoDB IAM blocker)"
```

---

## 11. 경로 A 선택 시 즉시 진행 가능한 다음 명령

```bash
# 1. backend.tf 업데이트 (use_lockfile = true)
# infra/terraform/envs/revenue-dev/backend.tf 편집 후:

cd infra/terraform/envs/revenue-dev

terraform init \
  -backend-config="bucket=revenue-ops-tfstate-827913617635" \
  -backend-config="key=revenue-ops/revenue-dev/terraform.tfstate" \
  -backend-config="region=ap-northeast-2" \
  -backend-config="encrypt=true" \
  -backend-config="use_lockfile=true"

terraform validate

terraform plan \
  -var-file="terraform.step1c.first-subset.tfvars" \
  -out="tfplan.step2.frontend-first"
```
