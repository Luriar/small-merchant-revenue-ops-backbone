################################################################################
# Revenue ETL IAM Roles & Policies
#
# Roles:
#   lambda_extractor  — Lambda functions that pull data from external APIs
#   glue_job          — Glue ETL transformation jobs
#   step_functions    — Step Functions state machine orchestrating the pipeline
#   eventbridge_invoke — EventBridge Scheduler that triggers the state machine
################################################################################

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

################################################################################
# Lambda Extractor Role
################################################################################

data "aws_iam_policy_document" "lambda_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda_extractor" {
  name               = "${var.name_prefix}-lambda-extractor"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-lambda-extractor"
  })
}

data "aws_iam_policy_document" "lambda_extractor_permissions" {
  # CloudWatch Logs
  statement {
    sid    = "CloudWatchLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${var.name_prefix}-*:*"]
  }

  # S3 — write to bronze layer only
  statement {
    sid    = "S3BronzeWrite"
    effect = "Allow"
    actions = [
      "s3:PutObject",
      "s3:PutObjectAcl",
    ]
    resources = ["${var.data_lake_bucket_arn}/bronze/*"]
  }

  # S3 — read bucket location
  statement {
    sid       = "S3GetBucketLocation"
    effect    = "Allow"
    actions   = ["s3:GetBucketLocation"]
    resources = [var.data_lake_bucket_arn]
  }

  # SSM Parameter Store
  statement {
    sid    = "SSMGetParameters"
    effect = "Allow"
    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
      "ssm:GetParametersByPath",
    ]
    resources = ["arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter/${var.name_prefix}/*"]
  }

  # Secrets Manager
  statement {
    sid    = "SecretsManagerGet"
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret",
    ]
    resources = ["arn:aws:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:${var.name_prefix}/*"]
  }
}

data "aws_iam_policy_document" "lambda_extractor_kms" {
  count = var.use_kms ? 1 : 0

  statement {
    sid    = "KMSEncryptDecrypt"
    effect = "Allow"
    actions = [
      "kms:GenerateDataKey",
      "kms:Decrypt",
      "kms:DescribeKey",
    ]
    resources = [var.kms_key_arn]
  }
}

resource "aws_iam_policy" "lambda_extractor" {
  name   = "${var.name_prefix}-lambda-extractor-policy"
  policy = data.aws_iam_policy_document.lambda_extractor_permissions.json

  tags = var.tags
}

resource "aws_iam_policy" "lambda_extractor_kms" {
  count = var.use_kms ? 1 : 0

  name   = "${var.name_prefix}-lambda-extractor-kms-policy"
  policy = data.aws_iam_policy_document.lambda_extractor_kms[0].json

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "lambda_extractor" {
  role       = aws_iam_role.lambda_extractor.name
  policy_arn = aws_iam_policy.lambda_extractor.arn
}

resource "aws_iam_role_policy_attachment" "lambda_extractor_kms" {
  count      = var.use_kms ? 1 : 0
  role       = aws_iam_role.lambda_extractor.name
  policy_arn = aws_iam_policy.lambda_extractor_kms[0].arn
}

################################################################################
# Glue Job Role
################################################################################

data "aws_iam_policy_document" "glue_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["glue.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "glue_job" {
  name               = "${var.name_prefix}-glue-job"
  assume_role_policy = data.aws_iam_policy_document.glue_trust.json

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-glue-job"
  })
}

# Attach the AWS managed Glue service role for basic Glue functionality
resource "aws_iam_role_policy_attachment" "glue_service" {
  role       = aws_iam_role.glue_job.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSGlueServiceRole"
}

