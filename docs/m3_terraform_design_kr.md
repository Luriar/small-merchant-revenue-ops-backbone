# M3 Terraform 설계 (한국어)

> 문서 버전: v0.1 | 최종 수정: 2026-05-05 | 대상 마일스톤: M3

---

## 1. 기존 Product Ops Terraform과의 차이

### 1.1 기존 Product Ops Terraform (M1/M2)

기존 Product Ops Backbone에서는 고볼륨 스트리밍 처리를 위한 복잡한 인프라를 Terraform으로 관리했다.

| 컴포넌트 | 기존 (Product Ops) | 현재 (Revenue Ops) |
|---------|------------------|------------------|
| 컨테이너 | EKS 클러스터 | 없음 (제거) |
| 메시징 | MSK (Kafka) | 없음 (제거) |
| CDC | Debezium / Strimzi | 없음 (제거) |
| OLAP | ClickHouse | 없음 (제거) |
| 워크플로 | MWAA (Airflow) | Step Functions |
| 데이터웨어하우스 | Redshift | Athena |
| 빅데이터 | EMR | Glue Python Shell |
| 스트리밍 수집 | Kinesis | 없음 (제거) |
| 모니터링 | Prometheus/Grafana | CloudWatch |
| CD | Argo CD / Rollouts | 없음 (배치 ETL) |

### 1.2 Revenue Ops Terraform (M3)

M3에서는 **Serverless Batch ETL** 에 필요한 최소한의 AWS 리소스만 Terraform으로 관리한다.

모든 기존 Product Ops Terraform 코드는 `docs/reference/legacy_product_ops/infra/` 에 아카이브된다. M3 Terraform은 완전히 새로 작성한다.

---

## 2. 디렉토리 구조

```
infra/terraform/
├── bootstrap/
│   ├── main.tf           # S3 백엔드 버킷 + DynamoDB 락 테이블 초기화
│   ├── variables.tf
│   └── outputs.tf
├── envs/
│   └── revenue-dev/
│       ├── main.tf           # 모듈 조합
│       ├── variables.tf      # 환경별 변수
│       ├── outputs.tf        # 환경별 출력
│       ├── backend.tf        # S3 원격 상태 설정
│       └── terraform.tfvars  # 실제 변수값 (gitignore 대상)
└── modules/
    ├── revenue_data_lake/
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf
    ├── revenue_glue_catalog/
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf
    ├── revenue_athena/
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf
    ├── revenue_etl_iam/
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf
    ├── revenue_lambda_extractors/
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf
    ├── revenue_glue_jobs/
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf
    ├── revenue_step_functions/
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf
    ├── revenue_eventbridge/
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf
    ├── revenue_observability/
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf
    └── revenue_secrets/
        ├── main.tf
        ├── variables.tf
        └── outputs.tf
```

---

## 3. 모듈 목록 및 역할

### 3.1 revenue_data_lake

**역할**: Revenue Ops 데이터 레이크를 위한 S3 버킷 구성.

| 버킷 | 용도 |
|------|------|
| `{prefix}-datalake` | Bronze/Silver/Gold 데이터 |
| `{prefix}-scripts` | Glue Job 스크립트 저장 |
| `{prefix}-artifacts` | Lambda 패키지 ZIP |
| `{prefix}-athena-results` | Athena 쿼리 결과 |

**주요 리소스**:

```hcl
# modules/revenue_data_lake/main.tf

resource "aws_s3_bucket" "datalake" {
  bucket = "${var.project_name}-${var.environment}-datalake"
  tags   = local.common_tags
}

resource "aws_s3_bucket_versioning" "datalake" {
  bucket = aws_s3_bucket.datalake.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "datalake" {
  bucket = aws_s3_bucket.datalake.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "datalake" {
  bucket = aws_s3_bucket.datalake.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "datalake" {
  bucket = aws_s3_bucket.datalake.id

  rule {
    id     = "bronze-retention"
    status = "Enabled"
    filter { prefix = "bronze/" }
    expiration { days = 90 }
  }

  rule {
    id     = "silver-retention"
    status = "Enabled"
    filter { prefix = "silver/" }
    expiration { days = 365 }
  }

  rule {
    id     = "gold-retention"
    status = "Enabled"
    filter { prefix = "gold/" }
    expiration { days = 730 }
  }
}
```

**S3 폴더 구조 (접두사 규칙)**:

