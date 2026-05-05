variable "aws_region" {
  type    = string
  default = "ap-northeast-2"
}

variable "project_name" {
  type    = string
  default = "productops-dev"

  validation {
    condition     = can(regex("^[a-z][-a-z0-9]*$", var.project_name))
    error_message = "소문자로 시작하고 소문자/숫자/하이픈만 허용."
  }
}

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/20"
}

variable "azs" {
  type    = list(string)
  default = ["ap-northeast-2a", "ap-northeast-2c"]
}

# M2 활성화 토글
variable "enable_m2" {
  description = "M2 컴포넌트 (EKS/Karpenter/MSK/CH/Airflow/Argo) 활성화 여부."
  type        = bool
  default     = false
}

# Aurora
variable "aurora_engine_version" {
  type    = string
  default = "15.17"
}

variable "aurora_min_capacity" {
  type    = number
  default = 0.5
}

variable "aurora_max_capacity" {
  type    = number
  default = 4
}

variable "aurora_deletion_protection" {
  type    = bool
  default = false
}

# EKS
variable "kubernetes_version" {
  type    = string
  default = "1.34"
}

variable "node_instance_type" {
  type    = string
  default = "t3.medium"
}

# ClickHouse
variable "clickhouse_instance_type" {
  type    = string
  default = "r6i.large"
}

# Airflow
variable "airflow_environment_class" {
  type    = string
  default = "mw1.small"
}
