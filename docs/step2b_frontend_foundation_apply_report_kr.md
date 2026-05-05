# STEP 2-B: Frontend Foundation Apply Report

## 1. 목적

STEP 2-B의 목적은 이미 검토된 frontend-first Terraform plan을 apply해서 small-merchant Revenue Ops SaaS의 artifacts + frontend foundation을 생성하고, 생성 결과를 검증하는 것이다.

승인 범위:

- artifacts S3 bucket
- frontend S3 bucket
- CloudFront OAC
- CloudFront distribution
- frontend bucket policy

Hard stop:

- frontend asset deploy 금지
- API/Auth/Aurora/Pipeline 활성화 금지
- live collector 실행 금지
- POS ingestion 금지
- local tfvars/tfstate/tfplan commit 금지
- Product Ops/productops resource 수정 금지

## 2. Pre-Apply 확인

Git 상태:

- 작업 시작 시 working tree clean
- latest commit: `d97f3b5 chore: connect revenue-dev to revenue-ops backend and record first plan`

STEP 2-A plan report:

- `docs/step2a_first_revenue_dev_plan_report_kr.md` 존재 확인
- plan summary: `16 to add, 0 to change, 0 to destroy`
- API/Auth/Aurora/ETL resource 없음

Local tfvars flag 확인:

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

Safe checks:

```bash
terraform fmt -recursive -check infra/terraform
terraform -chdir=infra/terraform/envs/revenue-dev validate
```

결과:

- fmt passed
- validate passed
- known warning: backend `dynamodb_table` parameter deprecated; current backend still works

## 3. Apply 전 재실행 Plan

Command:

```bash
terraform -chdir=infra/terraform/envs/revenue-dev plan \
  -var-file=terraform.step1c.first-subset.tfvars \
  -out=tfplan.step2b.frontend-first
```

결과:

```text
Plan: 16 to add, 0 to change, 0 to destroy.
```

Resource type summary:

```text
1 aws_cloudfront_distribution
1 aws_cloudfront_origin_access_control
2 aws_s3_bucket
1 aws_s3_bucket_lifecycle_configuration
1 aws_s3_bucket_policy
2 aws_s3_bucket_public_access_block
2 aws_s3_bucket_server_side_encryption_configuration
2 aws_s3_bucket_versioning
4 aws_s3_object
```

API/Auth/Aurora/ETL resource family는 plan에 없었다.

## 4. Apply Command 및 결과

Command:

```bash
terraform -chdir=infra/terraform/envs/revenue-dev apply tfplan.step2b.frontend-first
```

결과: **partial apply 후 실패**

실패 원인:

```text
AccessDenied: User arn:aws:iam::827913617635:user/de-ai-12 is not authorized
to perform cloudfront:CreateOriginAccessControl on resource
arn:aws:cloudfront::827913617635:origin-access-control/*
```

즉, S3 artifacts/frontend bucket foundation 일부는 생성되었지만 CloudFront OAC 생성 권한이 없어 CloudFront/OAC/bucket policy 단계에서 중단되었다.

## 5. 실제 생성된 Terraform State Resource

생성 완료:

```text
module.artifacts.aws_s3_bucket.artifacts[0]
module.artifacts.aws_s3_bucket_lifecycle_configuration.artifacts[0]
module.artifacts.aws_s3_bucket_public_access_block.artifacts[0]
module.artifacts.aws_s3_bucket_server_side_encryption_configuration.artifacts[0]
module.artifacts.aws_s3_bucket_versioning.artifacts[0]
module.artifacts.aws_s3_object.prefix_markers["api-packages/"]
module.artifacts.aws_s3_object.prefix_markers["exports/"]
module.artifacts.aws_s3_object.prefix_markers["frontend-builds/"]
module.artifacts.aws_s3_object.prefix_markers["pipeline-artifacts/"]
module.frontend_hosting.aws_s3_bucket.frontend[0]
module.frontend_hosting.aws_s3_bucket_public_access_block.frontend[0]
module.frontend_hosting.aws_s3_bucket_server_side_encryption_configuration.frontend[0]
module.frontend_hosting.aws_s3_bucket_versioning.frontend[0]
```

생성되지 않음:

```text
module.frontend_hosting.aws_cloudfront_origin_access_control.frontend[0]
module.frontend_hosting.aws_cloudfront_distribution.frontend[0]
module.frontend_hosting.aws_s3_bucket_policy.frontend[0]
```

Terraform outputs:

```json
{
  "artifact_bucket_name": "revenue-ops-artifacts-dev-827913617635",
  "frontend_bucket_name": "revenue-ops-frontend-dev-827913617635",
  "secrets_parameter_names": []
}
```

`frontend_cloudfront_domain_name` output은 CloudFront distribution이 생성되지 않아 아직 없다.

## 6. S3 Verification Results

Artifact bucket:

- bucket: `revenue-ops-artifacts-dev-827913617635`
- region: `ap-northeast-2`
- public access block: all true
- server-side encryption: AES256
- versioning: Enabled
- lifecycle: `api-packages/` 90일 expiration
- prefix markers:
  - `api-packages/`
  - `exports/`
  - `frontend-builds/`
  - `pipeline-artifacts/`

