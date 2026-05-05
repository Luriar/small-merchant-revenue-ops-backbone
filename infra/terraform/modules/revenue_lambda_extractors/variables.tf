variable "name_prefix" {
  type        = string
  description = "Common name prefix for all resources."
}

variable "lambda_role_arn" {
  type        = string
  description = "ARN of the IAM role to attach to all Lambda functions."
}

variable "data_lake_bucket_id" {
  type        = string
  description = "Name (ID) of the data lake S3 bucket."
}

variable "data_lake_bucket_arn" {
  type        = string
  description = "ARN of the data lake S3 bucket."
}

variable "environment_name" {
  type        = string
  description = "Deployment environment name (e.g. revenue-dev)."
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Tags applied to all resources in this module."
}
