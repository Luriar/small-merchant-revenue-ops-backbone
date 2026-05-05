variable "data_lake_bucket_name" {
  type        = string
  description = "Name of the S3 bucket used as the data lake."
}

variable "athena_results_bucket_name" {
  type        = string
  description = "Name of the S3 bucket used for Athena query results."
}

variable "use_kms" {
  type        = bool
  default     = false
  description = "When true, creates a KMS key and uses it for bucket encryption instead of AES256."
}

variable "name_prefix" {
  type        = string
  description = "Common name prefix for all resources (e.g. revenue-ops-revenue-dev)."
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Tags applied to all resources in this module."
}
