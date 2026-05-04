variable "project_name" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_id" {
  description = "ClickHouse가 배치될 subnet (private app)"
  type        = string
}

variable "instance_type" {
  description = "r6i.large = 2 vCPU / 16GB RAM (메모리 우선)"
  type        = string
  default     = "r6i.large"
}

variable "root_volume_size" {
  description = "OS + ClickHouse 바이너리. 30GB."
  type        = number
  default     = 30
}

variable "data_volume_size" {
  description = "/var/lib/clickhouse 데이터. 100GB (gp3)."
  type        = number
  default     = 100
}

variable "eks_workload_security_group_id" {
  description = "EKS workload SG. ClickHouse inbound source."
  type        = string
}

variable "bastion_security_group_id" {
  description = "bastion SG. 디버깅용 inbound."
  type        = string
}

variable "tags" {
  type    = map(string)
  default = {}
}