```
{datalake_bucket}/
├── bronze/
│   ├── seoul_sales/
│   ├── seoul_population/
│   ├── seoul_trade_area/
│   ├── store_count/
│   ├── weather/
│   ├── holidays/
│   └── local_events/
├── silver/
│   ├── revenue_signal/
│   ├── demand_signal/
│   ├── weather_signal/
│   ├── competition_snapshot/
│   ├── holiday_context/
│   └── local_event_context/
├── gold/
│   ├── revenue_context_mart/
│   ├── revenue_anomaly_results/
│   ├── cause_evidence_candidates/
│   ├── action_recommendation_candidates/
│   └── revenue_brief_view/
├── error/
├── metadata/
└── runs/
```

---

### 3.2 revenue_glue_catalog

**역할**: Glue Data Catalog에 Revenue Ops 데이터베이스 및 테이블 정의.

```hcl
# modules/revenue_glue_catalog/main.tf

resource "aws_glue_catalog_database" "revenue_ops" {
  name        = "${var.project_name}_${var.environment}"
  description = "Revenue Ops Medallion ETL - Silver and Gold tables"
}

# Silver 테이블 예시 (revenue_signal)
resource "aws_glue_catalog_table" "revenue_signal" {
  name          = "revenue_signal"
  database_name = aws_glue_catalog_database.revenue_ops.name

  table_type = "EXTERNAL_TABLE"

  parameters = {
    "classification"  = "parquet"
    "compressionType" = "snappy"
  }

  storage_descriptor {
    location      = "s3://${var.datalake_bucket}/silver/revenue_signal/"
    input_format  = "org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat"
    output_format = "org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat"

    ser_de_info {
      serialization_library = "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe"
    }

    columns {
      name = "trade_area_code"
      type = "string"
    }
    columns {
      name = "category_code"
      type = "string"
    }
    columns {
      name = "estimated_revenue_krw"
      type = "bigint"
    }
    columns {
      name = "transaction_count"
      type = "bigint"
    }
    # ... 추가 컬럼
  }

  partition_keys {
    name = "year"
    type = "int"
  }
  partition_keys {
    name = "quarter"
    type = "int"
  }
}
```

---

### 3.3 revenue_athena

**역할**: Athena 워크그룹 및 쿼리 결과 저장 설정.

```hcl
# modules/revenue_athena/main.tf

resource "aws_athena_workgroup" "revenue_ops" {
  name = "${var.project_name}-${var.environment}"

  configuration {
    enforce_workgroup_configuration    = true
    publish_cloudwatch_metrics_enabled = true

    result_configuration {
      output_location = "s3://${var.athena_results_bucket}/athena-results/"

      encryption_configuration {
        encryption_option = "SSE_S3"
      }
    }
  }

  tags = local.common_tags
}

resource "aws_athena_database" "revenue_ops" {
  name   = "${var.project_name}_${var.environment}"
  bucket = var.athena_results_bucket
}
```

---

### 3.4 revenue_etl_iam

**역할**: Lambda, Glue, Step Functions, EventBridge의 IAM 역할 및 정책 정의.

```hcl
# modules/revenue_etl_iam/main.tf

# Lambda 실행 역할
resource "aws_iam_role" "lambda_extractor" {
  name = "${var.project_name}-lambda-extractor-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "lambda_extractor_s3" {
  name = "s3-bronze-write"
  role = aws_iam_role.lambda_extractor.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject"]
        Resource = "arn:aws:s3:::${var.datalake_bucket}/bronze/*"
      },
      {
        Effect   = "Allow"
        Action   = "ssm:GetParameter"
        Resource = "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/${var.ssm_prefix}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/*"
      }
    ]
  })
}

# Glue Job 역할
resource "aws_iam_role" "glue_etl" {
  name = "${var.project_name}-glue-etl-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "glue.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "glue_service" {
  role       = aws_iam_role.glue_etl.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSGlueServiceRole"
}
```

---

### 3.5 revenue_lambda_extractors

**역할**: 7개 공공 API 추출 Lambda 함수 플레이스홀더.

