################################################################################
# Endpoints module — variables
################################################################################

variable "project_name" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "vpc_cidr" {
  description = "SG inbound 규칙용. VPC 내부에서 443 허용."
  type        = string
}

variable "private_app_subnet_ids" {
  description = "Interface endpoint를 배치할 subnet들."
  type        = list(string)
}

variable "private_app_route_table_ids" {
  description = "S3 Gateway endpoint를 연결할 route table들."
  type        = list(string)
}

variable "private_db_route_table_ids" {
  description = "S3 Gateway endpoint를 연결할 route table들."
  type        = list(string)
}

variable "tags" {
  type    = map(string)
  default = {}
}
