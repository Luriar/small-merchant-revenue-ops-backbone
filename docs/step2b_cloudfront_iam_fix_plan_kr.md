# STEP 2-B CloudFront IAM Fix Plan

## 1. 목적

STEP 2-B partial apply는 S3 artifacts/frontend bucket foundation까지 생성한 뒤 CloudFront OAC 생성 권한 부족으로 중단되었다.

이 문서의 목적은 small-merchant Revenue Ops SaaS frontend foundation에 필요한 최소 CloudFront IAM 권한만 제안하고, 명시적 승인 전에는 IAM mutation을 수행하지 않는 것이다.

Hard stop:

- frontend asset deploy 금지
- API/Auth/Aurora/Pipeline 활성화 금지
- live collector 실행 금지
- POS ingestion 금지
- Product Ops/productops resource 수정 금지
- local tfvars/tfstate/tfplan commit 금지
- 명시적 승인 전 IAM policy 생성/수정 금지

## 2. 현재 Apply 실패 원인

실패 지점:

```text
module.frontend_hosting.aws_cloudfront_origin_access_control.frontend[0]
```

AWS error:

```text
AccessDenied: User arn:aws:iam::827913617635:user/de-ai-12 is not authorized
to perform cloudfront:CreateOriginAccessControl on resource
arn:aws:cloudfront::827913617635:origin-access-control/*
```

생성 완료된 범위:

- artifact S3 bucket
- artifact bucket public access block, AES256 encryption, versioning
- artifact lifecycle rule
- artifact prefix marker objects
- frontend S3 bucket
- frontend bucket public access block, AES256 encryption, versioning

미생성 범위:

- CloudFront OAC
- CloudFront distribution
- frontend bucket policy

## 3. IAM Before Summary

Inspection commands:

```bash
aws iam get-user --user-name de-ai-12
aws iam list-attached-user-policies --user-name de-ai-12
aws iam list-user-policies --user-name de-ai-12
aws iam list-groups-for-user --user-name de-ai-12
aws iam get-user-policy --user-name de-ai-12 --policy-name TerraformDynamoDBLockTableAccess
aws iam list-attached-group-policies --group-name DE-AI-Project-Group
aws iam get-policy --policy-arn arn:aws:iam::827913617635:policy/DE-AI-Resource-Isolation-Policy
aws iam get-policy-version --policy-arn arn:aws:iam::827913617635:policy/DE-AI-Resource-Isolation-Policy --version-id v56
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::827913617635:user/de-ai-12 \
  --action-names \
    cloudfront:CreateOriginAccessControl \
    cloudfront:GetOriginAccessControl \
    cloudfront:ListOriginAccessControls \
    cloudfront:CreateDistribution \
    cloudfront:GetDistribution \
    cloudfront:ListDistributions \
    cloudfront:TagResource \
  --resource-arns '*'
```

Observed user:

```text
UserName: de-ai-12
Arn: arn:aws:iam::827913617635:user/de-ai-12
UserId: AIDA4BQ37IDR2FCDXQEUS
```

User policies:

- attached user policies: none
- inline user policies:
  - `TerraformDynamoDBLockTableAccess`

Inline user policy purpose:

- allows DynamoDB lock table access for:
  - `productops-tflock`
  - `revenue-ops-tflock`

Group membership:

- `DE-AI-Project-Group`

Group attached managed policy:

- `arn:aws:iam::827913617635:policy/DE-AI-Resource-Isolation-Policy`
- default version: `v56`

Current CloudFront permission result:

| Action | Decision |
| --- | --- |
| `cloudfront:CreateOriginAccessControl` | `implicitDeny` |
| `cloudfront:GetOriginAccessControl` | `implicitDeny` |
| `cloudfront:ListOriginAccessControls` | `implicitDeny` |
| `cloudfront:CreateDistribution` | `implicitDeny` |
| `cloudfront:GetDistribution` | `implicitDeny` |
| `cloudfront:ListDistributions` | `implicitDeny` |
| `cloudfront:TagResource` | `implicitDeny` |

Conclusion: `de-ai-12` currently has no CloudFront permissions needed to complete the approved frontend foundation.

## 4. Recommended Minimal IAM Patch

Recommendation: create a new narrow inline user policy on `de-ai-12`.

Do not edit the shared `DE-AI-Resource-Isolation-Policy` unless there is a separate reason. That managed policy is attached through a group and already has five versions, so editing it may require deleting an old policy version and broadens the blast radius for every group member.

Policy name:

