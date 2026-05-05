variable "name_prefix" {
  type        = string
  description = "Common name prefix — used to namespace SSM parameter paths."
}

variable "use_kms" {
  type        = bool
  default     = false
  description = "When true, uses a customer-managed KMS key for SecureString parameter encryption."
}

variable "kms_key_arn" {
  type        = string
  default     = ""
  description = "ARN of the KMS key for SecureString encryption. Required when use_kms = true."
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Tags applied to all resources in this module."
}
