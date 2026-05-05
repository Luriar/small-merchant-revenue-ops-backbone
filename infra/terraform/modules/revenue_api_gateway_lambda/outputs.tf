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
