variable "workgroup_name" {
  type        = string
  description = "Name of the Athena workgroup."
}

variable "athena_results_bucket_id" {
  type        = string
  description = "Name (ID) of the S3 bucket used for Athena query results."
}

variable "athena_results_bucket_arn" {
  type        = string
  description = "ARN of the S3 bucket used for Athena query results."
}

variable "name_prefix" {
  type        = string
  description = "Common name prefix for all resources."
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Tags applied to all resources in this module."
}