```text
RevenueOpsFrontendCloudFrontFoundationAccess
```

Policy document:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "RevenueOpsFrontendCloudFrontFoundation",
      "Effect": "Allow",
      "Action": [
        "cloudfront:CreateOriginAccessControl",
        "cloudfront:GetOriginAccessControl",
        "cloudfront:ListOriginAccessControls",
        "cloudfront:CreateDistribution",
        "cloudfront:GetDistribution",
        "cloudfront:ListDistributions",
        "cloudfront:TagResource"
      ],
      "Resource": "*"
    }
  ]
}
```

Why `Resource = "*"`:

- CloudFront is a global service.
- create/list style CloudFront APIs commonly require `*` or account-global resource handling.
- This patch is constrained by action set, not by broad service wildcard.
- It does not include `cloudfront:*`.
- It does not include update/delete/invalidation actions.

## 5. Approved Mutation Command Template

Do not run this without explicit approval.

```bash
aws iam put-user-policy \
  --user-name de-ai-12 \
  --policy-name RevenueOpsFrontendCloudFrontFoundationAccess \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Sid": "RevenueOpsFrontendCloudFrontFoundation",
        "Effect": "Allow",
        "Action": [
          "cloudfront:CreateOriginAccessControl",
          "cloudfront:GetOriginAccessControl",
          "cloudfront:ListOriginAccessControls",
          "cloudfront:CreateDistribution",
          "cloudfront:GetDistribution",
          "cloudfront:ListDistributions",
          "cloudfront:TagResource"
        ],
        "Resource": "*"
      }
    ]
  }'
```

After mutation, verify with:

```bash
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::827913617635:user/de-ai-12 \
  --action-names \
    cloudfront:CreateOriginAccessControl \
    cloudfront:GetOriginAccessControl \
    cloudfront:ListOriginAccessControls \
    cloudfront:CreateDistribution \
    cloudfront:GetDistribution \
    cloudfront:ListDistributions \
    cloudfront:TagResource \
  --resource-arns '*'
```

Expected after result:

```text
allowed for all seven listed CloudFront actions
```

## 6. Remaining Terraform Plan Gate

After IAM approval and mutation, re-run the same frontend-first plan:

```bash
terraform -chdir=infra/terraform/envs/revenue-dev plan \
  -var-file=terraform.step1c.first-subset.tfvars \
  -out=tfplan.step2b.remaining-cloudfront
```

Proceed only if the plan contains exactly the remaining STEP 2-B resources:

- `module.frontend_hosting.aws_cloudfront_origin_access_control.frontend[0]`
- `module.frontend_hosting.aws_cloudfront_distribution.frontend[0]`
- `module.frontend_hosting.aws_s3_bucket_policy.frontend[0]`

The plan must not include:

- API Gateway
- Lambda Revenue Ops API
- Cognito
- Aurora/RDS
- Glue
- Athena
- Step Functions
- EventBridge Scheduler
- live collector resources
- frontend asset upload/deploy resources

## 7. Remaining Apply Gate

Apply only after the remaining plan is reviewed and explicit apply approval is provided.

Approved apply command shape:

```bash
terraform -chdir=infra/terraform/envs/revenue-dev apply tfplan.step2b.remaining-cloudfront
```

Do not run:

- `terraform destroy`
- frontend asset upload/deploy
- API/Auth/Aurora/Pipeline enablement
- EventBridge schedule enablement

## 8. Post-Apply Verification Plan

After remaining CloudFront apply:

```bash
terraform -chdir=infra/terraform/envs/revenue-dev state list
terraform -chdir=infra/terraform/envs/revenue-dev output -json
aws cloudfront list-origin-access-controls
aws cloudfront list-distributions
aws s3api get-bucket-policy --bucket revenue-ops-frontend-dev-827913617635
aws s3api list-objects-v2 --bucket revenue-ops-frontend-dev-827913617635 --max-items 10
```

Expected:

- CloudFront OAC exists
- CloudFront distribution exists
- frontend bucket policy allows CloudFront service principal read with `AWS:SourceArn` scoped to the distribution ARN
- frontend bucket remains empty
- no API/Auth/Aurora/ETL resources in Terraform state

## 9. Current Decision

IAM mutation was not performed in this preparation step.

Required approval to continue:

```text
Approved to add the RevenueOpsFrontendCloudFrontFoundationAccess inline IAM policy to de-ai-12 and then rerun the remaining STEP 2-B frontend foundation plan.
```

Separate approval is still required before applying the remaining Terraform plan.
