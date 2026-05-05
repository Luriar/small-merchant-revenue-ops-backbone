################################################################################
# Network module — variables
################################################################################

variable "project_name" {
  description = "리소스 이름 prefix (예: productops-dev, productops-prod)"
  type        = string
}

variable "vpc_cidr" {
  description = "VPC CIDR. /20 권장 (cidrsubnet 분할이 그 전제). 다른 prefix 길이로 가려면 main.tf의 cidrsubnet newbits 조정 필요."
  type        = string

  validation {
    condition     = can(cidrnetmask(var.vpc_cidr))
    error_message = "유효한 CIDR 형식이어야 함."
  }
}

variable "azs" {
  description = "사용할 가용 영역 2개. DB subnet group이 2 AZ 강제."
  type        = list(string)

  validation {
    condition     = length(var.azs) == 2
    error_message = "AZ 정확히 2개 필요 (DB subnet group 요구사항)."
  }
}

variable "tags" {
  description = "공통 태그. 모든 리소스에 merge됨."
  type        = map(string)
  default     = {}
}

variable "enable_nat_gateway" {
  description = "NAT Gateway 생성 여부. M1=false, M2=true."
  type        = bool
  default     = false
}
