# STEP 1-D: ETL Pipeline Foundation Activation Gate

## 1. 목적

STEP 1-C의 first-plan scope 주의점(docs/step1c_plan_readiness_first_enabled_subset_kr.md §4)에서 식별된 문제를 해결한다.

**문제:** `infra/terraform/envs/revenue-dev`의 기존 ETL foundation modules 10개(data_lake, glue_catalog, athena, iam, lambda_extractors, glue_jobs, step_functions, eventbridge, observability, secrets)가 unconditional로 포함되어 있어, `enable_artifacts=true, enable_frontend=true`만 켜도 full plan에 ETL 전체가 포함되었다.

**해결:** `enable_pipeline_foundation` flag를 추가해 10개 ETL module을 함께 activation-gate한다. SaaS surface(artifacts, frontend, api, auth, aurora, saas_observability)는 기존 개별 flag로 독립 제어된다.

Hard stops (이 단계에서도 동일하게 적용):

- `terraform apply` 실행 금지
- frontend asset 배포 금지
- AWS 리소스 생성/수정/삭제 금지
- Aurora schema migration 금지
- live external collector schedule 활성화 금지

---

## 2. 변경 요약

### 2-1. 새 변수 — `enable_pipeline_foundation`

```hcl
# infra/terraform/envs/revenue-dev/variables.tf
variable "enable_pipeline_foundation" {
  type    = bool
  default = false
  ...
}
```

- **기본값: `false`** — 이 값이 false이면 ETL pipeline에 속하는 어떤 AWS 리소스도 plan에 포함되지 않는다.
- `enable_schedule`는 pipeline foundation이 활성화된 이후에 EventBridge schedule의 ENABLED/DISABLED 상태를 제어하는 별도 guardrail로 유지된다.

### 2-2. 게이트된 ETL modules (10개)

| Module              | 게이트 전       | 게이트 후                                 |
| ------------------- | ------------ | --------------------------------------- |
| `data_lake`         | 무조건 포함      | `count = var.enable_pipeline_foundation ? 1 : 0` |
| `glue_catalog`      | 무조건 포함      | `count = var.enable_pipeline_foundation ? 1 : 0` |
| `athena`            | 무조건 포함      | `count = var.enable_pipeline_foundation ? 1 : 0` |
| `iam`               | 무조건 포함      | `count = var.enable_pipeline_foundation ? 1 : 0` |
| `lambda_extractors` | 무조건 포함      | `count = var.enable_pipeline_foundation ? 1 : 0` |
| `glue_jobs`         | 무조건 포함      | `count = var.enable_pipeline_foundation ? 1 : 0` |
| `step_functions`    | 무조건 포함      | `count = var.enable_pipeline_foundation ? 1 : 0` |
| `eventbridge`       | 무조건 포함      | `count = var.enable_pipeline_foundation ? 1 : 0` |
| `observability`     | 무조건 포함      | `count = var.enable_pipeline_foundation ? 1 : 0` |
| `secrets`           | 무조건 포함      | `count = var.enable_pipeline_foundation ? 1 : 0` |

ETL 모듈 내부에서 다른 ETL 모듈의 output을 참조하는 부분은 `module.X[0].output` 형태로 업데이트했다 (동일한 gate flag로 묶여 있으므로 `try()` 불필요).

### 2-3. Cross-tier KMS 참조 처리

`artifacts`와 `aurora`는 `module.data_lake.kms_key_arn`을 참조했다. pipeline foundation이 비활성화될 때 `data_lake`가 없으므로:

```hcl
# artifacts와 aurora 모두
kms_key_arn = try(module.data_lake[0].kms_key_arn, "")
```

`use_kms = false`(dev 기본값)일 때 `kms_key_arn`은 어차피 `""` 또는 무시되므로 이 fallback은 안전하다. `use_kms = true`인 경우 KMS 키는 data_lake 모듈이 생성하므로 `enable_pipeline_foundation = true`가 함께 필요하다.

### 2-4. Outputs — null-safe

ETL 모듈에 대응하는 모든 outputs가 null-safe로 업데이트되었다:

```hcl
output "data_lake_bucket_name" {
  value = try(module.data_lake[0].data_lake_bucket_id, null)
}
output "secrets_parameter_names" {
  value = try(module.secrets[0].secrets_parameter_names, [])
}
# ... 등 8개 ETL outputs
```

---

## 3. 이 변경이 production architecture를 약화시키지 않는 이유

ETL pipeline foundation의 모든 module 코드, resource 정의, IAM 정책, Glue job 스크립트, Step Functions 정의는 그대로 보존된다. 변경된 것은 오직:

> `main.tf`의 module block 앞에 `count = var.enable_pipeline_foundation ? 1 : 0` 한 줄이 추가된 것

activation gate는 "이 단계에서 배포하지 않겠다"는 rollout 제어이지, 설계 약화가 아니다. `enable_pipeline_foundation = true`로 변경하면 기존과 동일한 전체 ETL 스택이 plan된다.

---

## 4. First Full Plan scope 변화

### 이전 (STEP 1-C)

`enable_artifacts=true, enable_frontend=true`로 plan해도:

