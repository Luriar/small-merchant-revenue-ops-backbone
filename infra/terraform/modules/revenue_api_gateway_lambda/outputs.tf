output "api_id" {
  description = "API Gateway HTTP API ID, or null when disabled."
  value       = var.enable_api ? aws_apigatewayv2_api.api[0].id : null
}

output "api_endpoint" {
  description = "API Gateway endpoint, or null when disabled."
  value       = var.enable_api ? aws_apigatewayv2_api.api[0].api_endpoint : null
}

output "lambda_function_name" {
  description = "Revenue Ops API Lambda function name, or null when disabled."
  value       = var.enable_api ? aws_lambda_function.api[0].function_name : null
}

output "lambda_role_arn" {
  description = "Revenue Ops API Lambda role ARN, or null when disabled."
  value       = var.enable_api ? aws_iam_role.api_lambda[0].arn : null
}

output "lambda_alias_name" {
  description = "Lambda alias name used by API Gateway, or null when alias is disabled."
  value       = local.lambda_alias_enabled ? aws_lambda_alias.live[0].name : null
}

output "lambda_alias_arn" {
  description = "Lambda alias ARN used by API Gateway, or null when alias is disabled."
  value       = local.lambda_alias_enabled ? aws_lambda_alias.live[0].arn : null
}

output "lambda_alias_invoke_arn" {
  description = "Lambda alias invoke ARN used by API Gateway integration, or null when alias is disabled."
  value       = local.lambda_alias_enabled ? aws_lambda_alias.live[0].invoke_arn : null
}

output "codedeploy_app_name" {
  description = "CodeDeploy Lambda application name, or null when canary resources are disabled."
  value       = var.enable_api && var.enable_codedeploy_canary ? aws_codedeploy_app.lambda[0].name : null
}

output "codedeploy_deployment_group_name" {
  description = "CodeDeploy Lambda deployment group name, or null when canary resources are disabled."
  value       = local.lambda_alias_enabled && var.enable_codedeploy_canary ? aws_codedeploy_deployment_group.lambda_live[0].deployment_group_name : null
}

output "codedeploy_alarm_names" {
  description = "CloudWatch alarm names attached to the CodeDeploy Lambda deployment group."
  value = local.lambda_alias_enabled && var.enable_codedeploy_canary ? [
    aws_cloudwatch_metric_alarm.lambda_alias_errors[0].alarm_name,
    aws_cloudwatch_metric_alarm.lambda_alias_throttles[0].alarm_name,
    aws_cloudwatch_metric_alarm.lambda_alias_duration_p95[0].alarm_name,
    aws_cloudwatch_metric_alarm.api_gateway_5xx[0].alarm_name,
  ] : []
}
