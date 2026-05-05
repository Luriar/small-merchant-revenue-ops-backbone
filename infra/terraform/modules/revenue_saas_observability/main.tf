resource "aws_cloudwatch_log_group" "api_lambda" {
  count = var.enable_observability && var.api_lambda_function_name != null ? 1 : 0

  name              = "/aws/lambda/${var.api_lambda_function_name}"
  retention_in_days = 30

  tags = merge(var.tags, {
    Name = "/aws/lambda/${var.api_lambda_function_name}"
  })
}

resource "aws_cloudwatch_metric_alarm" "api_lambda_errors" {
  count = var.enable_observability && var.api_lambda_function_name != null ? 1 : 0

  alarm_name          = "${var.name_prefix}-api-lambda-errors"
  alarm_description   = "Revenue Ops API Lambda reported errors."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.alarm_actions

  dimensions = {
    FunctionName = var.api_lambda_function_name
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-api-lambda-errors"
  })
}

resource "aws_cloudwatch_metric_alarm" "api_gateway_5xx" {
  count = var.enable_observability && var.api_gateway_api_id != null ? 1 : 0

  alarm_name          = "${var.name_prefix}-api-gateway-5xx"
  alarm_description   = "Revenue Ops API Gateway returned 5xx responses."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "5xx"
  namespace           = "AWS/ApiGateway"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.alarm_actions

  dimensions = {
    ApiId = var.api_gateway_api_id
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-api-gateway-5xx"
  })
}

resource "aws_cloudwatch_metric_alarm" "cloudfront_5xx_rate" {
  count = var.enable_observability && var.cloudfront_distribution_id != null ? 1 : 0

  alarm_name          = "${var.name_prefix}-cloudfront-5xx-rate"
  alarm_description   = "Revenue Ops CloudFront 5xx error rate is elevated."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "5xxErrorRate"
  namespace           = "AWS/CloudFront"
  period              = 300
  statistic           = "Average"
  threshold           = 5
  treat_missing_data  = "notBreaching"
  alarm_actions       = var.alarm_actions

  dimensions = {
    DistributionId = var.cloudfront_distribution_id
    Region         = "Global"
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-cloudfront-5xx-rate"
  })
}
