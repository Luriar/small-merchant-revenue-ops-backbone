output "data_lake_bucket_name" {
  description = "S3 data lake bucket name (bronze/silver/gold layers)."
  value       = module.data_lake.data_lake_bucket_id
}

output "athena_results_bucket_name" {
  description = "S3 bucket name for Athena query results."
  value       = module.data_lake.athena_results_bucket_id
}

output "glue_database_name" {
  description = "Glue Data Catalog database name."
  value       = module.glue_catalog.glue_database_name
}

output "athena_workgroup_name" {
  description = "Athena workgroup name."
  value       = module.athena.workgroup_name
}

output "step_function_arn" {
  description = "ARN of the Step Functions state machine (medallion pipeline)."
  value       = module.step_functions.state_machine_arn
}

output "lambda_role_arn" {
  description = "IAM role ARN used by Lambda extractor functions."
  value       = module.iam.lambda_role_arn
}

output "glue_role_arn" {
  description = "IAM role ARN used by Glue ETL jobs."
  value       = module.iam.glue_role_arn
}

output "schedule_name" {
  description = "EventBridge Scheduler schedule name."
  value       = module.eventbridge.schedule_name
}

output "secrets_parameter_names" {
  description = "List of SSM Parameter Store parameter names for API keys and config."
  value       = module.secrets.secrets_parameter_names
}

output "artifact_bucket_name" {
  description = "S3 bucket for export-backed JSON and API/frontend deployment artifacts."
  value       = module.artifacts.artifact_bucket_name
}

output "frontend_bucket_name" {
  description = "S3 bucket used as the private CloudFront origin for the frontend."
  value       = module.frontend_hosting.frontend_bucket_name
}

output "frontend_cloudfront_domain_name" {
  description = "CloudFront domain name for the frontend distribution."
  value       = module.frontend_hosting.cloudfront_domain_name
}

output "api_endpoint" {
  description = "HTTP API endpoint for the Revenue Ops API."
  value       = module.revenue_api.api_endpoint
}

output "cognito_user_pool_id" {
  description = "Cognito user pool ID for small-merchant SaaS auth."
  value       = module.auth.user_pool_id
}

output "aurora_cluster_endpoint" {
  description = "Aurora Serverless v2 writer endpoint."
  value       = module.aurora.cluster_endpoint
}

output "aurora_master_secret_arn" {
  description = "Secrets Manager secret ARN containing Aurora master credentials."
  value       = module.aurora.master_secret_arn
}
