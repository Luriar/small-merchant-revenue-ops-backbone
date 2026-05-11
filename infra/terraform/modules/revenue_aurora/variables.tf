variable "enable_aurora" {
  type        = bool
  default     = false
  description = "Enable Aurora Serverless v2 persistence."
}

variable "name_prefix" {
  type        = string
  description = "Common resource name prefix."
}

variable "vpc_id" {
  type        = string
  default     = null
  description = "VPC ID for the Aurora security group."

  validation {
    condition     = !var.enable_aurora || var.vpc_id != null
    error_message = "vpc_id is required when enable_aurora is true."
  }
}

variable "private_subnet_ids" {
  type        = list(string)
  default     = []
  description = "Private subnet IDs for the Aurora subnet group."

  validation {
    condition     = !var.enable_aurora || length(var.private_subnet_ids) >= 2
    error_message = "At least two private_subnet_ids are required when enable_aurora is true."
  }
}

variable "allowed_security_group_ids" {
  type        = list(string)
  default     = []
  description = "Security groups allowed to connect to Aurora on port 5432."
}

variable "database_name" {
  type        = string
  default     = "revenue_ops"
  description = "Initial database name."
}

variable "master_username" {
  type        = string
  default     = "revenue_ops_admin"
  description = "Aurora master username. Password is generated and stored in Secrets Manager."
}

variable "engine_version" {
  type        = string
  default     = "16.11"
  description = "Aurora PostgreSQL engine version."
}

variable "min_acu" {
  type        = number
  default     = 0.5
  description = "Aurora Serverless v2 minimum ACU."
}

variable "max_acu" {
  type        = number
  default     = 1
  description = "Aurora Serverless v2 maximum ACU."

  validation {
    condition     = var.max_acu >= var.min_acu
    error_message = "max_acu must be greater than or equal to min_acu."
  }
}

variable "use_kms" {
  type        = bool
  default     = false
  description = "Use the shared KMS key when true."
}

variable "kms_key_arn" {
  type        = string
  default     = ""
  description = "Shared KMS key ARN. Required when use_kms is true."
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Tags applied to resources."
}
