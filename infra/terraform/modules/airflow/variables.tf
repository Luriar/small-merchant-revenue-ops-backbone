variable "project_name" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "private_app_subnet_ids" {
  description = "MWAA가 ENI 배치할 subnet (정확히 2개 사용됨)"
  type        = list(string)
}

variable "msk_cluster_arn" {
  description = "MSK cluster ARN. MWAA execution role에 접근 권한 부여."
  type        = string
}

variable "airflow_version" {
  type    = string
  default = "2.10.3"
}

variable "environment_class" {
  description = "MWAA size. 데모: mw1.small. Production: mw1.medium / mw1.large"
  type        = string
  default     = "mw1.small"
}

variable "min_workers" {
  type    = number
  default = 1
}

variable "max_workers" {
  type    = number
  default = 2
}

variable "schedulers" {
  type    = number
  default = 2
}

variable "tags" {
  type    = map(string)
  default = {}
}