- S3 data lake bucket
- S3 Athena results bucket
- Glue Data Catalog (database + 9 tables)
- Athena workgroup
- IAM roles (Lambda, Glue, Step Functions, EventBridge) + policies
- Lambda functions (weather, holidays, local events) — placeholder
- Glue jobs (5)
- Step Functions state machine
- EventBridge schedule (DISABLED)
- CloudWatch log groups (lambda × 3, glue × 2, step functions)
- SSM Parameters (3)

도 함께 plan에 포함.

### 이후 (STEP 1-D, enable_pipeline_foundation=false)

`enable_artifacts=true, enable_frontend=true`로 plan하면:

- S3 artifact bucket + 4 prefix markers
- S3 frontend bucket + CloudFront OAC + CloudFront distribution + optional Route 53 record

**이상 끝.** ETL foundation 관련 리소스 0개 포함.

---

## 5. Output behavior when pipeline is disabled

| Output                  | `enable_pipeline_foundation=false` 시 값 |
| ----------------------- | ---------------------------------------- |
| `data_lake_bucket_name`    | `null`                                   |
| `athena_results_bucket_name` | `null`                                 |
| `glue_database_name`       | `null`                                   |
| `athena_workgroup_name`    | `null`                                   |
| `step_function_arn`        | `null`                                   |
| `lambda_role_arn`          | `null`                                   |
| `glue_role_arn`            | `null`                                   |
| `schedule_name`            | `null`                                   |
| `secrets_parameter_names`  | `[]`                                     |

SaaS surface outputs(`artifact_bucket_name`, `frontend_cloudfront_domain_name`, etc.)는 각 개별 flag에 따라 정상적으로 동작한다.

---

## 6. Validation 결과

| 검증 항목                                  | 결과         | 비고                                                  |
| ----------------------------------------- | ------------ | ----------------------------------------------------- |
| `terraform fmt -recursive -check`         | ✅ 통과       | 모든 `.tf` 파일 HCL 형식 일치                           |
| `terraform init -backend=false`           | ✅ 통과       | modules 재초기화, provider 재확인 완료                  |
| `terraform validate` (full env)           | ❌ 불가        | `backend.tf`의 S3 bucket/key가 비어있어 validation 블록됨 |
| `terraform validate` (module-level)       | ❌ 불가        | 모듈별 `terraform init` 없이 provider 없음              |

**Full env validate가 블록된 정확한 이유:**

`backend.tf`에 `backend "s3" {}` 블록이 존재하며 내부가 비어있다. `terraform init -backend=false`는 성공하지만 `terraform validate`는 backend 설정의 `bucket`과 `key` required argument가 없다고 거부한다. 이는 sandbox 환경에서 S3 tfstate bucket이 준비되지 않은 상황이며, 코드 오류가 아니다.

**진짜 validate는 다음 조건이 충족될 때 가능하다:**
- tfstate S3 bucket과 DynamoDB lock table이 준비되고
- `-backend-config` 또는 `terraform.tfvars`에 bucket/key/region이 채워지고
- AWS profile이 설정된 후

구조적 정확성 검증은 `terraform fmt -recursive -check` pass와 manual review로 대체한다.

---

## 7. 변경된 파일

```
infra/terraform/envs/revenue-dev/
  variables.tf                                    # enable_pipeline_foundation 변수 추가
  main.tf                                         # 10개 ETL module에 count gate 추가
  outputs.tf                                      # ETL outputs null-safe 처리
  terraform.tfvars.example                        # enable_pipeline_foundation = false 추가
  terraform.step1c.first-subset.tfvars.example    # enable_pipeline_foundation = false 추가, comment 업데이트

docs/
  step1c_plan_readiness_first_enabled_subset_kr.md # §4 blockers 해소 반영
  step1d_gate_pipeline_foundation_kr.md            # 이 문서
```

---

## 8. Remaining blockers before first terraform plan

1. **tfstate S3 backend 준비** — bootstrap module로 S3 bucket + DynamoDB lock table 생성 후 `backend.tf`에 실제 값 채우기
2. **AWS CLI profile 설정** — `aws configure` 또는 environment variable로 credentials 설정
3. **실제 bucket names 확인** — YOURACCOUNTID placeholder를 실제 AWS account ID로 교체한 `.tfvars` 파일 준비 (gitignored)
4. **full `terraform validate` 재실행** — backend가 준비된 후 진행

---

## 9. 권장 커밋 명령

```bash
git add \
  infra/terraform/envs/revenue-dev/variables.tf \
  infra/terraform/envs/revenue-dev/main.tf \
  infra/terraform/envs/revenue-dev/outputs.tf \
  infra/terraform/envs/revenue-dev/terraform.tfvars.example \
  infra/terraform/envs/revenue-dev/terraform.step1c.first-subset.tfvars.example \
  docs/step1d_gate_pipeline_foundation_kr.md

git commit -m "chore: gate ETL pipeline foundation with enable_pipeline_foundation flag (STEP 1-D)"
```

---

## 10. 다음 단계 (STEP 1-E 이후)

- bootstrap backend 준비 → full `terraform validate` → first `terraform plan` (artifacts + frontend only)
- plan 검토 후 apply 승인 시 `terraform apply`
- ETL pipeline 배포 준비 완료 후 `enable_pipeline_foundation = true`로 증분 activate