```hcl
# modules/revenue_lambda_extractors/main.tf

locals {
  extractors = {
    "extract-seoul-sales"       = { handler = "extract_seoul_sales.handler",      timeout = 300 }
    "extract-seoul-population"  = { handler = "extract_seoul_population.handler", timeout = 300 }
    "extract-seoul-trade-area"  = { handler = "extract_seoul_trade_area.handler", timeout = 120 }
    "extract-store-count"       = { handler = "extract_store_count.handler",      timeout = 300 }
    "extract-weather"           = { handler = "extract_weather.handler",          timeout = 120 }
    "extract-holidays"          = { handler = "extract_holidays.handler",         timeout = 120 }
    "extract-local-events"      = { handler = "extract_local_events.handler",     timeout = 180 }
    "create-run"                = { handler = "create_run.handler",               timeout = 30 }
    "complete-run"              = { handler = "complete_run.handler",             timeout = 30 }
    "fail-run"                  = { handler = "fail_run.handler",                 timeout = 30 }
  }
}

resource "aws_lambda_function" "extractors" {
  for_each = local.extractors

  function_name = "${var.project_name}-${each.key}-${var.environment}"
  runtime       = "python3.11"
  handler       = each.value.handler
  timeout       = each.value.timeout
  memory_size   = 512
  role          = var.lambda_role_arn

  filename         = "${path.module}/placeholder.zip"
  source_code_hash = filebase64sha256("${path.module}/placeholder.zip")

  environment {
    variables = {
      BRONZE_BUCKET = var.datalake_bucket
      SSM_PREFIX    = var.ssm_prefix
      ENVIRONMENT   = var.environment
    }
  }

  tags = local.common_tags
}
```

---

### 3.6 revenue_glue_jobs

**역할**: Glue Python Shell Job 정의 (변환 및 마트 빌드).

```hcl
# modules/revenue_glue_jobs/main.tf

locals {
  glue_jobs = {
    "validate-bronze"      = { script = "validate_bronze.py",       dpu = 0.0625 }
    "bronze-to-silver"     = { script = "bronze_to_silver.py",      dpu = 0.0625 }
    "silver-to-gold"       = { script = "silver_to_gold.py",        dpu = 0.0625 }
    "detect-anomalies"     = { script = "detect_anomalies.py",      dpu = 0.0625 }
    "link-evidence"        = { script = "link_evidence.py",         dpu = 0.0625 }
    "map-actions"          = { script = "map_actions.py",           dpu = 0.0625 }
    "publish-brief"        = { script = "publish_revenue_brief.py", dpu = 0.0625 }
  }
}

resource "aws_glue_job" "etl_jobs" {
  for_each = local.glue_jobs

  name     = "${var.project_name}-${each.key}-${var.environment}"
  role_arn = var.glue_role_arn

  command {
    name            = "pythonshell"
    python_version  = "3.9"  # Glue Python Shell 지원 최신 버전
    script_location = "s3://${var.scripts_bucket}/glue/${each.value.script}"
  }

  default_arguments = {
    "--BRONZE_BUCKET"     = var.datalake_bucket
    "--SILVER_BUCKET"     = var.datalake_bucket
    "--GOLD_BUCKET"       = var.datalake_bucket
    "--GLUE_DATABASE"     = var.glue_database_name
    "--enable-job-insights" = "false"
  }

  max_capacity = each.value.dpu
  glue_version = "3.0"
  timeout      = 60  # 분

  tags = local.common_tags
}
```

---

### 3.7 revenue_step_functions

**역할**: Revenue Ops 파이프라인 Step Functions 스테이트 머신 정의.

```hcl
# modules/revenue_step_functions/main.tf

resource "aws_sfn_state_machine" "revenue_ops_pipeline" {
  name     = "${var.project_name}-pipeline-${var.environment}"
  role_arn = var.sfn_role_arn

  definition = jsonencode({
    Comment = "Revenue Ops Medallion ETL Pipeline"
    StartAt = "CreateRun"
    States  = {
      CreateRun = {
        Type     = "Task"
        Resource = var.lambda_arns["create-run"]
        Next     = "ExtractSources"
        Catch    = [{ ErrorEquals = ["States.ALL"], Next = "FailRun" }]
      }
      ExtractSources = {
        Type = "Parallel"
        Branches = [
          for source in ["seoul-sales", "seoul-population", "seoul-trade-area",
                         "store-count", "weather", "holidays", "local-events"] : {
            StartAt = "Extract${replace(title(source), "-", "")}"
            States  = {
              "Extract${replace(title(source), "-", "")}" = {
                Type     = "Task"
                Resource = var.lambda_arns["extract-${source}"]
                End      = true
              }
            }
          }
        ]
        Next  = "ValidateBronze"
        Catch = [{ ErrorEquals = ["States.ALL"], Next = "FailRun" }]
      }
      ValidateBronze = {
        Type     = "Task"
        Resource = "arn:aws:states:::glue:startJobRun.sync"
        Parameters = {
          JobName = var.glue_job_names["validate-bronze"]
          Arguments = { "--RUN_ID.$" = "$.run_id" }
        }
        Next  = "BronzeToSilver"
        Catch = [{ ErrorEquals = ["States.ALL"], Next = "FailRun" }]
      }
      # ... 이하 생략 (동일 패턴)
      CompleteRun = {
        Type     = "Task"
        Resource = var.lambda_arns["complete-run"]
        End      = true
      }
      FailRun = {
        Type     = "Task"
        Resource = var.lambda_arns["fail-run"]
        End      = true
      }
    }
  })

  tags = local.common_tags
}
```

