################################################################################
# Revenue Lambda Extractors
#
# These functions pull raw data from external APIs and land it in the
# bronze/ prefix of the data lake.
#
# Functions:
#   fetch_weather_asos   — KMA ASOS daily weather observations
#   fetch_holidays       — Public holiday calendar (data.go.kr)
#   fetch_local_events   — Seoul local events (Seoul OpenAPI)
#
# Deployment note:
#   The placeholder ZIP is used for initial provisioning.
#   Real code is deployed via CI/CD (s3_bucket + s3_key) or a separate
#   `aws lambda update-function-code` step. Set `source_code_hash` to
#   filebase64sha256() of the actual ZIP for proper drift detection.
################################################################################

################################################################################
# Placeholder ZIP archives (inline Python stub)
################################################################################

data "archive_file" "fetch_weather_asos_placeholder" {
  type        = "zip"
  output_path = "${path.module}/placeholder_fetch_weather_asos.zip"

  source {
    content  = <<-PYTHON
      # Placeholder — replace with real implementation before first run
      import json

      def handler(event, context):
          print("fetch_weather_asos placeholder — deploy real code via CI/CD")
          return {"statusCode": 200, "body": json.dumps({"status": "placeholder"})}
    PYTHON
    filename = "fetch_weather_asos.py"
  }
}

data "archive_file" "fetch_holidays_placeholder" {
  type        = "zip"
  output_path = "${path.module}/placeholder_fetch_holidays.zip"

  source {
    content  = <<-PYTHON
      # Placeholder — replace with real implementation before first run
      import json

      def handler(event, context):
          print("fetch_holidays placeholder — deploy real code via CI/CD")
          return {"statusCode": 200, "body": json.dumps({"status": "placeholder"})}
    PYTHON
    filename = "fetch_holidays.py"
  }
}

data "archive_file" "fetch_local_events_placeholder" {
  type        = "zip"
  output_path = "${path.module}/placeholder_fetch_local_events.zip"

  source {
    content  = <<-PYTHON
      # Placeholder — replace with real implementation before first run
      import json

      def handler(event, context):
          print("fetch_local_events placeholder — deploy real code via CI/CD")
          return {"statusCode": 200, "body": json.dumps({"status": "placeholder"})}
    PYTHON
    filename = "fetch_local_events.py"
  }
}

################################################################################
# fetch_weather_asos
################################################################################

resource "aws_lambda_function" "fetch_weather_asos" {
  function_name = "${var.name_prefix}-fetch-weather-asos"
  description   = "Fetches daily ASOS weather observations from KMA and lands them in S3 bronze/."
  role          = var.lambda_role_arn
  runtime       = "python3.11"
  handler       = "fetch_weather_asos.handler"
  timeout       = 300
  memory_size   = 256

  filename         = data.archive_file.fetch_weather_asos_placeholder.output_path
  source_code_hash = data.archive_file.fetch_weather_asos_placeholder.output_base64sha256

  environment {
    variables = {
      DATA_LAKE_BUCKET = var.data_lake_bucket_id
      ENVIRONMENT      = var.environment_name
      SSM_PREFIX       = "/${var.name_prefix}"
    }
  }

  tags = merge(var.tags, {
    Name     = "${var.name_prefix}-fetch-weather-asos"
    Function = "extractor"
    Source   = "kma-asos"
  })
}

################################################################################
# fetch_holidays
################################################################################

resource "aws_lambda_function" "fetch_holidays" {
  function_name = "${var.name_prefix}-fetch-holidays"
  description   = "Fetches South Korean public holiday calendar from data.go.kr and lands it in S3 bronze/."
  role          = var.lambda_role_arn
  runtime       = "python3.11"
  handler       = "fetch_holidays.handler"
  timeout       = 120
  memory_size   = 128

  filename         = data.archive_file.fetch_holidays_placeholder.output_path
  source_code_hash = data.archive_file.fetch_holidays_placeholder.output_base64sha256

  environment {
    variables = {
      DATA_LAKE_BUCKET = var.data_lake_bucket_id
      ENVIRONMENT      = var.environment_name
      SSM_PREFIX       = "/${var.name_prefix}"
    }
  }

  tags = merge(var.tags, {
    Name     = "${var.name_prefix}-fetch-holidays"
    Function = "extractor"
    Source   = "data-go-kr"
  })
}

################################################################################
# fetch_local_events
################################################################################

resource "aws_lambda_function" "fetch_local_events" {
  function_name = "${var.name_prefix}-fetch-local-events"
  description   = "Fetches Seoul local event data from the Seoul OpenAPI and lands it in S3 bronze/."
  role          = var.lambda_role_arn
  runtime       = "python3.11"
  handler       = "fetch_local_events.handler"
  timeout       = 300
  memory_size   = 256

  filename         = data.archive_file.fetch_local_events_placeholder.output_path
  source_code_hash = data.archive_file.fetch_local_events_placeholder.output_base64sha256

  environment {
    variables = {
      DATA_LAKE_BUCKET = var.data_lake_bucket_id
      ENVIRONMENT      = var.environment_name
      SSM_PREFIX       = "/${var.name_prefix}"
    }
  }

  tags = merge(var.tags, {
    Name     = "${var.name_prefix}-fetch-local-events"
    Function = "extractor"
    Source   = "seoul-openapi"
  })
}
