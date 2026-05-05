variable "enable_artifacts" {
  type        = bool
  default     = false
  description = "Enable the S3 artifact bucket for export-backed JSON and deployable packages."
}

variable "artifact_bucket_name" {
  type        = string
  default     = null
  description = "S3 bucket for export-backed JSON and deployment artifacts."

  validation {
    condition     = !var.enable_artifacts || (var.artifact_bucket_name != null && length(var.artifact_bucket_name) > 0)
    error_message = "artifact_bucket_name is required when enable_artifacts is true."
  }
}

variable "use_kms" {
  type        = bool
  default     = false
  description = "Use the shared KMS key when true; otherwise use AES256."
}

variable "kms_key_arn" {
  type        = string
  default     = ""
  description = "Shared KMS key ARN. Required when use_kms is true."
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
