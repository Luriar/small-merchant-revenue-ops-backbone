variable "enable_api" {
  type        = bool
  default     = false
  description = "Enable API Gateway + Lambda Revenue Ops API."
}

variable "name_prefix" {
  type        = string
  description = "Common resource name prefix."
}

variable "lambda_s3_bucket" {
  type        = string
  default     = null
  description = "S3 bucket containing the API Lambda ZIP artifact."

  validation {
    condition     = !var.enable_api || (var.lambda_s3_bucket != null && length(var.lambda_s3_bucket) > 0)
    error_message = "lambda_s3_bucket is required when enable_api is true."
  }
}

variable "lambda_s3_key" {
  type        = string
  default     = null
  description = "S3 key for the API Lambda ZIP artifact."

  validation {
    condition     = !var.enable_api || (var.lambda_s3_key != null && length(var.lambda_s3_key) > 0)
    error_message = "lambda_s3_key is required when enable_api is true."
  }
}

variable "artifact_bucket_name" {
  type        = string
  default     = null
  description = "Artifact/export JSON bucket name for API runtime."
}

variable "artifact_bucket_arn" {
  type        = string
  default     = null
  description = "Artifact/export JSON bucket ARN for IAM."
}

variable "aurora_secret_arn" {
  type        = string
  default     = null
  description = "Aurora credential secret ARN. Optional until Aurora persistence is enabled."
}

variable "aurora_cluster_endpoint" {
  type        = string
  default     = null
  description = "Aurora writer cluster endpoint. Optional until Aurora connectivity smoke is enabled."
}

variable "aurora_database_name" {
  type        = string
  default     = null
  description = "Aurora database name. Optional until Aurora connectivity smoke is enabled."
}

variable "aurora_port" {
  type        = number
  default     = 5432
  description = "Aurora PostgreSQL port."
}

variable "public_context_secret_id" {
  type        = string
  default     = null
  description = "Optional Secrets Manager secret ID containing Kakao/Seoul/KMA public context API credentials."
}

variable "public_context_secret_arn" {
  type        = string
  default     = null
  description = "Optional exact ARN for the public context external API credentials secret. If omitted, an ARN pattern is derived from public_context_secret_id."
}

variable "kma_default_nx" {
  type        = string
  default     = null
  description = "Optional KMA grid X fallback for live weather collection."
}

variable "kma_default_ny" {
  type        = string
  default     = null
  description = "Optional KMA grid Y fallback for live weather collection."
}

variable "kma_api_base_url" {
  type        = string
  default     = null
  description = "Optional KMA API base URL. The exact endpoint can also be supplied in Secrets Manager."
}

variable "kma_forecast_endpoint" {
  type        = string
  default     = null
  description = "Optional KMA forecast endpoint path or absolute URL."
}

variable "kma_nowcast_endpoint" {
  type        = string
  default     = null
  description = "Optional KMA nowcast endpoint path or absolute URL."
}

variable "seoul_open_data_base_url" {
  type        = string
  default     = null
  description = "Optional Seoul Open Data API base URL."
}

variable "seoul_commercial_sales_endpoint" {
  type        = string
  default     = null
  description = "Optional Seoul Open Data endpoint for commercial sales benchmarks."
}

variable "seoul_foot_traffic_endpoint" {
  type        = string
  default     = null
  description = "Optional Seoul Open Data endpoint for foot traffic or floating population proxy."
}

variable "seoul_store_density_endpoint" {
  type        = string
  default     = null
  description = "Optional Seoul Open Data endpoint for same-category store density proxy."
}

variable "bronze_bucket_name" {
  type        = string
  default     = null
  description = "Optional S3 Bronze bucket name for sanitized collector raw artifacts. The runtime keeps this disabled if no writer dependency is packaged."
}

variable "lambda_vpc_subnet_ids" {
  type        = list(string)
  default     = []
  description = "Optional private subnet IDs used to attach the API Lambda to the Revenue Ops VPC."
}

variable "lambda_vpc_security_group_ids" {
  type        = list(string)
  default     = []
  description = "Optional security group IDs used to attach the API Lambda to the Revenue Ops VPC."
}

variable "cognito_user_pool_id" {
  type        = string
  default     = null
  description = "Cognito user pool ID for API authorizer."
}

variable "cognito_user_pool_arn" {
  type        = string
  default     = null
  description = "Cognito user pool ARN for API authorizer."
}

variable "cognito_user_pool_client_id" {
  type        = string
  default     = null
  description = "Cognito app client ID used as the JWT audience."
}

variable "enable_cognito_authorizer" {
  type        = bool
  default     = false
  description = "Enable the API Gateway JWT authorizer. Keep this driven by a known boolean so planning does not depend on newly created Cognito IDs."
}

variable "custom_domain_name" {
  type        = string
  default     = null
  description = "Optional API Gateway custom domain name."
}

variable "acm_certificate_arn" {
  type        = string
  default     = null
  description = "Optional regional ACM certificate ARN for the API custom domain."

  validation {
    condition     = !var.enable_api || var.custom_domain_name == null || var.acm_certificate_arn != null
    error_message = "acm_certificate_arn is required when custom_domain_name is configured."
  }
}

variable "hosted_zone_id" {
  type        = string
  default     = null
  description = "Optional Route 53 hosted zone ID for API DNS."
}

variable "create_dns_record" {
  type        = bool
  default     = false
  description = "Create a Route 53 alias record for the API custom domain."

  validation {
    condition     = !var.enable_api || !var.create_dns_record || var.hosted_zone_id != null
    error_message = "hosted_zone_id is required when create_dns_record is true."
  }
}

variable "enable_xray" {
  type        = bool
  default     = true
  description = "Enable X-Ray tracing for the Lambda function."
}

variable "enable_lambda_versioning" {
  type        = bool
  default     = false
  description = "Publish immutable Lambda versions from Terraform-managed function code. Required for alias and CodeDeploy readiness."
}

variable "enable_lambda_alias" {
  type        = bool
  default     = false
  description = "Create a Lambda alias and wire API Gateway to the qualified alias invoke ARN."
}

variable "lambda_alias_name" {
  type        = string
  default     = "live"
  description = "Lambda alias name used by API Gateway and CodeDeploy."
}

variable "lambda_alias_initial_version" {
  type        = string
  default     = null
  description = "Optional initial Lambda version for the alias. Defaults to the Terraform-published version."
}

variable "enable_codedeploy_canary" {
  type        = bool
  default     = false
  description = "Create CodeDeploy Lambda deployment group and rollback alarms for alias traffic shifting."
}

variable "codedeploy_deployment_config_name" {
  type        = string
  default     = "CodeDeployDefault.LambdaCanary10Percent5Minutes"
  description = "CodeDeploy deployment config for Lambda canary traffic shifting."
}

variable "lambda_error_alarm_threshold" {
  type        = number
  default     = 1
  description = "Lambda alias error count threshold for canary rollback alarm."
}

variable "lambda_throttle_alarm_threshold" {
  type        = number
  default     = 1
  description = "Lambda alias throttle count threshold for canary rollback alarm."
}

variable "lambda_duration_p95_alarm_threshold_ms" {
  type        = number
  default     = 10000
  description = "Lambda alias p95 duration threshold in milliseconds for canary rollback alarm."
}

variable "api_gateway_5xx_alarm_threshold" {
  type        = number
  default     = 1
  description = "API Gateway 5xx count threshold for canary rollback alarm."
}

variable "alarm_actions" {
  type        = list(string)
  default     = []
  description = "Optional SNS topic ARNs or other alarm action ARNs for API canary rollback alarms."
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Tags applied to resources."
}
