variable "enable_frontend" {
  type        = bool
  default     = false
  description = "Enable S3 + CloudFront frontend hosting."
}

variable "frontend_bucket_name" {
  type        = string
  default     = null
  description = "S3 bucket for the private frontend origin."

  validation {
    condition     = !var.enable_frontend || (var.frontend_bucket_name != null && length(var.frontend_bucket_name) > 0)
    error_message = "frontend_bucket_name is required when enable_frontend is true."
  }
}

variable "domain_aliases" {
  type        = list(string)
  default     = []
  description = "CloudFront aliases such as app.example.com."
}

variable "hosted_zone_id" {
  type        = string
  default     = null
  description = "Route 53 hosted zone ID for frontend DNS records."
}

variable "acm_certificate_arn" {
  type        = string
  default     = null
  description = "ACM certificate ARN in us-east-1 for CloudFront aliases."

  validation {
    condition     = !var.enable_frontend || length(var.domain_aliases) == 0 || var.acm_certificate_arn != null
    error_message = "acm_certificate_arn is required when domain_aliases are configured."
  }
}

variable "create_dns_records" {
  type        = bool
  default     = false
  description = "Create Route 53 alias records for domain_aliases."

  validation {
    condition     = !var.enable_frontend || !var.create_dns_records || var.hosted_zone_id != null
    error_message = "hosted_zone_id is required when create_dns_records is true."
  }
}

variable "artifact_bucket_arn" {
  type        = string
  default     = null
  description = "Optional artifact bucket ARN for future deployment read permissions."
}

variable "artifact_bucket_name" {
  type        = string
  default     = null
  description = "Optional artifact bucket name for future deployment references."
}

variable "price_class" {
  type        = string
  default     = "PriceClass_100"
  description = "CloudFront price class for cost control."
}

variable "name_prefix" {
  type        = string
  description = "Common resource name prefix."
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Tags applied to resources."
}
