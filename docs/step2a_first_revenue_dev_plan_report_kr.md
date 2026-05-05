# STEP 2-A: First Revenue-Dev Terraform Plan Report

## 1. 목적

`infra/terraform/envs/revenue-dev`를 revenue-ops S3 backend에 연결하고 frontend-first subset에 대한 첫 번째 `terraform plan`을 실행한다.

Hard stop:

- `terraform apply` 실행 금지 — 별도 explicit approval 필요
- frontend asset deploy 금지
- AWS resource 생성/수정/삭제 금지 (`terraform plan`은 읽기 전용)

---

## 2. backend.tf 변경

`infra/terraform/envs/revenue-dev/backend.tf`를 실제 backend 값으로 업데이트했다.

**변경 전:**

```hcl
terraform {
  backend "s3" {
    # Configure via -backend-config flags or terraform.tfvars
    # bucket         = "your-tfstate-bucket"
    # key            = "revenue-ops/revenue-dev/terraform.tfstate"
    # region         = "ap-northeast-2"
    # dynamodb_table = "your-tfstate-lock-table"
    # encrypt        = true
  }
}
```

**변경 후:**

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

> **Deprecation warning:** Terraform 1.15.x에서 `dynamodb_table` 파라미터가 deprecated 되었으며 `use_lockfile` 사용을 권장한다. 현재 버전에서는 정상 동작하며, `dynamodb_table` 방식을 유지하기로 결정되었다.

---

## 3. AWS Identity 및 환경 확인

| 항목 | 값 |
|------|-----|
| Account ID | `827913617635` |
| IAM User | `arn:aws:iam::827913617635:user/de-ai-12` |
| Region | `ap-northeast-2` |
| AWS_PROFILE | not set (default credential chain) |
| Terraform | v1.15.0 |
| AWS CLI | 2.34.38 |

---

## 4. Local tfvars 확인

`terraform.step1c.first-subset.tfvars` (gitignored):

| 변수 | 값 |
|------|-----|
| `enable_pipeline_foundation` | `false` |
| `enable_artifacts` | `true` |
| `enable_frontend` | `true` |
| `enable_api` | `false` |
| `enable_auth` | `false` |
| `enable_aurora` | `false` |
| `enable_saas_observability` | `false` |
| `enable_schedule` | `false` |
| `artifact_bucket_name` | `revenue-ops-artifacts-dev-827913617635` |
| `frontend_bucket_name` | `revenue-ops-frontend-dev-827913617635` |
| Placeholder 잔존 | 없음 ✅ |

---

## 5. Terraform init/validate/plan 결과

### 5-1. terraform init

```
Successfully configured the backend "s3"!
Terraform has been successfully initialized!
```

> Warning: `dynamodb_table` deprecated (use `use_lockfile` instead). 기능 동작에는 영향 없음.

### 5-2. terraform validate

```
Success! The configuration is valid, but there were some validation warnings as shown above.
```

> 동일한 `dynamodb_table` deprecation warning만 표시. 구조적 오류 없음.

### 5-3. terraform plan

```
Plan: 16 to add, 0 to change, 0 to destroy.
```

Plan 파일 저장: `infra/terraform/envs/revenue-dev/tfplan.step2.frontend-first` (gitignored)

---

## 6. Plan 리소스 목록

### module.artifacts (9 resources)

| 리소스 | 생성 값 |
|--------|---------|
| `aws_s3_bucket.artifacts[0]` | `revenue-ops-artifacts-dev-827913617635`, `force_destroy=false` |
| `aws_s3_bucket_versioning.artifacts[0]` | Enabled |
| `aws_s3_bucket_server_side_encryption_configuration.artifacts[0]` | AES256 |
| `aws_s3_bucket_public_access_block.artifacts[0]` | 모든 block true |
| `aws_s3_bucket_lifecycle_configuration.artifacts[0]` | `api-packages/` 90일 만료 |
| `aws_s3_object.prefix_markers["exports/"]` | prefix marker |
| `aws_s3_object.prefix_markers["api-packages/"]` | prefix marker |
| `aws_s3_object.prefix_markers["frontend-builds/"]` | prefix marker |
| `aws_s3_object.prefix_markers["pipeline-artifacts/"]` | prefix marker |

### module.frontend_hosting (7 creates + 1 data read)

