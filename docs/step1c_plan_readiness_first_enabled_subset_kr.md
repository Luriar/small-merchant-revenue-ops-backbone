# STEP 1-C Plan Readiness and First Enabled Subset

## 1. 목적

STEP 1-C의 목적은 small-merchant Revenue Ops SaaS의 첫 번째 안전한 Terraform plan을 준비하는 것이다.

Hard stop:

- `terraform apply` 실행 금지
- frontend asset 배포 금지
- AWS 리소스 생성/수정/삭제 금지
- API/Auth/Aurora/ETL schedule 활성화 금지

## 2. 현재 상태

현재 기준:

- Latest commit: `615bb99 chore: add STEP 1-B production-min AWS foundation skeleton`
- Working tree: STEP 1-C 시작 시 clean
- M5 local/static/export-backed MVP 완료
- M6 production transition baseline 완료
- STEP 1-A preflight 완료
- STEP 1-B production-min AWS Terraform skeleton 완료
- AWS resource는 아직 생성하지 않음
- `terraform apply`는 아직 실행하지 않음

## 3. First Enabled Subset

권장 첫 enabled subset:

```hcl
enable_artifacts          = true
enable_frontend           = true
enable_api                = false
enable_auth               = false
enable_aurora             = false
enable_saas_observability = false
enable_schedule           = false
```

목표:

- S3 artifact bucket과 S3 + CloudFront frontend hosting foundation을 먼저 검증한다.
- API Gateway/Lambda, Cognito, Aurora는 패키징/도메인/auth/network/schema boundary가 확정될 때까지 끈다.
- M5 fallback behavior를 유지한다.
- ETL schedule은 계속 끈다.

## 4. 중요한 Plan Scope 주의점

현재 `infra/terraform/envs/revenue-dev`는 기존 ETL foundation modules를 unconditional로 포함한다.

따라서 정상적인 full `terraform plan`은 아래도 함께 계획할 수 있다.

- S3 data lake
- Athena results bucket
- Glue Catalog/Jobs
- Athena workgroup
- IAM roles/policies
- Lambda extractor placeholders
- Step Functions
- EventBridge schedule resource with `DISABLED` state
- CloudWatch ETL logs/alarms
- SSM parameters

즉, `enable_artifacts=true`와 `enable_frontend=true`만 켜도, 현재 코드 구조상 full plan은 "frontend/artifacts only"가 아닐 수 있다. 진짜 최소 blast radius plan을 원하면 다음 중 하나가 필요하다.

1. 기존 ETL foundation도 이번 plan에 포함되는 것을 명시적으로 승인한다.
2. 별도 frontend-first environment를 만든다.
3. 기존 ETL foundation에 `enable_pipeline`류의 gating을 추가하는 별도 Terraform refactor를 먼저 수행한다.
4. `terraform plan -target=module.artifacts -target=module.frontend_hosting`을 사용한다. 단, target plan은 의존성/전체 일관성 검증이 약하므로 최종 apply 전 full plan 검토가 필요하다.

STEP 1-C 판단: backend/tfvars/profile이 아직 명시되지 않았고 bootstrap backend도 small-merchant용으로 확인되지 않았으므로 지금 plan은 실행하지 않는다.

## 5. Expected Resources In First Plan

첫 subset만 기준으로 기대하는 신규 SaaS resources:

### revenue_artifacts

- S3 artifact bucket
- S3 versioning
- SSE configuration
- public access block
- lifecycle rule for old API packages
- prefix marker objects: `exports/`, `api-packages/`, `frontend-builds/`, `pipeline-artifacts/`

### revenue_frontend_hosting

- private S3 frontend bucket
- S3 versioning
- SSE configuration
- public access block
- CloudFront OAC
- CloudFront distribution
- S3 bucket policy allowing CloudFront read
- optional Route 53 aliases only if domain inputs are explicitly configured

## 6. Intentionally Disabled Resources

Disabled in first subset:

- API Gateway + Lambda Revenue Ops API
- Cognito user pool/client/domain
- Aurora Serverless v2 cluster and Secrets Manager DB credentials
- SaaS runtime CloudWatch alarms
- EventBridge live schedule enablement
- frontend asset upload/deployment
- Aurora schema migration
- live external collector runs

## 7. Required Backend Values

`infra/terraform/envs/revenue-dev/backend.tf` currently has an empty S3 backend block. Required values:

```text
bucket         = <small-merchant tfstate bucket>
key            = revenue-ops/revenue-dev/terraform.tfstate
region         = ap-northeast-2
dynamodb_table = <small-merchant tfstate lock table>
encrypt        = true
```

Do not use the old local bootstrap state blindly. The local `infra/terraform/bootstrap/terraform.tfstate` appears to reference `productops-*` backend names, so it is not a confirmed small-merchant backend source of truth.

## 8. Bootstrap Readiness

Current observation:

- Bootstrap Terraform code exists under `infra/terraform/bootstrap`.
- Local bootstrap state file exists but is not tracked and appears to contain old `productops-*` outputs.
- No verified small-merchant backend bucket/table values are committed.

Readiness judgment:

- If a small-merchant tfstate bucket and lock table already exist, record their names explicitly and use backend-config flags.
- If not, bootstrap needs a separate reviewed `terraform plan` and later an explicitly approved `terraform apply`.
- STEP 1-C does not run bootstrap apply.

## 9. Required tfvars/Profile Values

Required for first plan:

