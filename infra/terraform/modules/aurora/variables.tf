################################################################################
# Aurora module — variables
################################################################################

variable "project_name" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "private_db_subnet_ids" {
  description = "Aurora가 배치될 private DB subnet (2 AZ 강제)."
  type        = list(string)

  validation {
    condition     = length(var.private_db_subnet_ids) >= 2
    error_message = "DB subnet group은 최소 2 AZ 필요."
  }
}

variable "bastion_security_group_id" {
  description = "Bastion SG ID. Aurora inbound source로 사용."
  type        = string
}

variable "engine_version" {
  description = "Aurora PostgreSQL engine version. M2 CDC publication 컬럼 필터 기능 위해 15.x 필수."
  type        = string
  default     = "15.5"
}

variable "database_name" {
  description = "초기 생성 DB name. baseline DDL이 이 이름에 적용됨."
  type        = string
  default     = "productops"
}

variable "master_username" {
  description = "Master user name. master_password는 random 생성 후 Secrets Manager에 저장."
  type        = string
  default     = "postgres"
}

variable "min_capacity" {
  description = "Serverless v2 최소 ACU. 0.5 = 1GB RAM."
  type        = number
  default     = 0.5
}

variable "max_capacity" {
  description = "Serverless v2 최대 ACU. M1 데모 규모는 4면 충분."
  type        = number
  default     = 4
}

variable "backup_retention_period" {
  description = "백업 보관 기간 (일). 1~35 가능."
  type        = number
  default     = 7
}

variable "deletion_protection" {
  description = "삭제 보호. M1 개발 중엔 false, M2/prod엔 true 권장."
  type        = bool
  default     = false
}

variable "skip_final_snapshot" {
  description = "삭제 시 최종 스냅샷 건너뛰기. M1 개발 중엔 true."
  type        = bool
  default     = true
}

variable "apply_immediately" {
  description = "변경 사항 즉시 적용. M1 개발 중엔 true."
  type        = bool
  default     = true
}

variable "tags" {
  type    = map(string)
  default = {}
}
