variable "deployment_profile" {
  type    = string
  default = "prod-lite"
}

variable "enable_s3_bronze" {
  type    = bool
  default = true
}

variable "enable_sqs_jobs" {
  type    = bool
  default = true
}

variable "enable_step_functions" {
  type    = bool
  default = true
}

variable "enable_eventbridge_schedulers" {
  type    = bool
  default = true
}

variable "enable_lakehouse" {
  type    = bool
  default = false
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