Frontend bucket:

- bucket: `revenue-ops-frontend-dev-827913617635`
- region: `ap-northeast-2`
- public access block: all true
- server-side encryption: AES256
- versioning: Enabled
- bucket policy: not created
- object list: empty, frontend assets not uploaded

## 7. CloudFront Verification Results

CloudFront OAC:

- apply failed at `cloudfront:CreateOriginAccessControl`
- Terraform state has no OAC resource
- AWS `ListOriginAccessControls` verification was blocked by missing read permission: `cloudfront:ListOriginAccessControls`

CloudFront distribution:

- not created because OAC creation failed first
- Terraform state has no distribution resource
- AWS `ListDistributions` verification was blocked by missing read permission: `cloudfront:ListDistributions`

Frontend bucket policy:

- not created because it depends on the CloudFront distribution ARN
- AWS S3 returned `NoSuchBucketPolicy`

## 8. Unexpected Resource Check

Terraform state check found no matches for:

- API Gateway / API Gateway v2
- Lambda Revenue Ops API
- Cognito
- Aurora/RDS
- Glue
- Athena
- Step Functions
- EventBridge Scheduler
- CloudWatch SaaS alarms
- SSM external API parameters
- ETL pipeline modules

Productops backend verification:

- `productops-tfstate-b68d831a` still exists
- `productops-tflock` table status: `ACTIVE`
- STEP 2-B did not target or modify productops backend resources

Revenue-ops backend verification:

- `revenue-ops-tfstate-827913617635` exists
- `revenue-ops-tflock` table status: `ACTIVE`

## 9. Cost/Security Notes

Created cost surface:

- two S3 buckets with low idle storage cost
- four zero-byte artifact prefix marker objects
- no CloudFront distribution yet
- no API Gateway/Lambda/Cognito/Aurora/ETL runtime cost

Security posture:

- both buckets block public ACLs and public policies
- both buckets use AES256 server-side encryption
- both buckets have versioning enabled
- frontend bucket has no public policy
- frontend bucket is empty

Current gap:

- frontend cannot be served because CloudFront OAC/distribution were not created
- IAM user needs CloudFront create/read permissions for the approved frontend foundation

## 10. Intentionally Not Done

Not performed:

- frontend asset deploy/upload
- API/Auth/Aurora enablement
- pipeline foundation enablement
- EventBridge schedule enablement
- live collector execution
- POS ingestion
- Aurora migration
- destroy/delete/rollback command
- Product Ops/productops resource modification

## 11. Next Step

STEP 2-B is not fully complete because CloudFront creation failed on IAM permission.

Recommended next step before STEP 2-C:

1. Add narrowly scoped CloudFront permissions for the Terraform IAM user/role:
   - `cloudfront:CreateOriginAccessControl`
   - `cloudfront:GetOriginAccessControl`
   - `cloudfront:ListOriginAccessControls`
   - `cloudfront:CreateDistribution`
   - `cloudfront:GetDistribution`
   - `cloudfront:ListDistributions`
   - `cloudfront:TagResource`
2. Re-run `terraform plan` with the same local tfvars.
3. Confirm the remaining plan only includes:
   - CloudFront OAC
   - CloudFront distribution
   - frontend bucket policy
4. Apply only after reviewing that remaining plan.

Only after CloudFront foundation is complete should STEP 2-C proceed:

- frontend asset deploy
- CloudFront smoke test
- `/#revenue-cockpit` route check
- `/#revenue-cockpit?data=api` fallback check

## 12. Continuation Apply After CloudFront IAM Fix

추가 승인 후 `de-ai-12`에 narrow inline IAM policy가 추가되었다.

Policy:

```text
RevenueOpsFrontendCloudFrontFoundationAccess
```

처음 추가된 CloudFront actions:

```text
cloudfront:CreateOriginAccessControl
cloudfront:GetOriginAccessControl
cloudfront:ListOriginAccessControls
cloudfront:CreateDistribution
cloudfront:GetDistribution
cloudfront:ListDistributions
cloudfront:TagResource
```

Remaining plan:

```bash
terraform -chdir=infra/terraform/envs/revenue-dev plan \
  -var-file=terraform.step1c.first-subset.tfvars \
  -out=tfplan.step2b.remaining-cloudfront
```

Plan result:

```text
Plan: 3 to add, 0 to change, 0 to destroy.
```

Plan에 포함된 resource:

```text
module.frontend_hosting.aws_cloudfront_distribution.frontend[0]
module.frontend_hosting.aws_cloudfront_origin_access_control.frontend[0]
module.frontend_hosting.aws_s3_bucket_policy.frontend[0]
```

API/Auth/Aurora/ETL resource는 없었다.

Apply command:

```bash
terraform -chdir=infra/terraform/envs/revenue-dev apply tfplan.step2b.remaining-cloudfront
```

Result: **second partial apply 후 실패**

새 실패 원인:

```text
AccessDenied: User arn:aws:iam::827913617635:user/de-ai-12 is not authorized
to perform cloudfront:ListTagsForResource on resource
arn:aws:cloudfront::827913617635:distribution/E31KH7PFML1A6N
```

