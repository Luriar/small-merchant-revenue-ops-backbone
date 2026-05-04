variable "project_name" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "private_app_subnet_ids" {
  description = "MSK가 ENI 배치할 subnet"
  type        = list(string)
}

variable "eks_workload_security_group_id" {
  type = string
}

variable "bastion_security_group_id" {
  type = string
}

variable "clickhouse_security_group_id" {
  description = "ClickHouse SG. Kafka engine consumer로 MSK 접근."
  type        = string
}

variable "tags" {
  type    = map(string)
  default = {}
}
