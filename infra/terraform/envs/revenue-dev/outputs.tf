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
