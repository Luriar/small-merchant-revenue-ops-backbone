# STEP 2-E-B Revenue Ops Network Foundation Apply Report

## 1. 맥락

이번 작업은 small-merchant Revenue Ops SaaS의 Aurora foundation 전 단계로, Revenue Ops-owned network foundation만 apply하는 것이다.

Live baseline:

- Frontend: `https://d1fquuc7vsf9cu.cloudfront.net/`
- API Gateway: `https://7q8hxxta67.execute-api.ap-northeast-2.amazonaws.com`
- API route authorization remains `NONE`
- Cognito/Auth apply disabled in this run
- Aurora/RDS disabled in this run
- ETL/pipeline/schedule/live collector/POS ingestion disabled

## 2. Validation

실행:

```bash
terraform fmt -recursive -check infra/terraform
terraform -chdir=infra/terraform/envs/revenue-dev validate
```

결과:

- fmt check: passed
- validate: passed
- warning: backend `dynamodb_table` deprecation warning only

## 3. Plan Gate

Plan command:

```bash
terraform -chdir=infra/terraform/envs/revenue-dev plan \
  -var-file=terraform.step2e.network.tfvars \
  -out=tfplan.step2e.network \
  -no-color
```

Plan result:

```text
Plan: 10 to add, 0 to change, 0 to destroy.
```

Action counts:

```json
{
  "create": 10,
  "update": 0,
  "delete": 0,
  "replace": 0
}
```

Resource changes:

```text
create module.aurora_network.aws_route_table.private[0]
create module.aurora_network.aws_route_table_association.private["0"]
create module.aurora_network.aws_route_table_association.private["1"]
create module.aurora_network.aws_security_group.aurora[0]
create module.aurora_network.aws_security_group.lambda[0]
create module.aurora_network.aws_security_group_rule.aurora_from_lambda_ingress[0]
create module.aurora_network.aws_security_group_rule.lambda_to_aurora_egress[0]
create module.aurora_network.aws_subnet.private["0"]
create module.aurora_network.aws_subnet.private["1"]
create module.aurora_network.aws_vpc.main[0]
```

Gate result:

- resources only under `module.aurora_network`
- no Cognito/Auth
- no Aurora/RDS cluster
- no API Gateway route update
- no Lambda update
- no frontend/CloudFront update
- no ETL/pipeline/schedule/live collector/POS resource
- no destroy
- no replacement

## 4. Apply Result

Apply command:

```bash
terraform -chdir=infra/terraform/envs/revenue-dev apply -no-color tfplan.step2e.network
```

Apply result:

```text
Apply complete! Resources: 10 added, 0 changed, 0 destroyed.
```

Created resources:

```text
module.aurora_network.aws_vpc.main[0]                                      vpc-02e9069c818170256
module.aurora_network.aws_subnet.private["0"]                              subnet-01381433f0c693179
module.aurora_network.aws_subnet.private["1"]                              subnet-07cb619fbe572a308
module.aurora_network.aws_route_table.private[0]                           rtb-0a5bc9bbdab42299e
module.aurora_network.aws_route_table_association.private["0"]             rtbassoc-09d3bfd089aac0d5d
module.aurora_network.aws_route_table_association.private["1"]             rtbassoc-049bc0033326ea9a4
module.aurora_network.aws_security_group.lambda[0]                         sg-0f269d20c37ea2f15
module.aurora_network.aws_security_group.aurora[0]                         sg-096925d74346ad4cd
module.aurora_network.aws_security_group_rule.aurora_from_lambda_ingress[0] sgrule-619134519
module.aurora_network.aws_security_group_rule.lambda_to_aurora_egress[0]    sgrule-3737878178
```

## 5. Post-Apply Plan

Post-apply command:

```bash
terraform -chdir=infra/terraform/envs/revenue-dev plan \
  -var-file=terraform.step2e.network.tfvars \
  -out=tfplan.step2e.network.post-apply \
  -no-color
```

Result:

```text
No changes. Your infrastructure matches the configuration.
```

Post-apply action counts:

```json
{
  "create": 0,
  "update": 0,
  "delete": 0,
  "replace": 0
}
```

## 6. Network Outputs

Terraform outputs:

```text
aurora_network_vpc_id = vpc-02e9069c818170256
aurora_network_private_subnet_ids = [
  subnet-01381433f0c693179,
  subnet-07cb619fbe572a308,
]
aurora_network_lambda_security_group_id = sg-0f269d20c37ea2f15
aurora_network_aurora_security_group_id = sg-096925d74346ad4cd
```

Network shape:

- VPC CIDR: `10.42.0.0/20`
- Private subnet 1: `10.42.0.0/24`, `ap-northeast-2a`, `MapPublicIpOnLaunch=false`
- Private subnet 2: `10.42.1.0/24`, `ap-northeast-2b`, `MapPublicIpOnLaunch=false`

## 7. AWS Read-Only Verification

Commands:

```bash
aws ec2 describe-vpcs --vpc-ids vpc-02e9069c818170256 --region ap-northeast-2
aws ec2 describe-subnets --subnet-ids subnet-01381433f0c693179 subnet-07cb619fbe572a308 --region ap-northeast-2
aws ec2 describe-security-groups --group-ids sg-0f269d20c37ea2f15 sg-096925d74346ad4cd --region ap-northeast-2
```

Verified:

- VPC exists and is not default
- VPC is tagged `Project=revenue-ops`, `Environment=revenue-dev`, `Purpose=revenue-ops-aurora-network`
- both subnets are in the Revenue Ops VPC
- both subnets have public IP on launch disabled
- Aurora SG allows ingress only from Lambda SG on TCP 5432
- Lambda SG allows egress only to Aurora SG on TCP 5432

Additional checks:

- `describe-internet-gateways` for the VPC returned `[]`
- `describe-nat-gateways` for the VPC returned `[]`

## 8. Out-of-Scope Confirmation

State grep for:

```text
cognito|rds|aurora|glue|athena|sfn|scheduler|eventbridge|collector|pos
```

Result:

- only `module.aurora_network` resources matched
- no Cognito resources
- no RDS/Aurora cluster resources
- no Glue/Athena/Step Functions/EventBridge/Scheduler resources
- no collector/POS resources

API route state:

```text
authorization_type = "NONE"
authorizer_id      = null
```

No Lambda env update was applied. No frontend/CloudFront update was applied.

## 9. Next Step

Next phase is Aurora foundation plan using the network outputs:

```hcl
aurora_vpc_id = "vpc-02e9069c818170256"
aurora_private_subnet_ids = [
  "subnet-01381433f0c693179",
  "subnet-07cb619fbe572a308",
]
aurora_allowed_security_group_ids = [
  "sg-0f269d20c37ea2f15",
]
```

Next run should plan only first, with:

- `enable_aurora = true`
- `enable_auth = false` unless explicitly doing Cognito separately
- `enable_api_jwt_authorizer = false`
- `enable_pipeline_foundation = false`
- `enable_schedule = false`

Apply only if the next plan has 0 destroy, 0 replace, and only expected Aurora/RDS + Secrets Manager + Lambda secret-reference updates if explicitly approved.