| 리소스 | 생성 값 |
|--------|---------|
| `aws_s3_bucket.frontend[0]` | `revenue-ops-frontend-dev-827913617635`, `force_destroy=false` |
| `aws_s3_bucket_versioning.frontend[0]` | Enabled |
| `aws_s3_bucket_server_side_encryption_configuration.frontend[0]` | AES256 |
| `aws_s3_bucket_public_access_block.frontend[0]` | 모든 block true |
| `aws_s3_bucket_policy.frontend[0]` | CloudFront OAC read-only 정책 |
| `aws_cloudfront_origin_access_control.frontend[0]` | `revenue-ops-revenue-dev-frontend-oac`, sigv4 |
| `aws_cloudfront_distribution.frontend[0]` | `PriceClass_100`, HTTPS redirect, OAC 연동, SPA fallback (403/404→200) |
| `data.aws_iam_policy_document.frontend_bucket_policy[0]` | (read, apply 시 확인) |

---

## 7. 예상치 못한 리소스 확인

아래 resource family는 plan에 나타나지 않았다:

| 체크 항목 | 결과 |
|-----------|------|
| `aws_api_gateway_*` / Lambda Revenue Ops API | ✅ 없음 |
| `aws_cognito_*` | ✅ 없음 |
| `aws_rds_cluster*` / Secrets Manager DB credential | ✅ 없음 |
| `aws_glue_*` | ✅ 없음 |
| `aws_athena_*` | ✅ 없음 |
| `aws_sfn_state_machine` | ✅ 없음 |
| `aws_scheduler_schedule` | ✅ 없음 |
| `aws_lambda_function` (extractor) | ✅ 없음 |
| `aws_ssm_parameter` (external API key) | ✅ 없음 |
| `aws_cloudwatch_metric_alarm` (SaaS obs) | ✅ 없음 |
| Route 53 / ACM (DNS disabled) | ✅ 없음 |

`enable_pipeline_foundation = false` gate가 정상적으로 동작하고 있다.

---

## 8. 보안 및 비용 항목 확인

| 항목 | 값 | 평가 |
|------|-----|------|
| CloudFront price class | `PriceClass_100` | ✅ 비용 효율적 |
| HTTPS 강제 | `redirect-to-https` | ✅ |
| CloudFront viewer protocol | `redirect-to-https` | ✅ |
| S3 public access block | 모든 옵션 true | ✅ |
| S3 암호화 | AES256 | ✅ |
| S3 `force_destroy` | `false` | ✅ 실수 방지 |
| Frontend origin 접근 | OAC (Origin Access Control) + sigv4 | ✅ 비공개 S3 |
| SPA 404 fallback | 403/404 → `index.html` (200) | ✅ Revenue Cockpit SPA 지원 |
| Route 53 / ACM | disabled (`create_frontend_dns_records = false`) | ✅ |
| ETL 리소스 | 0개 | ✅ pipeline gate 정상 |
| `secrets_parameter_names` output | `[]` | ✅ pipeline disabled |

---

## 9. Terraform Outputs (apply 후 확인 필요)

| Output | apply 후 예상 값 |
|--------|-----------------|
| `artifact_bucket_name` | `revenue-ops-artifacts-dev-827913617635` |
| `frontend_bucket_name` | `revenue-ops-frontend-dev-827913617635` |
| `frontend_cloudfront_domain_name` | `<hash>.cloudfront.net` |
| `secrets_parameter_names` | `[]` |

---

## 10. Apply Approval Gate

plan review 결과 이상 없음. apply를 실행하려면 아래 명시적 승인 문구가 필요하다:

```text
"Approved to run terraform apply for STEP 2 frontend-first artifacts + frontend subset only."
```

Apply 전 최종 체크:

- [x] Plan: 16 to add, 0 to change, 0 to destroy
- [x] ETL / API / Auth / Aurora 리소스 없음
- [x] CloudFront PriceClass_100
- [x] S3 public access block 전체 활성
- [x] OAC 기반 비공개 S3 origin
- [x] SPA fallback 정상
- [x] `force_destroy = false` (실수 방지)
- [x] backend: `revenue-ops-tfstate-827913617635` / `revenue-ops-tflock`

---

## 11. 변경된 파일

```
infra/terraform/envs/revenue-dev/
  backend.tf                                 # backend 실제 값으로 업데이트 (commit 대상)
  tfplan.step2.frontend-first               # (gitignored — commit 금지)

docs/
  step2a_first_revenue_dev_plan_report_kr.md # 이 문서 (commit 대상)
```

---

## 12. 권장 커밋 명령

```bash
git add \
  infra/terraform/envs/revenue-dev/backend.tf \
  docs/step2a_first_revenue_dev_plan_report_kr.md

git commit -m "chore: connect revenue-dev to revenue-ops backend and record first plan"
```
