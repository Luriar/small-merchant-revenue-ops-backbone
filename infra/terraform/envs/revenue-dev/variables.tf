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

variable "enable_frontend" {
  type        = bool
  default     = false
  description = "Enable the S3 + CloudFront + Route 53 frontend hosting foundation."
}

variable "enable_api" {
  type        = bool
  default     = false
  description = "Enable the API Gateway + Lambda Revenue Ops API foundation."
}

variable "enable_auth" {
  type        = bool
  default     = false
  description = "Enable the Cognito auth foundation."
}

variable "enable_aurora" {
  type        = bool
  default     = false
  description = "Enable the Aurora Serverless v2 persistence foundation."
}

variable "enable_artifacts" {
  type        = bool
  default     = false
  description = "Enable the S3 artifact bucket for export-backed JSON and deployable packages."
}

variable "enable_saas_observability" {
  type        = bool
  default     = false
  description = "Enable CloudWatch alarms/logs for the SaaS frontend/API foundation."
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

variable "artifact_bucket_name" {
  type        = string
  default     = null
  description = "Optional S3 bucket for export-backed JSON and Lambda/package artifacts. Required when enable_artifacts is true."
}

variable "frontend_bucket_name" {
  type        = string
  default     = null
  description = "Optional S3 bucket for the React/Vite static frontend. Required when enable_frontend is true."
}

variable "frontend_domain_aliases" {
  type        = list(string)
  default     = []
  description = "Optional CloudFront aliases such as app.example.com. Requires a us-east-1 ACM certificate."
}

variable "frontend_hosted_zone_id" {
  type        = string
  default     = null
  description = "Optional Route 53 hosted zone ID for frontend DNS records."
}

variable "frontend_acm_certificate_arn" {
  type        = string
  default     = null
  description = "Optional us-east-1 ACM certificate ARN for frontend CloudFront aliases."
}

variable "create_frontend_dns_records" {
  type        = bool
  default     = false
  description = "Create Route 53 alias records for frontend_domain_aliases."
}

variable "api_lambda_s3_bucket" {
  type        = string
  default     = null
  description = "Optional S3 bucket containing the Revenue Ops API Lambda artifact. Required when enable_api is true."
}

variable "api_lambda_s3_key" {
  type        = string
  default     = null
  description = "Optional S3 key for the Revenue Ops API Lambda artifact. Required when enable_api is true."
}

variable "api_custom_domain_name" {
  type        = string
  default     = null
  description = "Optional API Gateway custom domain."
}

variable "api_acm_certificate_arn" {
  type        = string
  default     = null
  description = "Optional regional ACM certificate ARN for the API Gateway custom domain."
}

variable "api_hosted_zone_id" {
  type        = string
  default     = null
  description = "Optional Route 53 hosted zone ID for the API custom domain."
}

variable "create_api_dns_record" {
  type        = bool
  default     = false
  description = "Create a Route 53 alias record for api_custom_domain_name."
}

variable "enable_api_xray" {
  type        = bool
  default     = true
  description = "Enable X-Ray tracing for the Revenue Ops API Lambda."
}

variable "cognito_callback_urls" {
  type        = list(string)
  default     = []
  description = "Allowed Cognito app client callback URLs."
}

variable "cognito_logout_urls" {
  type        = list(string)
  default     = []
  description = "Allowed Cognito app client logout URLs."
}

variable "cognito_domain_prefix" {
  type        = string
  default     = null
  description = "Optional Cognito hosted UI domain prefix."
}

variable "aurora_vpc_id" {
  type        = string
  default     = null
  description = "VPC ID for Aurora Serverless v2. Required when enable_aurora is true."
}

variable "aurora_private_subnet_ids" {
  type        = list(string)
  default     = []
  description = "Private subnet IDs for Aurora Serverless v2. Required when enable_aurora is true."
}

variable "aurora_allowed_security_group_ids" {
  type        = list(string)
  default     = []
  description = "Security groups allowed to connect to Aurora."
}

variable "aurora_database_name" {
  type        = string
  default     = "revenue_ops"
  description = "Initial Aurora database name."
}

variable "aurora_master_username" {
  type        = string
  default     = "revenue_ops_admin"
  description = "Aurora master username. Password is generated and stored in Secrets Manager."
}

variable "aurora_min_acu" {
  type        = number
  default     = 0.5
  description = "Aurora Serverless v2 minimum ACU."
}

variable "aurora_max_acu" {
  type        = number
  default     = 1
  description = "Aurora Serverless v2 maximum ACU for the initial small-merchant dev foundation."
}

variable "alarm_actions" {
  type        = list(string)
  default     = []
  description = "Optional SNS topic ARNs or other alarm action ARNs."
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
