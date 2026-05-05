# STEP 2-A Backend Bootstrap Plan

## 1. 목적

Small-merchant Revenue Ops SaaS 전용 Terraform remote state backend를 생성하기 위한 bootstrap plan을 준비하고 실행한다. `terraform apply`는 이 단계에서 실행하지 않는다.

Hard stop:

- `terraform apply` 실행 금지 — 별도 explicit approval 필요
- `productops-*` backend 값 사용 금지
- productops backend resources (`productops-tfstate-b68d831a`, `productops-tflock`) 수정/삭제 금지
- secret 또는 `.tfvars`/`*.tfplan`/`*.tfstate` commit 금지

---

## 2. Bootstrap 현황 분석

### 2-1. Bootstrap 디렉토리 구조

```
infra/terraform/bootstrap/
  main.tf                                # S3 bucket + DynamoDB table 생성
  variables.tf                           # project_name, state_bucket_name 등
  outputs.tf                             # backend_config_snippet 포함
  providers.tf                           # aws provider
  versions.tf                            # aws ~> 5.0, random ~> 3.0
  terraform.revenue-ops.tfvars.example   # (신규) revenue-ops bootstrap 예시 값
  terraform.tfstate                      # (gitignored) 기존 productops 상태 추적
  terraform.tfstate.backup               # (gitignored) productops state backup
  .terraform/                            # (gitignored) provider cache (aws 5.100.0)
  .terraform.lock.hcl                    # provider lock (aws 5.100.0, random 3.8.1)
```

### 2-2. 기존 bootstrap state 내용 (사용 금지)

```text
serial: 12
aws_s3_bucket.tfstate:     productops-tfstate-b68d831a   ← 사용 금지
aws_dynamodb_table.tflock: productops-tflock             ← 사용 금지
random_id.bucket_suffix:   b68d831a
```

동일 AWS account (`827913617635`)에 존재하는 실제 리소스다. 삭제하거나 수정하면 안 된다.

### 2-3. 일반 plan 실행이 위험한 이유

기본 `terraform plan`은 `terraform.tfstate`를 current state로 읽는다. 새 변수 값 (`project_name=revenue-ops`, `state_bucket_name=revenue-ops-tfstate-827913617635`)을 넣으면 Terraform은:

- `productops-tfstate-b68d831a` → **destroy** (위험)
- `productops-tflock` → **destroy** (위험)
- `revenue-ops-tfstate-827913617635` → create
- `revenue-ops-tflock` → create

이 결과는 productops backend를 파괴하므로 절대 실행하면 안 된다.

---

## 3. 안전한 Bootstrap 경로: `-state` flag로 별도 state 지정

### 3-1. 핵심 원리

`terraform plan -state=FILE`은 지정된 `FILE`을 current state로 읽는다. `FILE`이 존재하지 않으면 empty state로 처리한다 → plan은 오직 create만 포함한다.

```bash
terraform plan \
  -state=revenue-ops-bootstrap.tfstate \    ← 존재하지 않음 → empty state
  -var='state_bucket_name=revenue-ops-tfstate-827913617635' \
  -var='project_name=revenue-ops' \
  -out=revenue-ops-bootstrap.tfplan
```

결과:

- `terraform.tfstate` (productops): **완전히 untouched**
- `revenue-ops-bootstrap.tfstate`: plan 단계에서는 생성 안 됨
- `revenue-ops-bootstrap.tfplan`: plan 저장 (gitignored)

### 3-2. Deprecation 경고 안내

Terraform 1.15.0에서 `-state` flag가 deprecated로 표시된다:

```
Warning: Deprecated flag: -state
Use the "path" attribute within the "local" backend to specify a file for
state storage
```

이는 warning이며 plan은 정상적으로 완료된다. apply 시에도 동일하게 deprecated warning이 뜰 수 있으나 현재 버전에서는 기능이 제거되지 않았다.

---

## 4. Bootstrap Plan 실행 결과

### 4-1. 실행 명령

```bash
cd infra/terraform/bootstrap

terraform plan \
  -state=revenue-ops-bootstrap.tfstate \
  -var='state_bucket_name=revenue-ops-tfstate-827913617635' \
  -var='project_name=revenue-ops' \
  -var='aws_region=ap-northeast-2' \
  -var='tags={"Project":"revenue-ops","ManagedBy":"terraform","Purpose":"tf-state-backend","Contact":"joophila@naver.com"}' \
  -out=revenue-ops-bootstrap.tfplan \
  -no-color
```

### 4-2. Plan 결과 요약

```
Plan: 6 to add, 0 to change, 0 to destroy.
```

**예상한 대로 productops 리소스에 영향 없음.** 

### 4-3. 생성될 리소스 목록

| # | Resource | 생성 값 | 비고 |
|---|----------|---------|------|
| 1 | `aws_s3_bucket.tfstate` | `revenue-ops-tfstate-827913617635` | `force_destroy=false` |
| 2 | `aws_s3_bucket_versioning.tfstate` | `Enabled` | |
| 3 | `aws_s3_bucket_server_side_encryption_configuration.tfstate` | `AES256` | |
| 4 | `aws_s3_bucket_public_access_block.tfstate` | 모든 block 활성 | public access 완전 차단 |
| 5 | `aws_dynamodb_table.tflock` | `revenue-ops-tflock` | PAY_PER_REQUEST, hash_key=LockID |
| 6 | `random_id.bucket_suffix` | (자동 생성) | `state_bucket_name`이 명시적이라 bucket naming에 미사용 |

