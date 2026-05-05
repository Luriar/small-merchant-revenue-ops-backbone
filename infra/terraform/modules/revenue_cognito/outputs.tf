output "user_pool_id" {
  description = "Cognito user pool ID, or null when disabled."
  value       = var.enable_auth ? aws_cognito_user_pool.main[0].id : null
}

output "user_pool_arn" {
  description = "Cognito user pool ARN, or null when disabled."
  value       = var.enable_auth ? aws_cognito_user_pool.main[0].arn : null
}

output "web_client_id" {
  description = "Cognito web app client ID, or null when disabled."
  value       = var.enable_auth ? aws_cognito_user_pool_client.web[0].id : null
}

output "domain_prefix" {
  description = "Cognito hosted UI domain prefix, or null when disabled."
  value       = var.enable_auth && var.domain_prefix != null ? aws_cognito_user_pool_domain.main[0].domain : null
}