---

### 3.8 revenue_eventbridge

**역할**: EventBridge Scheduler 스케줄 정의 (기본 비활성화).

```hcl
# modules/revenue_eventbridge/main.tf

resource "aws_scheduler_schedule" "revenue_ops_weekly" {
  name                         = "${var.project_name}-weekly-${var.environment}"
  group_name                   = "default"
  state                        = var.enable_schedule ? "ENABLED" : "DISABLED"
  schedule_expression          = "cron(0 2 ? * MON *)"  # 매주 월요일 02:00 UTC (KST 11:00)
  schedule_expression_timezone = "Asia/Seoul"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = var.state_machine_arn
    role_arn = var.eventbridge_role_arn

    input = jsonencode({
      source       = "eventbridge-scheduler"
      trigger_type = "weekly"
    })
  }
}
```

---

### 3.9 revenue_observability

**역할**: CloudWatch 로그 그룹 및 기본 알람 설정.

```hcl
# modules/revenue_observability/main.tf

# CloudWatch Log Groups
resource "aws_cloudwatch_log_group" "step_functions" {
  name              = "/aws/states/${var.project_name}-pipeline-${var.environment}"
  retention_in_days = 30
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "glue_jobs" {
  for_each = toset(["validate-bronze", "bronze-to-silver", "silver-to-gold",
                    "detect-anomalies", "link-evidence", "map-actions", "publish-brief"])

  name              = "/aws-glue/jobs/${var.project_name}-${each.value}-${var.environment}"
  retention_in_days = 30
  tags              = local.common_tags
}

# CloudWatch 알람: Step Functions 실패
resource "aws_cloudwatch_metric_alarm" "sfn_failed" {
  alarm_name          = "${var.project_name}-pipeline-failed-${var.environment}"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "ExecutionsFailed"
  namespace           = "AWS/States"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "Revenue Ops 파이프라인 실행 실패 감지"

  dimensions = {
    StateMachineArn = var.state_machine_arn
  }

  alarm_actions = var.alarm_sns_topic_arn != "" ? [var.alarm_sns_topic_arn] : []

  tags = local.common_tags
}
```

---

### 3.10 revenue_secrets

**역할**: SSM Parameter Store 파라미터 및 Secrets Manager 시크릿 플레이스홀더 정의.

```hcl
# modules/revenue_secrets/main.tf

resource "aws_ssm_parameter" "seoul_api_key" {
  name        = "/${var.project_name}/${var.environment}/seoul-api-key"
  description = "서울 열린데이터광장 API 키"
  type        = "SecureString"
  value       = "PLACEHOLDER_REPLACE_BEFORE_DEPLOY"
  tags        = local.common_tags

  lifecycle {
    ignore_changes = [value]  # Terraform 외부에서 값 관리
  }
}

resource "aws_ssm_parameter" "data_go_kr_api_key" {
  name        = "/${var.project_name}/${var.environment}/data-go-kr-api-key"
  description = "공공데이터포털 API 키"
  type        = "SecureString"
  value       = "PLACEHOLDER_REPLACE_BEFORE_DEPLOY"
  tags        = local.common_tags

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "kma_api_key" {
  name        = "/${var.project_name}/${var.environment}/kma-api-key"
  description = "기상청 ASOS API 키"
  type        = "SecureString"
  value       = "PLACEHOLDER_REPLACE_BEFORE_DEPLOY"
  tags        = local.common_tags

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_secretsmanager_secret" "aurora_credentials" {
  name        = "${var.project_name}/${var.environment}/aurora-credentials"
  description = "Aurora PostgreSQL 접속 정보"
  tags        = local.common_tags
}
```

---

## 4. 주요 Terraform 변수 목록

### 4.1 공통 변수

| 변수명 | 타입 | 기본값 | 설명 |
|--------|------|--------|------|
| `project_name` | string | `revenue-ops` | 프로젝트 이름 (리소스 이름 접두사) |
| `environment` | string | `dev` | 배포 환경 (dev / staging / prod) |
| `aws_region` | string | `ap-northeast-2` | AWS 리전 (서울) |
| `aws_account_id` | string | - | AWS 계정 ID |
| `enable_schedule` | bool | `false` | EventBridge 스케줄 활성화 여부 |
| `alarm_sns_topic_arn` | string | `""` | CloudWatch 알람 SNS 토픽 ARN |
| `ssm_prefix` | string | `/revenue-ops/dev` | SSM 파라미터 경로 접두사 |

