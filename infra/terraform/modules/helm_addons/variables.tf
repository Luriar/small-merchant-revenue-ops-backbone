variable "project_name" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "cluster_name" {
  type = string
}

variable "oidc_provider_arn" {
  type = string
}

variable "oidc_provider_url" {
  type = string
}

variable "karpenter_controller_role_arn" {
  type = string
}

variable "karpenter_interruption_queue_name" {
  type = string
}

# Helm chart versions (tech_stack_final.docx + CFN 기준)
variable "karpenter_version" {
  type    = string
  default = "1.9.0"
}

variable "alb_controller_version" {
  type    = string
  default = "1.10.1"
}

variable "strimzi_version" {
  type    = string
  default = "0.45.0"
}

variable "kube_prometheus_stack_version" {
  type    = string
  default = "82.18.0"
}

variable "argo_rollouts_version" {
  type    = string
  default = "2.39.4"
}

variable "tags" {
  type    = map(string)
  default = {}
}
