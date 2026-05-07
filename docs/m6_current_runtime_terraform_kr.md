# M6 Current Runtime Terraform

## 현재 Runtime
- Frontend: S3 + CloudFront
- Backend: API Gateway HTTP API + Lambda nodejs20.x
- Auth: Cognito Hosted UI/JWT authorizer
- Persistence: Aurora PostgreSQL
- Egress: VPC + NAT Gateway, Seoul Open Data 8088 egress 포함
- Secrets: Secrets Manager for Aurora/public context credentials

## Module Map
- `revenue_frontend_hosting`: frontend bucket, CloudFront distribution, optional DNS.
- `revenue_cognito`: Cognito user pool/client/domain.
- `revenue_aurora`: Aurora Serverless v2 cluster and master secret.
- `revenue_network`: VPC, private/public subnets, NAT profile, Lambda security group.
- `revenue_api_gateway_lambda`: API Gateway, Lambda, JWT authorizer integration, alias/canary readiness.
- `revenue_saas_observability`: CloudWatch-first SaaS alarms.
- Pipeline modules: data lake/Glue/Athena/Step Functions are gated and not required for M6 SaaS runtime.

## Terraform이 관리하는 것
- S3/CloudFront frontend foundation.
- Cognito auth foundation.
- API Gateway/Lambda runtime and IAM role.
- Aurora foundation and network access.
- NAT egress profile for live public collectors.
- Plan-ready Lambda alias, CodeDeploy deployment group, rollback alarms.

## Secrets/IAM Notes
- Secret values are not committed and are managed outside Terraform.
- `migration_role` is DDL-only and must not be used by runtime.
- `app_role` is API/worker runtime only.
- `readonly_role` is read-only.
- `debezium_cdc` is separate CDC credential.
- PII/raw payload must not be logged or returned in error bodies.

## NAT/8088 Egress
Kakao/KMA/Naver/holiday APIs use standard HTTPS egress. Seoul Open Data uses port 8088, so the VPC/NAT route and security rules must preserve outbound 8088. NAT cost should be watched because collector traffic is bursty but public egress is not free.

## Deferred Platform-Scale Infra
MSK, EKS, Airflow, ClickHouse live read path, and full CDC pipelines remain deferred. The M6 paid-SaaS candidate path is serverless-first: API Gateway, Lambda, Aurora, CloudWatch, and CodeDeploy.

## Validation Commands
```bash
terraform fmt -recursive infra/terraform
terraform -chdir=infra/terraform/envs/revenue-dev validate
terraform -chdir=infra/terraform/envs/revenue-dev plan \
  -var-file=terraform.step2f.jwt-enforcement.tfvars \
  -out=tfplan.m6-release-canary
```
