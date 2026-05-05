variable "name_prefix" {
  type        = string
  description = "Common name prefix for all resources."
}

variable "glue_role_arn" {
  type        = string
  description = "ARN of the IAM role used by Glue ETL jobs."
}

variable "data_lake_bucket_id" {
  type        = string
  description = "Name (ID) of the data lake S3 bucket — used for script location and job arguments."
}

variable "glue_database_name" {
  type        = string
  description = "Glue Data Catalog database name passed to job default arguments."
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
