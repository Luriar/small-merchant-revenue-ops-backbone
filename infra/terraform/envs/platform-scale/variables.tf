variable "deployment_profile" {
  type    = string
  default = "platform-scale"
}

variable "enable_lakehouse" {
  type    = bool
  default = true
}

variable "enable_clickhouse" {
  type    = bool
  default = false
}

variable "enable_msk" {
  type    = bool
  default = false
}

variable "enable_airflow" {
  type    = bool
  default = false
}

variable "enable_cdc" {
  type    = bool
  default = false
}

variable "enable_worker_runtime" {
  type    = bool
  default = false
}

variable "enable_observability_stack" {
  type    = bool
  default = false
}