- AWS profile or environment credentials
- AWS account ID
- `data_lake_bucket_name`
- `athena_results_bucket_name`
- `artifact_bucket_name`
- `frontend_bucket_name`
- `glue_database_name`
- `use_kms`
- tags including real `Contact`

Optional for first plan:

- `frontend_domain_aliases`
- `frontend_hosted_zone_id`
- `frontend_acm_certificate_arn`
- `create_frontend_dns_records`

Keep null/empty for first no-domain plan:

- API package/domain variables
- Cognito URLs/domain variables
- Aurora VPC/subnet/security group variables
- alarm actions

## 10. Safe tfvars Draft

Created:

```text
infra/terraform/envs/revenue-dev/terraform.step1c.first-subset.tfvars.example
```

This is a template only. It contains no secrets and uses account-specific placeholders such as `YOURACCOUNTID`. Copy it to an ignored local file before use:

```bash
cd infra/terraform/envs/revenue-dev
cp terraform.step1c.first-subset.tfvars.example terraform.step1c.first-subset.tfvars
```

Then replace placeholders locally. Do not commit the copied `.tfvars`.

## 11. Cost Estimate/Risk

Low-to-moderate initial cost if only artifacts/frontend are enabled:

- S3 buckets: low idle cost
- CloudFront distribution: low idle cost, traffic-dependent
- Route 53 records: low if existing hosted zone is used; hosted zone itself has monthly cost if new
- No API Gateway/Lambda request cost because API disabled
- No Aurora cost because Aurora disabled
- No Cognito cost because auth disabled
- No live ETL execution cost because schedule disabled

Risk caveat:

- Full `revenue-dev` plan may include ETL foundation resources unless already applied or separately gated.
- Glue/Step Functions/Lambda extractor resources have mostly low idle cost, but they increase resource blast radius and IAM surface.

## 12. Security Guardrails

Frontend/artifact guardrails:

- S3 public access block
- SSE enabled
- CloudFront OAC for frontend private origin
- HTTPS redirect at CloudFront
- no frontend asset deploy in STEP 1-C

Operational guardrails:

- no secrets in tfvars templates
- API/Auth/Aurora disabled
- schedule disabled
- no AWS mutation commands
- plan only after backend/profile/tfvars are explicit

## 13. Exact First Plan Command Sequence

Only run after backend values, AWS profile, and local tfvars are explicit.

```bash
cd infra/terraform/envs/revenue-dev

cp terraform.step1c.first-subset.tfvars.example terraform.step1c.first-subset.tfvars
# edit terraform.step1c.first-subset.tfvars locally

terraform init \
  -backend-config="bucket=<small-merchant-tfstate-bucket>" \
  -backend-config="key=revenue-ops/revenue-dev/terraform.tfstate" \
  -backend-config="region=ap-northeast-2" \
  -backend-config="dynamodb_table=<small-merchant-tflock-table>" \
  -backend-config="encrypt=true"

terraform validate

terraform plan \
  -var-file="terraform.step1c.first-subset.tfvars" \
  -out="tfplan.step1c"

terraform show -no-color tfplan.step1c > /tmp/tfplan.step1c.txt
```

Hard stop:

```text
Do not run terraform apply.
Do not deploy frontend assets.
Do not mutate AWS resources.
```

## 14. Optional Targeted Plan Variant

If the team wants to inspect only the new first subset resources before a full plan:

```bash
terraform plan \
  -var-file="terraform.step1c.first-subset.tfvars" \
  -target=module.artifacts \
  -target=module.frontend_hosting \
  -out="tfplan.step1c.targeted"
```

Warning: targeted plans are for inspection only. Before apply, review a full plan with the same tfvars.

## 15. STEP 1-C Readiness Judgment

Plan can not be run safely now.

Missing:

- explicit small-merchant backend bucket/table values
- explicit AWS profile/account confirmation
- local tfvars with account-specific bucket names
- decision on whether first full plan may include ETL foundation resources
- optional decision on domain/Route 53/ACM for frontend

Recommended next action:

1. Confirm or create small-merchant Terraform backend in a separate reviewed bootstrap step.
2. Fill local `terraform.step1c.first-subset.tfvars`.
3. Decide full plan vs targeted inspection plan.
4. Run init/validate/plan only after values are explicit.
5. Stop before apply.

## 16. Local Validation Results

Commands run:

```bash
terraform fmt -recursive -check infra/terraform
```

Result: passed.

```bash
terraform -chdir=infra/terraform/bootstrap validate
terraform -chdir=infra/terraform/modules/revenue_artifacts validate
terraform -chdir=infra/terraform/modules/revenue_frontend_hosting validate
terraform -chdir=infra/terraform/modules/revenue_api_gateway_lambda validate
terraform -chdir=infra/terraform/modules/revenue_cognito validate
terraform -chdir=infra/terraform/modules/revenue_aurora validate
terraform -chdir=infra/terraform/modules/revenue_saas_observability validate
```

Result: passed. `revenue_api_gateway_lambda` validates after correcting the AWS region data source attribute usage. Terraform still reports a provider deprecation warning around `data.aws_region.current.name`; keep this as a follow-up compatibility check before enabling the API module.

```bash
terraform -chdir=infra/terraform/envs/revenue-dev init -backend=false -input=false
terraform -chdir=infra/terraform/envs/revenue-dev validate
```

Result: init passed with backend disabled, but env validate is blocked because `backend.tf` intentionally leaves S3 backend arguments empty. Terraform requires explicit `bucket` and `key` backend values before validating this root module.

Terraform plan was skipped. Backend values, AWS profile/account, and local tfvars are not yet explicit and safe.