Terraform AWS provider가 CloudFront distribution create 이후 tag를 읽으면서 `cloudfront:ListTagsForResource`가 추가로 필요하다는 점이 확인되었다.

## 13. Continuation Verification Results

새로 생성됨:

- CloudFront OAC
  - id: `E1QCCCHHP0LCLE`
  - name: `revenue-ops-revenue-dev-frontend-oac`
  - signing protocol: `sigv4`
  - signing behavior: `always`
- CloudFront distribution
  - id: `E31KH7PFML1A6N`
  - domain: `d1fquuc7vsf9cu.cloudfront.net`
  - status: `Deployed`
  - origin: `revenue-ops-frontend-dev-827913617635.s3.ap-northeast-2.amazonaws.com`
  - OAC id: `E1QCCCHHP0LCLE`
  - viewer protocol policy: `redirect-to-https`
  - price class: `PriceClass_100`
  - SPA fallback: 403/404 -> `/index.html`

아직 생성되지 않음:

- frontend bucket policy
  - AWS S3 result: `NoSuchBucketPolicy`

Frontend bucket 상태:

- public access block: all true
- server-side encryption: AES256
- versioning: Enabled
- object list: empty
- frontend asset upload/deploy: not performed

Unexpected resource check:

- API Gateway: none
- Lambda Revenue Ops API: none
- Cognito: none
- Aurora/RDS: none
- Glue/Athena/Step Functions/EventBridge: none
- SSM external API parameters: none
- SaaS CloudWatch alarms: none

Productops backend resources:

- `productops-tfstate-b68d831a` still exists
- `productops-tflock` status: `ACTIVE`
- not targeted or modified by this continuation apply

## 14. Current STEP 2-B Status

STEP 2-B is still not fully complete.

Completed:

- artifacts S3 foundation
- frontend S3 foundation
- CloudFront OAC
- CloudFront distribution

Remaining:

- frontend bucket policy
- Terraform output refresh for `frontend_cloudfront_domain_name`

Current IAM blocker:

```text
cloudfront:ListTagsForResource
```

Recommended next minimal IAM patch:

```json
{
  "Effect": "Allow",
  "Action": "cloudfront:ListTagsForResource",
  "Resource": "arn:aws:cloudfront::827913617635:distribution/E31KH7PFML1A6N"
}
```

Do not add this permission or re-apply without explicit approval.

After approval, re-run plan. Expected remaining plan should include only:

- `module.frontend_hosting.aws_s3_bucket_policy.frontend[0]`
- possible output refresh for `frontend_cloudfront_domain_name`

If any API/Auth/Aurora/ETL resource appears, stop.

## 15. ListTags Permission Fix and Tainted Distribution Blocker

추가 승인 후 `cloudfront:ListTagsForResource` 권한을 distribution `E31KH7PFML1A6N`에 한정해 추가했다.

Added IAM statement:

```json
{
  "Sid": "RevenueOpsFrontendCloudFrontReadTags",
  "Effect": "Allow",
  "Action": "cloudfront:ListTagsForResource",
  "Resource": "arn:aws:cloudfront::827913617635:distribution/E31KH7PFML1A6N"
}
```

IAM simulation result:

```text
cloudfront:ListTagsForResource -> allowed
```

Safe checks:

```bash
terraform fmt -recursive -check infra/terraform
terraform -chdir=infra/terraform/envs/revenue-dev validate
```

Result:

- fmt passed
- validate passed
- known `dynamodb_table` deprecation warning only

Re-run plan:

```bash
terraform -chdir=infra/terraform/envs/revenue-dev plan \
  -var-file=terraform.step1c.first-subset.tfvars \
  -out=tfplan.step2b.bucket-policy-only
```

Plan result:

```text
Plan: 2 to add, 0 to change, 1 to destroy.
```

Stop reason:

- 승인 범위는 frontend bucket policy only였다.
- 그러나 Terraform state에서 CloudFront distribution이 tainted 상태라 plan이 distribution replacement를 포함했다.
- destroy가 포함되었으므로 apply하지 않았다.

Tainted resource:

```text
module.frontend_hosting.aws_cloudfront_distribution.frontend[0]: (tainted)
id: E31KH7PFML1A6N
domain: d1fquuc7vsf9cu.cloudfront.net
status: Deployed
```

현재 상태:

- CloudFront OAC exists
- CloudFront distribution exists and is Deployed
- frontend bucket policy still missing
- frontend bucket remains empty
- no frontend asset deploy
- no API/Auth/Aurora/ETL resources created

Recommended next step:

1. Explicitly approve Terraform state untaint for the existing distribution.
2. Re-run plan.
3. Proceed only if plan is `1 to add, 0 to change, 0 to destroy` for `module.frontend_hosting.aws_s3_bucket_policy.frontend[0]`.

Required approval:

```text
Approved to untaint module.frontend_hosting.aws_cloudfront_distribution.frontend[0], rerun the STEP 2-B plan, and apply only if the plan creates the frontend bucket policy with 0 destroy.
```
