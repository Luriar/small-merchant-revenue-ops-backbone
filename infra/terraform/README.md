# Revenue Ops — Serverless Batch ETL Terraform Stack

This is the **Revenue Ops** serverless batch ETL infrastructure.
It is **not** the old Product Ops streaming/CDC/EKS stack — those modules have been removed.

## What this stack does

Provisions a serverless medallion ETL pipeline on AWS:

| Layer | Technology | Purpose |
|---|---|---|
| Ingestion | Lambda (Python 3.11) | Pull raw data from external APIs into S3 bronze/ |
| Orchestration | Step Functions (STANDARD) | Sequence and parallelize the ETL pipeline |
| Scheduling | EventBridge Scheduler | Trigger the pipeline daily at 2:00 AM UTC |
| Bronze → Silver | AWS Glue (Python Shell) | Clean, type-cast, and write Parquet |
| Silver → Gold | AWS Glue (Python Shell) | Join signals, detect anomalies, enrich |
| Query | Athena + Glue Data Catalog | Ad-hoc and downstream BI queries |
| Secrets | SSM Parameter Store | API keys and configuration |
| Observability | CloudWatch Logs + Alarms | Log retention and error alerting |

## Stack constraints

The following services are intentionally excluded:
EKS, MSK, ClickHouse, Debezium, Strimzi, MWAA, Redshift, EMR, Kinesis, Prometheus/Grafana, Argo CD.

## Directory structure

```
infra/terraform/
├── bootstrap/                    One-time apply: creates S3 state bucket + DynamoDB lock table
│   ├── versions.tf
│   ├── providers.tf
│   ├── variables.tf
│   ├── main.tf
│   └── outputs.tf
│
├── envs/
│   └── revenue-dev/              Main environment (dev/staging/prod parity via tfvars)
│       ├── versions.tf
│       ├── providers.tf
│       ├── backend.tf
│       ├── variables.tf
│       ├── locals.tf
│       ├── main.tf               Module calls
│       ├── outputs.tf
│       └── terraform.tfvars.example
│
└── modules/
    ├── revenue_data_lake/        S3 data lake (bronze/silver/gold) + Athena results bucket
    ├── revenue_glue_catalog/     Glue Data Catalog database + all Silver and Gold table schemas
    ├── revenue_athena/           Athena workgroup with cost guard rail and enforced result location
    ├── revenue_etl_iam/          IAM roles for Lambda, Glue, Step Functions, EventBridge
    ├── revenue_lambda_extractors/Lambda functions: fetch_weather_asos, fetch_holidays, fetch_local_events
    ├── revenue_glue_jobs/        8 Glue Python Shell jobs (Bronze→Silver + Silver→Gold)
    ├── revenue_step_functions/   Step Functions state machine (medallion pipeline ASL)
    ├── revenue_eventbridge/      EventBridge Scheduler — daily pipeline trigger
    ├── revenue_observability/    CloudWatch log groups + metric alarms
    └── revenue_secrets/          SSM Parameter Store entries for API keys
```

## Prerequisites

- Terraform >= 1.5
- AWS CLI configured (`aws configure` or environment variables)
- An AWS account and sufficient IAM permissions

## Deploy

### Step 1 — Bootstrap (once per account/region)

```bash
cd infra/terraform/bootstrap

terraform init
terraform apply \
  -var='state_bucket_name=revenue-ops-tfstate-YOUR_ACCOUNT_ID'
```

Note the `state_bucket_name` and `dynamodb_table_name` outputs.

### Step 2 — Configure the remote backend

Copy `envs/revenue-dev/backend.tf` and fill in the values from Step 1:

```hcl
terraform {
  backend "s3" {
    bucket         = "<state_bucket_name from Step 1>"
    key            = "revenue-ops/revenue-dev/terraform.tfstate"
    region         = "ap-northeast-2"
    dynamodb_table = "<dynamodb_table_name from Step 1>"
    encrypt        = true
  }
}
```

Or pass them via CLI flags:

```bash
terraform init \
  -backend-config="bucket=revenue-ops-tfstate-123456789012" \
  -backend-config="key=revenue-ops/revenue-dev/terraform.tfstate" \
  -backend-config="region=ap-northeast-2" \
  -backend-config="dynamodb_table=revenue-ops-tflock" \
  -backend-config="encrypt=true"
```

### Step 3 — Configure tfvars

```bash
cd infra/terraform/envs/revenue-dev

cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your account-specific values
```

### Step 4 — Plan & Apply

```bash
terraform init      # only needed once or after backend changes
terraform plan
terraform apply
```

### Step 5 — Update secrets

After the first apply, update the SSM parameters with real API keys before running the pipeline:

```bash
# Seoul OpenAPI
aws ssm put-parameter \
  --name "/revenue-ops-revenue-dev/SEOUL_OPENAPI_KEY" \
  --value "your-actual-key" \
  --type SecureString \
  --overwrite

# data.go.kr
aws ssm put-parameter \
  --name "/revenue-ops-revenue-dev/DATA_GO_KR_SERVICE_KEY" \
  --value "your-actual-key" \
  --type SecureString \
  --overwrite
```

### Step 6 — Enable the schedule (when ready)

```bash
terraform apply -var='enable_schedule=true'
```

## Triggering the pipeline manually

```bash
# Get the state machine ARN from Terraform output
STATE_MACHINE_ARN=$(terraform output -raw step_function_arn)

aws stepfunctions start-execution \
  --state-machine-arn "$STATE_MACHINE_ARN" \
  --input '{"pipeline_trigger": "manual"}'
```

## Cost estimate (dev, ap-northeast-2)

| Service | Approximate cost |
|---|---|
| S3 (data lake + results) | < $1/month for dev volumes |
| Lambda (3 extractors, daily) | < $1/month |
| Glue (8 jobs × 0.0625 DPU, daily) | ~$0.30/month |
| Step Functions | < $0.01/month |
| Athena | Pay-per-query (~$5/TB scanned) |
| CloudWatch | ~$0.50/month |
| SSM Parameter Store | Free tier |

Total dev estimate: **~$2-5/month** (heavily depends on data volume and query frequency).

## Teardown

```bash
cd infra/terraform/envs/revenue-dev
terraform destroy
```

The bootstrap resources (S3 state bucket, DynamoDB table) are intentionally not destroyed automatically.
Remove them manually when the project is fully decommissioned.
