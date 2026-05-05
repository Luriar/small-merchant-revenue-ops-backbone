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

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Tags applied to resources."
}
