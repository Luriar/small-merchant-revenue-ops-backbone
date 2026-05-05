variable "aws_region" {
  type    = string
  default = "ap-northeast-2"
}

variable "project_name" {
  type    = string
  default = "revenue-ops"
}

variable "environment" {
  type    = string
  default = "bootstrap"
}

variable "state_bucket_name" {
  type        = string
  description = "S3 bucket name for Terraform remote state"
}

variable "tags" {
  type    = map(string)
  default = {}
}
