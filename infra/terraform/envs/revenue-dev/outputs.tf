# ─── ETL pipeline foundation outputs ─────────────────────────────────────────
# These outputs are null (or []) when enable_pipeline_foundation = false.

output "data_lake_bucket_name" {
  description = "S3 data lake bucket name (bronze/silver/gold layers). Null when pipeline disabled."
  value       = try(module.data_lake[0].data_lake_bucket_id, null)
}

output "athena_results_bucket_name" {
  description = "S3 bucket name for Athena query results. Null when pipeline disabled."
  value       = try(module.data_lake[0].athena_results_bucket_id, null)
}

output "glue_database_name" {
  description = "Glue Data Catalog database name. Null when pipeline disabled."
  value       = try(module.glue_catalog[0].glue_database_name, null)
}

output "athena_workgroup_name" {
  description = "Athena workgroup name. Null when pipeline disabled."
  value       = try(module.athena[0].workgroup_name, null)
}

output "step_function_arn" {
  description = "ARN of the Step Functions state machine (medallion pipeline). Null when pipeline disabled."
  value       = try(module.step_functions[0].state_machine_arn, null)
}

output "lambda_role_arn" {
  description = "IAM role ARN used by Lambda extractor functions. Null when pipeline disabled."
  value       = try(module.iam[0].lambda_role_arn, null)
}

output "glue_role_arn" {
  description = "IAM role ARN used by Glue ETL jobs. Null when pipeline disabled."
  value       = try(module.iam[0].glue_role_arn, null)
}

output "schedule_name" {
  description = "EventBridge Scheduler schedule name. Null when pipeline disabled."
  value       = try(module.eventbridge[0].schedule_name, null)
}

output "secrets_parameter_names" {
  description = "List of SSM Parameter Store parameter names for API keys and config. Empty list when pipeline disabled."
  value       = try(module.secrets[0].secrets_parameter_names, [])
}

# ─── SaaS surface outputs ─────────────────────────────────────────────────────
# These outputs follow the individual enable_* flag for each module.

output "artifact_bucket_name" {
  description = "S3 bucket for export-backed JSON and API/frontend deployment artifacts. Null when disabled."
  value       = module.artifacts.artifact_bucket_name
}

output "frontend_bucket_name" {
  description = "S3 bucket used as the private CloudFront origin for the frontend. Null when disabled."
  value       = module.frontend_hosting.frontend_bucket_name
}

output "frontend_cloudfront_domain_name" {
  description = "CloudFront domain name for the frontend distribution. Null when disabled."
  value       = module.frontend_hosting.cloudfront_domain_name
}

output "api_endpoint" {
  description = "HTTP API endpoint for the Revenue Ops API. Null when disabled."
  value       = module.revenue_api.api_endpoint
}

output "cognito_user_pool_id" {
  description = "Cognito user pool ID for small-merchant SaaS auth. Null when disabled."
  value       = module.auth.user_pool_id
}

output "aurora_cluster_endpoint" {
  description = "Aurora Serverless v2 writer endpoint. Null when disabled."
  value       = module.aurora.cluster_endpoint
}

output "aurora_master_secret_arn" {
  description = "Secrets Manager secret ARN containing Aurora master credentials. Null when disabled."
  value       = module.aurora.master_secret_arn
}
