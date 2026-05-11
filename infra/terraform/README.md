# Revenue Ops OS Terraform Infrastructure

This directory contains the Terraform configuration used to provision and manage the AWS infrastructure for the **Small Merchant Revenue Ops OS** project.

The infrastructure supports a revenue-operations SaaS MVP for small merchants. It provides the cloud foundation for authenticated store management, revenue data ingestion, public context collection, API delivery, frontend hosting, and operational observability.

---

## 1. Directory Structure

```text
infra/terraform/
├── bootstrap/
├── envs/
│   └── revenue-dev/
└── modules/
```

### `bootstrap/`

Initial backend/bootstrap layer.

This layer is used to prepare Terraform backend-related resources such as remote state storage and locking infrastructure. It is separated from the main service infrastructure because backend resources usually need to exist before the main environment can be planned or applied.

### `envs/revenue-dev/`

Environment-level Terraform composition for the `revenue-dev` AWS environment.

This directory wires together the reusable modules, provides environment-specific variables, defines providers/backend configuration, and exposes outputs used by deployment and verification workflows.

The final active planning baseline for the current deployed environment is:

```bash
terraform.step2f.jwt-enforcement.tfvars
```

### `modules/`

Reusable Terraform modules.

The project separates AWS resources into modules so that infrastructure concerns are easier to review, evolve, and reuse.

Main module groups include:

```text
revenue_api_gateway_lambda
revenue_aurora
revenue_cognito
revenue_frontend_hosting
revenue_artifacts
revenue_saas_observability
revenue_athena
```

---

## 2. Managed AWS Resources

The Terraform configuration manages the main AWS infrastructure for the Revenue Ops OS MVP.

Major managed resources include:

```text
- API Gateway HTTP API
- Lambda Revenue API
- Lambda live alias
- CodeDeploy canary deployment resources
- Cognito User Pool and web client
- S3 frontend hosting bucket
- CloudFront distribution
- Aurora PostgreSQL Serverless / cluster resources
- Secrets Manager resources
- VPC, private subnets, public egress/NAT path
- Security groups and egress rules for public context collectors
- CloudWatch alarms
- GitHub Actions OIDC deploy role and permissions
- Artifact S3 bucket
```

The infrastructure is designed so that the deployed application can support:

```text
- Authenticated API calls through Cognito JWT
- Store and revenue data APIs
- Public context collectors such as weather, holidays, Naver search trend, and Seoul open data
- Frontend delivery through CloudFront
- Backend deployment through GitHub Actions and Lambda/CodeDeploy
```

---

## 3. Current Environment Baseline

The current environment is:

```text
Environment: revenue-dev
AWS Region: ap-northeast-2
Project tag: revenue-ops
```

The current Terraform baseline was checked with:

```bash
cd infra/terraform/envs/revenue-dev

terraform plan -input=false \
  -var-file=terraform.step2f.jwt-enforcement.tfvars
```

Expected result:

```text
No changes. Your infrastructure matches the configuration.
```

This means the current Terraform code and the live AWS infrastructure are aligned.

---

## 4. Important Safety Rule

Do **not** apply old step-specific variable files unless the plan has been reviewed.

In particular, this file is not the current final baseline:

```bash
terraform.step2e.lambda-vpc.tfvars
```

Using an older step file can produce a destructive plan because it may not include later resources such as Cognito, JWT authorization, NAT egress, CodeDeploy, Lambda alias, and observability resources.

The current safe drift-check command is:

```bash
terraform plan -input=false \
  -var-file=terraform.step2f.jwt-enforcement.tfvars
```

Never run `terraform apply` unless the generated plan is intentionally reviewed.

---

## 5. Common Commands

### Initialize Terraform

```bash
cd infra/terraform/envs/revenue-dev

terraform init
```

### Check current infrastructure drift

```bash
terraform plan -input=false \
  -var-file=terraform.step2f.jwt-enforcement.tfvars
```

Expected clean result:

```text
No changes. Your infrastructure matches the configuration.
```

### Save a plan for review

```bash
terraform plan -input=false \
  -var-file=terraform.step2f.jwt-enforcement.tfvars \
  -out=/tmp/revenue-dev.tfplan

terraform show -no-color /tmp/revenue-dev.tfplan | sed -n '1,260p'
```

### Apply a reviewed plan

Only apply after carefully reviewing the saved plan.

```bash
terraform apply /tmp/revenue-dev.tfplan
```

