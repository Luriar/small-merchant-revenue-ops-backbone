################################################################################
# Airflow MWAA Module
#
# 사이즈: small (네 결정)
# DAG 배포: S3 (mwaa-dags-bucket)
# 네트워크: private app subnet (인터넷 outbound는 NAT 통해 PyPI 등)
#
# Production 전환: 같은 MWAA, size를 mw1.medium / mw1.large로 변경.
################################################################################

terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
data "aws_partition" "current" {}

################################################################################
# DAGs S3 bucket
################################################################################

resource "aws_s3_bucket" "dags" {
  bucket        = "${var.project_name}-mwaa-dags"
  force_destroy = true # 데모용 — production은 false

  tags = merge(var.tags, { Name = "${var.project_name}-mwaa-dags" })
}

resource "aws_s3_bucket_versioning" "dags" {
  bucket = aws_s3_bucket.dags.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "dags" {
  bucket = aws_s3_bucket.dags.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

################################################################################
# Security Group — MWAA가 사용
################################################################################

resource "aws_security_group" "mwaa" {
  name        = "${var.project_name}-mwaa-sg"
  description = "MWAA Airflow"
  vpc_id      = var.vpc_id

  ingress {
    description = "Self"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    self        = true
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, { Name = "${var.project_name}-mwaa-sg" })
}

################################################################################
# IAM — MWAA Execution Role
################################################################################

resource "aws_iam_role" "mwaa" {
  name = "${var.project_name}-mwaa-execution-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = ["airflow.amazonaws.com", "airflow-env.amazonaws.com"]
      }
      Action = "sts:AssumeRole"
    }]
  })
  tags = merge(var.tags, { Name = "${var.project_name}-mwaa-execution-role" })
}

# MWAA 표준 IAM (CloudWatch, S3, KMS, etc)
resource "aws_iam_role_policy" "mwaa" {
  name = "mwaa-execution-policy"
  role = aws_iam_role.mwaa.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "airflow:PublishMetrics"
        Resource = "arn:${data.aws_partition.current.partition}:airflow:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:environment/${var.project_name}-airflow"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListAllMyBuckets"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:*"]
        Resource = [aws_s3_bucket.dags.arn, "${aws_s3_bucket.dags.arn}/*"]
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:CreateLogGroup",
          "logs:PutLogEvents",
          "logs:GetLogEvents",
          "logs:GetLogRecord",
          "logs:GetLogGroupFields",
          "logs:GetQueryResults",
          "logs:DescribeLogGroups",
        ]
        Resource = "arn:${data.aws_partition.current.partition}:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:airflow-${var.project_name}-airflow-*"
      },
      {
        Effect   = "Allow"
        Action   = "cloudwatch:PutMetricData"
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:ChangeMessageVisibility",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:GetQueueUrl",
          "sqs:ReceiveMessage",
          "sqs:SendMessage",
        ]
        Resource = "arn:${data.aws_partition.current.partition}:sqs:${data.aws_region.current.name}:*:airflow-celery-*"
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:DescribeKey",
          "kms:GenerateDataKey*",
          "kms:Encrypt",
        ]
        Resource = "*"
        Condition = {
          StringLike = {
            "kms:ViaService" = ["sqs.${data.aws_region.current.name}.amazonaws.com"]
          }
        }
      },
      # Airflow → MSK (CDC trigger DAG, anomaly detection batch 등에서 Kafka 메시지 발행 가능)
      {
        Effect = "Allow"
        Action = [
          "kafka-cluster:Connect",
          "kafka-cluster:WriteData",
          "kafka-cluster:ReadData",
          "kafka-cluster:DescribeTopic",
          "kafka-cluster:CreateTopic",
          "kafka-cluster:AlterGroup",
          "kafka-cluster:DescribeGroup",
        ]
        Resource = [
          var.msk_cluster_arn,
          "${var.msk_cluster_arn}/*",
        ]
      },
    ]
  })
}

################################################################################
# MWAA Environment
################################################################################

resource "aws_mwaa_environment" "main" {
  name = "${var.project_name}-airflow"

  airflow_version       = var.airflow_version
  environment_class     = var.environment_class
  max_workers           = var.max_workers
  min_workers           = var.min_workers
  schedulers            = var.schedulers
  webserver_access_mode = "PRIVATE_ONLY" # private subnet 안에서만 접근

  source_bucket_arn = aws_s3_bucket.dags.arn
  dag_s3_path       = "dags"

  execution_role_arn = aws_iam_role.mwaa.arn

  network_configuration {
    security_group_ids = [aws_security_group.mwaa.id]
    subnet_ids         = slice(var.private_app_subnet_ids, 0, 2) # MWAA는 정확히 2 AZ
  }

  logging_configuration {
    dag_processing_logs {
      enabled   = true
      log_level = "INFO"
    }
    scheduler_logs {
      enabled   = true
      log_level = "INFO"
    }
    task_logs {
      enabled   = true
      log_level = "INFO"
    }
    webserver_logs {
      enabled   = true
      log_level = "INFO"
    }
    worker_logs {
      enabled   = true
      log_level = "INFO"
    }
  }

  airflow_configuration_options = {
    "core.load_examples" = "False"
  }

  tags = merge(var.tags, { Name = "${var.project_name}-airflow" })
}
