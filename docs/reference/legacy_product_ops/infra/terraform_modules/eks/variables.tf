variable "project_name" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "public_subnet_ids" {
  description = "Cluster ENI 배치 + 향후 public LB"
  type        = list(string)
}

variable "private_app_subnet_ids" {
  description = "Worker node + Karpenter node 배치"
  type        = list(string)
}

variable "bastion_security_group_id" {
  description = "bastion → cluster 443 inbound source"
  type        = string
}

variable "bastion_iam_role_arn" {
  description = "bastion에 cluster admin access 부여 (kubectl 사용)"
  type        = string
}

variable "kubernetes_version" {
  type    = string
  default = "1.34"
}

variable "node_instance_type" {
  description = "Managed nodegroup 인스턴스 타입. 데모용 t3.medium."
  type        = string
  default     = "t3.medium"
}

variable "node_desired_size" {
  type    = number
  default = 2
}

variable "node_min_size" {
  type    = number
  default = 2
}

variable "node_max_size" {
  type    = number
  default = 4
}

variable "tags" {
  type    = map(string)
  default = {}
}