### 4-4. Outputs (apply 후 확인 필요)

| Output | 예상 값 |
|--------|---------|
| `state_bucket_name` | `revenue-ops-tfstate-827913617635` |
| `dynamodb_table_name` | `revenue-ops-tflock` |
| `aws_region` | `ap-northeast-2` |
| `backend_config_snippet` | (apply 후 확인) |

### 4-5. productops state 검증 (apply 전)

```text
serial: 12  (변경 없음)
aws_s3_bucket.tfstate:     productops-tfstate-b68d831a  (변경 없음)
aws_dynamodb_table.tflock: productops-tflock            (변경 없음)
```

`revenue-ops-bootstrap.tfstate`는 생성되지 않음 (plan only 확인).

---

## 5. Apply Approval Gate

아래 명시적 승인 없이는 `terraform apply`를 실행하지 않는다.

**승인 체크리스트:**

- [ ] Plan resource list 검토: 6 creates, 0 destroys 확인
- [ ] 생성될 bucket name 확인: `revenue-ops-tfstate-827913617635`
- [ ] 생성될 table name 확인: `revenue-ops-tflock`
- [ ] productops resources 영향 없음 확인: `terraform.tfstate` serial=12 유지
- [ ] plan 파일(`revenue-ops-bootstrap.tfplan`)이 commit되지 않음 확인

**승인 문구 예:**

```text
"Approved to run terraform apply for revenue-ops bootstrap backend only (revenue-ops-tfstate-827913617635 + revenue-ops-tflock)."
```

---

## 6. Apply 후 실행 순서 (승인 이후에만)

### 6-1. Apply

```bash
cd infra/terraform/bootstrap

# plan file을 사용하고, state를 revenue-ops 전용 파일에 기록
terraform apply \
  -state-out=revenue-ops-bootstrap.tfstate \
  revenue-ops-bootstrap.tfplan
```

> `-state-out` flag도 deprecated 경고가 뜰 수 있으나 1.15.x에서는 동작한다.
> productops `terraform.tfstate`는 건드리지 않는다.

### 6-2. Output 확인

```bash
# 신규 state에서 output 확인
terraform output -state=revenue-ops-bootstrap.tfstate backend_config_snippet
```

### 6-3. backend.tf 업데이트

```hcl
# infra/terraform/envs/revenue-dev/backend.tf
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

### 6-4. Revenue-dev terraform init

```bash
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
```

### 6-5. 아직 실행하지 않는 것

- `terraform apply` (revenue-dev) — 별도 plan review 후 추가 승인 필요

---

## 7. 위험 검토

| 위험 항목 | 평가 | 근거 |
|-----------|------|------|
| productops state 덮어쓰기 | ✅ 없음 | `-state=revenue-ops-bootstrap.tfstate` 사용으로 완전 분리 |
| productops bucket 삭제 | ✅ 없음 | plan: 0 to destroy |
| productops lock table 삭제 | ✅ 없음 | plan: 0 to destroy |
| 새 bucket 실수로 public 노출 | ✅ 없음 | public_access_block 모든 옵션 활성 |
| 비용 | ✅ 무시 가능 | S3 idle storage + DynamoDB PAY_PER_REQUEST (거의 0) |
| plan file commit | ✅ 보호됨 | `.gitignore: tfplan*, *.tfplan` |
| state file commit | ✅ 보호됨 | `.gitignore: *.tfstate` |

---

## 8. 변경된 파일

```
infra/terraform/bootstrap/
  terraform.revenue-ops.tfvars.example   # 신규 (commit 대상)
  revenue-ops-bootstrap.tfplan           # 신규 (gitignored — commit 금지)

docs/
  step2a_backend_bootstrap_plan_kr.md    # 이 문서 (commit 대상)
```

---

## 9. 권장 커밋 명령 (gitignored 파일 제외, docs + example만)

```bash
git add \
  infra/terraform/bootstrap/terraform.revenue-ops.tfvars.example \
  docs/step2a_backend_bootstrap_plan_kr.md

git commit -m "chore: add revenue-ops backend bootstrap plan and tfvars example (STEP 2-A)"
```

---

## 10. 다음 단계

1. **Apply 승인** — 승인 문구 제공 → `terraform apply -state-out=revenue-ops-bootstrap.tfstate revenue-ops-bootstrap.tfplan`
2. **backend.tf 업데이트** — apply output으로 실제 bucket/table name 확인 후 반영
3. **Revenue-dev init/validate/plan** — `scripts/step2_frontend_first_plan_precheck.sh --plan` 또는 수동 init → validate → plan
4. **Plan review** — 6 creates only (artifacts + frontend), no ETL/API/Auth/Aurora
5. **Apply 승인 (revenue-dev)** — 별도 추가 승인 필요