---

## 6. Frontend and Backend Deployment Relationship

Terraform provisions the infrastructure, but normal application code deployment is handled outside Terraform.

### Terraform manages

```text
- CloudFront/S3 frontend hosting infrastructure
- API Gateway
- Lambda function shell/configuration
- Lambda alias and CodeDeploy deployment resources
- Cognito
- Aurora
- IAM roles and permissions
```

### GitHub Actions deploys

```text
- Built React/Vite frontend assets
- Lambda API package updates
- Lambda version publishing and alias promotion
- CloudFront invalidation
```

Therefore, most frontend UI changes do not require `terraform apply`.

Examples of changes that usually do **not** require Terraform:

```text
- React component changes
- Revenue cockpit screen copy changes
- Chart or card rendering logic
- API fallback notice positioning
- Login/session UI behavior
- Static frontend bundle rebuilds
```

Examples of changes that may require Terraform:

```text
- New AWS resources
- API Gateway route or CORS infrastructure changes
- Lambda environment variables managed by Terraform
- Cognito configuration changes
- VPC, subnet, NAT, or security group changes
- IAM role/policy changes
```

---

## 7. Public Context Collector Networking

The backend public context collectors need outbound access to external APIs.

The current infrastructure includes egress support for:

```text
- HTTPS public APIs
- Seoul Open Data API over TCP 8088
- Secrets Manager access through VPC endpoint
- Aurora access from Lambda security group
```

These networking settings are important for collectors such as:

```text
- KMA Weather API
- Korean holiday calendar
- Naver DataLab
- Naver Local Search
- Seoul Open Data commercial benchmark
- Seoul foot traffic proxy
- Seoul store density proxy
- Seoul local event context
```

---

## 8. Drift Alignment Notes

Two important live-state alignment fixes are reflected in the current Terraform code:

```text
Aurora engine version:
- Terraform baseline aligned to live Aurora PostgreSQL 16.11

API Gateway CORS:
- Preserves https origins
- Preserves local development origin http://localhost:5173
- Preserves exposed content-type header
```

These changes prevent Terraform from trying to roll back the live environment during future plans.

---

## 9. Destroy Procedure

To remove the AWS infrastructure managed by this Terraform environment, first generate and review a destroy plan.

```bash
cd infra/terraform/envs/revenue-dev

terraform plan -destroy -input=false \
  -var-file=terraform.step2f.jwt-enforcement.tfvars \
  -out=/tmp/revenue-dev-destroy.tfplan

terraform show -no-color /tmp/revenue-dev-destroy.tfplan | sed -n '1,320p'
```

Apply only after reviewing the destroy plan:

```bash
terraform apply /tmp/revenue-dev-destroy.tfplan
```

After destroy, check for remaining tagged resources:

```bash
aws resourcegroupstaggingapi get-resources \
  --region ap-northeast-2 \
  --tag-filters Key=Project,Values=revenue-ops \
  --query 'ResourceTagMappingList[].ResourceARN' \
  --output text
```

Also check for remaining S3 buckets and Secrets Manager entries:

```bash
aws s3 ls | grep revenue-ops || true

aws secretsmanager list-secrets \
  --region ap-northeast-2 \
  --query "SecretList[?contains(Name, 'revenue-ops')].Name" \
  --output table
```

Terraform destroy removes resources tracked in Terraform state. Some manually created resources, log groups, retained snapshots, backend state buckets, or manually updated secrets may require separate cleanup.

---

## 10. Submission Notes

For portfolio or project submission, include:

```text
infra/terraform/bootstrap/
infra/terraform/envs/
infra/terraform/modules/
```

Exclude local execution artifacts and sensitive files:

```text
.terraform/
*.tfplan
terraform.tfstate
terraform.tfstate.backup
*.tfvars containing secrets or private credentials
```

The recommended submission unit is the full `infra/terraform/` directory after removing local state, generated plan files, provider cache directories, and sensitive values.

---

## 11. Summary

This Terraform layer demonstrates:

```text
- Modular AWS infrastructure design
- Environment-level composition
- Cognito-authenticated API architecture
- Lambda/API Gateway backend deployment foundation
- CloudFront/S3 frontend hosting
- Aurora-backed operational data layer
- Public collector egress networking
- GitHub Actions OIDC deployment role
- Drift checking and production-like infrastructure hygiene
```

The latest validated state is aligned with the deployed AWS environment and does not require additional Terraform apply.
