variable "project_name" {
  type = string
}

variable "oidc_provider_arn" {
  description = "EKS OIDC provider ARN (IRSA)"
  type        = string
}

variable "oidc_provider_url" {
  description = "EKS OIDC issuer URL (https://...)"
  type        = string
}

variable "node_role_arn" {
  description = "Worker node IAM role ARN. Karpenter가 PassRole로 신규 노드에 부여."
  type        = string
}

variable "tags" {
  type    = map(string)
  default = {}
}
