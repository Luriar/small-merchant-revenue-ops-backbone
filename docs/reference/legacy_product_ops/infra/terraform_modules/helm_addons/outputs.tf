output "alb_controller_role_arn" {
  value = aws_iam_role.alb_controller.arn
}

output "karpenter_release_name" {
  value = helm_release.karpenter.name
}

output "strimzi_release_name" {
  value = helm_release.strimzi.name
}

output "monitoring_namespace" {
  value = helm_release.kube_prometheus_stack.namespace
}

output "argo_rollouts_release_name" {
  value = helm_release.argo_rollouts.name
}