### 4.2 데이터 레이크 변수

| 변수명 | 타입 | 기본값 | 설명 |
|--------|------|--------|------|
| `datalake_bucket_suffix` | string | `datalake` | 데이터 레이크 버킷 접미사 |
| `scripts_bucket_suffix` | string | `scripts` | Glue 스크립트 버킷 접미사 |
| `artifacts_bucket_suffix` | string | `artifacts` | Lambda 패키지 버킷 접미사 |
| `athena_results_bucket_suffix` | string | `athena-results` | Athena 결과 버킷 접미사 |

### 4.3 파이프라인 변수

| 변수명 | 타입 | 기본값 | 설명 |
|--------|------|--------|------|
| `glue_python_version` | string | `"3.9"` | Glue Python Shell 버전 |
| `glue_job_timeout_minutes` | number | `60` | Glue Job 타임아웃 (분) |
| `lambda_timeout_seconds` | number | `300` | Lambda 기본 타임아웃 (초) |
| `lambda_memory_mb` | number | `512` | Lambda 메모리 (MB) |

---

## 5. 주요 Terraform 출력 목록

```hcl
# envs/revenue-dev/outputs.tf

output "datalake_bucket_name" {
  description = "데이터 레이크 S3 버킷 이름"
  value       = module.revenue_data_lake.datalake_bucket_name
}

output "glue_database_name" {
  description = "Glue Data Catalog 데이터베이스 이름"
  value       = module.revenue_glue_catalog.database_name
}

output "athena_workgroup_name" {
  description = "Athena 워크그룹 이름"
  value       = module.revenue_athena.workgroup_name
}

output "state_machine_arn" {
  description = "Step Functions 스테이트 머신 ARN"
  value       = module.revenue_step_functions.state_machine_arn
}

output "lambda_function_arns" {
  description = "Lambda 함수 ARN 목록"
  value       = module.revenue_lambda_extractors.function_arns
}

output "glue_job_names" {
  description = "Glue Job 이름 목록"
  value       = module.revenue_glue_jobs.job_names
}

output "ssm_parameter_prefix" {
  description = "SSM 파라미터 경로 접두사"
  value       = var.ssm_prefix
}
```

---

## 6. 배포 전 주의사항

### 6.1 M3에서 실제 배포는 선택 사항

M3의 목표는 Terraform 스켈레톤이 존재하고 `terraform validate`가 통과하는 것이다. 실제 AWS 배포는 M4 또는 v1 단계에서 수행한다.

**M3 Terraform 완료 기준**:
- [ ] 모든 모듈 디렉토리 및 파일 존재
- [ ] `terraform fmt -recursive` 통과
- [ ] `terraform validate` 통과
- [ ] 실제 AWS 리소스 생성은 선택 사항

### 6.2 배포 전 필수 확인 사항

실제 AWS 배포 시 아래 사항을 반드시 확인한다:

```bash
# 1. Terraform 포맷 확인
terraform fmt -recursive

# 2. 문법 검증
terraform validate

# 3. 실행 계획 검토 (반드시 확인 후 apply)
terraform plan -out=tfplan

# 4. 계획 파일로 적용
terraform apply tfplan
```

**절대 하지 말아야 할 것**:
- `terraform apply -auto-approve` (계획 검토 없이 적용)
- `tfstate` 파일을 Git에 커밋 (`terraform.tfstate`, `terraform.tfstate.backup`)
- `tfvars` 파일에 실제 API 키, 비밀번호 저장 후 커밋

### 6.3 .gitignore 필수 항목

```
# Terraform
*.tfstate
*.tfstate.*
.terraform/
.terraform.lock.hcl
terraform.tfvars
*.tfvars.json

# 환경 변수
.env
.env.*
!.env.example
```

### 6.4 원격 상태 관리

```hcl
# envs/revenue-dev/backend.tf

terraform {
  backend "s3" {
    bucket         = "revenue-ops-terraform-state-{account_id}"
    key            = "revenue-dev/terraform.tfstate"
    region         = "ap-northeast-2"
    encrypt        = true
    dynamodb_table = "revenue-ops-terraform-locks"
  }
}
```

원격 상태 버킷과 DynamoDB 락 테이블은 `bootstrap/` 에서 먼저 생성한다.

---

## 7. 관련 문서

| 문서 | 경로 |
|------|------|
| AWS Serverless ETL 설계 | `docs/m3_aws_serverless_etl_design_kr.md` |
| AWS 배포 런북 | `docs/m3_aws_deployment_runbook_kr.md` |
| M3 완료 체크리스트 | `docs/m3_completion_checklist_kr.md` |
