variable "enable_observability" {
  type        = bool
  default     = false
  description = "Enable SaaS runtime CloudWatch alarms and log guardrails."
}

variable "name_prefix" {
  type        = string
  description = "Common resource name prefix."
}

variable "api_lambda_function_name" {
  type        = string
  default     = null
  description = "Revenue Ops API Lambda function name."
}

variable "api_gateway_api_id" {
  type        = string
  default     = null
  description = "API Gateway HTTP API ID."
}

variable "cloudfront_distribution_id" {
  type        = string
  default     = null
  description = "CloudFront distribution ID."
}

variable "alarm_actions" {
  type        = list(string)
  default     = []
  description = "SNS topic ARNs or other alarm action ARNs."
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Tags applied to resources."
}
