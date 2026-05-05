output "log_group_names" {
  description = "SaaS runtime log groups created by this module."
  value       = aws_cloudwatch_log_group.api_lambda[*].name
}

output "alarm_names" {
  description = "SaaS runtime CloudWatch alarm names."
  value = concat(
    aws_cloudwatch_metric_alarm.api_lambda_errors[*].alarm_name,
    aws_cloudwatch_metric_alarm.api_gateway_5xx[*].alarm_name,
    aws_cloudwatch_metric_alarm.cloudfront_5xx_rate[*].alarm_name,
  )
}