data "aws_iam_policy_document" "glue_job_permissions" {
  # S3 full access to data lake
  statement {
    sid    = "S3DataLakeReadWrite"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:ListBucket",
      "s3:GetBucketLocation",
    ]
    resources = [
      var.data_lake_bucket_arn,
      "${var.data_lake_bucket_arn}/*",
    ]
  }

  # Glue catalog read/write
  statement {
    sid    = "GlueCatalog"
    effect = "Allow"
    actions = [
      "glue:GetDatabase",
      "glue:GetDatabases",
      "glue:GetTable",
      "glue:GetTables",
      "glue:GetPartition",
      "glue:GetPartitions",
      "glue:BatchCreatePartition",
      "glue:CreatePartition",
      "glue:UpdatePartition",
      "glue:UpdateTable",
    ]
    resources = ["*"]
  }

  # CloudWatch Logs
  statement {
    sid    = "CloudWatchLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/glue/*:*"]
  }

  # Athena query execution (for gold layer queries)
  statement {
    sid    = "AthenaQueryExecution"
    effect = "Allow"
    actions = [
      "athena:StartQueryExecution",
      "athena:GetQueryExecution",
      "athena:GetQueryResults",
      "athena:StopQueryExecution",
      "athena:GetWorkGroup",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "glue_job" {
  name   = "${var.name_prefix}-glue-job-policy"
  policy = data.aws_iam_policy_document.glue_job_permissions.json

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "glue_job" {
  role       = aws_iam_role.glue_job.name
  policy_arn = aws_iam_policy.glue_job.arn
}

################################################################################
# Step Functions Role
################################################################################

data "aws_iam_policy_document" "step_functions_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["states.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_iam_role" "step_functions" {
  name               = "${var.name_prefix}-step-functions"
  assume_role_policy = data.aws_iam_policy_document.step_functions_trust.json

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-step-functions"
  })
}

data "aws_iam_policy_document" "step_functions_permissions" {
  # Invoke Lambda functions
  statement {
    sid    = "LambdaInvoke"
    effect = "Allow"
    actions = [
      "lambda:InvokeFunction",
    ]
    resources = ["arn:aws:lambda:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:function:${var.name_prefix}-*"]
  }

  # Glue job control
  statement {
    sid    = "GlueJobControl"
    effect = "Allow"
    actions = [
      "glue:StartJobRun",
      "glue:GetJobRun",
      "glue:GetJobRuns",
      "glue:BatchStopJobRun",
    ]
    resources = ["arn:aws:glue:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:job/${var.name_prefix}-*"]
  }

  # CloudWatch Logs for state machine execution history
  statement {
    sid    = "CloudWatchLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogDelivery",
      "logs:GetLogDelivery",
      "logs:UpdateLogDelivery",
      "logs:DeleteLogDelivery",
      "logs:ListLogDeliveries",
      "logs:PutResourcePolicy",
      "logs:DescribeResourcePolicies",
      "logs:DescribeLogGroups",
    ]
    resources = ["*"]
  }

  # CloudWatch Metrics
  statement {
    sid    = "CloudWatchMetrics"
    effect = "Allow"
    actions = [
      "cloudwatch:PutMetricData",
    ]
    resources = ["*"]
  }

  # X-Ray tracing
  statement {
    sid    = "XRayTracing"
    effect = "Allow"
    actions = [
      "xray:PutTraceSegments",
      "xray:PutTelemetryRecords",
      "xray:GetSamplingRules",
      "xray:GetSamplingTargets",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "step_functions" {
  name   = "${var.name_prefix}-step-functions-policy"
  policy = data.aws_iam_policy_document.step_functions_permissions.json

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "step_functions" {
  role       = aws_iam_role.step_functions.name
  policy_arn = aws_iam_policy.step_functions.arn
}

################################################################################
# EventBridge Scheduler Invoke Role
################################################################################

data "aws_iam_policy_document" "eventbridge_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_iam_role" "eventbridge_invoke" {
  name               = "${var.name_prefix}-eventbridge-invoke"
  assume_role_policy = data.aws_iam_policy_document.eventbridge_trust.json

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-eventbridge-invoke"
  })
}

data "aws_iam_policy_document" "eventbridge_invoke_permissions" {
  statement {
    sid    = "StartStepFunctions"
    effect = "Allow"
    actions = [
      "states:StartExecution",
    ]
    resources = ["arn:aws:states:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:stateMachine:${var.name_prefix}-*"]
  }
}

resource "aws_iam_policy" "eventbridge_invoke" {
  name   = "${var.name_prefix}-eventbridge-invoke-policy"
  policy = data.aws_iam_policy_document.eventbridge_invoke_permissions.json

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "eventbridge_invoke" {
  role       = aws_iam_role.eventbridge_invoke.name
  policy_arn = aws_iam_policy.eventbridge_invoke.arn
}
