variable "glue_database_name" {
  type        = string
  description = "Name of the Glue Data Catalog database."
}

variable "data_lake_bucket_id" {
  type        = string
  description = "Name (ID) of the data lake S3 bucket — used to build table S3 locations."
}

variable "data_lake_bucket_arn" {
  type        = string
  description = "ARN of the data lake S3 bucket."
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
