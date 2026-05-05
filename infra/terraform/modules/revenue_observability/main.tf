################################################################################
# Revenue Observability — CloudWatch Log Groups & Alarms
#
# Log groups:
#   /aws/lambda/<name>          for each extractor Lambda
#   /aws/glue/jobs/<prefix>-*   for Glue ETL jobs
#   /aws/states/<prefix>-*      for Step Functions (also created in sfn module)
#
# Alarms:
#   Lambda errors (any function)    — triggers on >= 1 error in 5 min
#   Step Functions failures         — triggers on >= 1 failed execution in 5 min
################################################################################

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  # Extract state machine name from ARN: arn:aws:states:region:acct:stateMachine:name
  state_machine_name = element(split(":", var.state_machine_arn), length(split(":", var.state_machine_arn)) - 1)
}

################################################################################
# Lambda Log Groups
################################################################################

resource "aws_cloudwatch_log_group" "lambda" {
  for_each = toset(var.lambda_function_names)

  name              = "/aws/lambda/${each.value}"
  retention_in_days = 30

  tags = merge(var.tags, {
    Name = "/aws/lambda/${each.value}"
  })
}

################################################################################
# Glue Log Group (covers all Glue jobs with the same prefix)
################################################################################

resource "aws_cloudwatch_log_group" "glue_bronze_to_silver" {
  name              = "/aws/glue/jobs/${var.name_prefix}-bronze-to-silver"
  retention_in_days = 30

  tags = merge(var.tags, {
    Name = "/aws/glue/jobs/${var.name_prefix}-bronze-to-silver"
  })
}

resource "aws_cloudwatch_log_group" "glue_gold" {
  name              = "/aws/glue/jobs/${var.name_prefix}-gold"
  retention_in_days = 30

  tags = merge(var.tags, {
    Name = "/aws/glue/jobs/${var.name_prefix}-gold"
  })
}

################################################################################
# Step Functions Log Group (also created in sfn module — check for conflicts)
# Using a separate name here to avoid collision; sfn module owns the primary group.
################################################################################

resource "aws_cloudwatch_log_group" "step_functions_execution" {
  name              = "/aws/states/${var.name_prefix}-executions"
  retention_in_days = 30

  tags = merge(var.tags, {
    Name = "/aws/states/${var.name_prefix}-executions"
  })
}

################################################################################
# CloudWatch Metric Alarms
################################################################################

# Aggregate alarm across all Lambda functions — fires if any function has errors
resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  alarm_name          = "${var.name_prefix}-lambda-errors"
  alarm_description   = "Alert: One or more Revenue Ops Lambda extractors reported errors in the last 5 minutes."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  treat_missing_data  = "notBreaching"

  metric_query {
    id          = "total_errors"
    expression  = join("+", [for i, name in var.lambda_function_names : "e${i}"])
    label       = "TotalLambdaErrors"
    return_data = true
  }

  dynamic "metric_query" {
    for_each = { for i, name in var.lambda_function_names : tostring(i) => name }
    content {
      id = "e${metric_query.key}"
      metric {
        metric_name = "Errors"
        namespace   = "AWS/Lambda"
        period      = 300
        stat        = "Sum"
        dimensions = {
          FunctionName = metric_query.value
        }
      }
    }
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-lambda-errors"
  })
}

# Step Functions failed executions alarm
resource "aws_cloudwatch_metric_alarm" "step_functions_failed" {
  alarm_name          = "${var.name_prefix}-sfn-failed"
  alarm_description   = "Alert: Revenue Ops Medallion Pipeline had a failed execution in the last 5 minutes."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "ExecutionsFailed"
  namespace           = "AWS/States"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  treat_missing_data  = "notBreaching"

  dimensions = {
    StateMachineArn = var.state_machine_arn
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-sfn-failed"
  })
}

# Step Functions timed-out executions alarm
resource "aws_cloudwatch_metric_alarm" "step_functions_timed_out" {
  alarm_name          = "${var.name_prefix}-sfn-timed-out"
  alarm_description   = "Alert: Revenue Ops Medallion Pipeline had a timed-out execution."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "ExecutionsTimedOut"
  namespace           = "AWS/States"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  treat_missing_data  = "notBreaching"

  dimensions = {
    StateMachineArn = var.state_machine_arn
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-sfn-timed-out"
  })
}
