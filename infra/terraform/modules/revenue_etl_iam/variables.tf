variable "name_prefix" {
  type        = string
  description = "Common name prefix for all resources."
}

variable "data_lake_bucket_arn" {
  type        = string
  description = "ARN of the data lake S3 bucket."
}

variable "use_kms" {
  type        = bool
  default     = false
  description = "When true, grants KMS decrypt/encrypt permissions to the IAM roles."
}

variable "kms_key_arn" {
  type        = string
  default     = ""
  description = "ARN of the KMS key used for bucket encryption. Required when use_kms = true."
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Tags applied to all resources in this module."
}
