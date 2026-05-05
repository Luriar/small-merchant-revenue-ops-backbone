variable "project_name" {
  type        = string
  default     = "revenue-ops"
  description = "Project name used as a resource naming prefix."
}

variable "environment" {
  type        = string
  default     = "revenue-dev"
  description = "Deployment environment name."
}

variable "aws_region" {
  type        = string
  default     = "ap-northeast-2"
  description = "AWS region for all resources."
}

variable "enable_schedule" {
  type        = bool
  default     = false
  description = "Enable the EventBridge Scheduler that triggers the daily pipeline. Set to true only when ready for automated runs."
}

variable "schedule_expression" {
  type        = string
  default     = "cron(0 2 * * ? *)"
  description = "EventBridge Scheduler cron expression. Default: 2:00 AM UTC daily."
}

variable "data_lake_bucket_name" {
  type        = string
  description = "Name of the S3 bucket used as the data lake (bronze/silver/gold layers)."
}

variable "athena_results_bucket_name" {
  type        = string
  description = "Name of the S3 bucket used to store Athena query results."
}

variable "glue_database_name" {
  type        = string
  default     = "revenue_ops_dev"
  description = "Name of the Glue Data Catalog database."
}

variable "use_kms" {
  type        = bool
  default     = false
  description = "Enable KMS encryption for S3 buckets and SSM SecureString parameters. When false, AES256 is used."
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Additional tags merged onto all resources."
}
