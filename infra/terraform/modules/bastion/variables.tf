################################################################################
# Bastion module — variables
################################################################################

variable "project_name" {
  type = string
}

variable "subnet_id" {
  description = "Bastion이 배치될 subnet (private app subnet 권장)."
  type        = string
}

variable "security_group_id" {
  description = "Bastion에 attach할 SG ID. envs에서 만든 것을 주입 (Aurora SG가 참조 가능하도록)."
  type        = string
}

variable "instance_type" {
  description = "Bastion 인스턴스 타입. t4g.nano = ARM 64bit (가장 저렴, ~$3/월)."
  type        = string
  default     = "t4g.nano"
}

variable "aurora_secret_arn" {
  description = "Aurora master credential Secret ARN. bastion이 회수 권한 받음."
  type        = string
}

variable "tags" {
  type    = map(string)
  default = {}
}
