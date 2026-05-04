output "cluster_name" {
  value = aws_eks_cluster.main.name
}

output "cluster_endpoint" {
  value = aws_eks_cluster.main.endpoint
}

output "cluster_certificate_authority_data" {
  value = aws_eks_cluster.main.certificate_authority[0].data
}

output "cluster_security_group_id" {
  description = "EKS 자체 SG (cluster service에 attach)"
  value       = aws_security_group.cluster.id
}

output "cluster_managed_security_group_id" {
  description = "EKS가 자동 생성하는 SG (worker/pod 통신용). 다른 서비스(Aurora 등)가 EKS workload inbound source로 참조."
  value       = aws_eks_cluster.main.vpc_config[0].cluster_security_group_id
}

output "oidc_provider_arn" {
  value = aws_iam_openid_connect_provider.cluster.arn
}

output "oidc_provider_url" {
  value = aws_iam_openid_connect_provider.cluster.url
}

output "node_role_arn" {
  description = "Node IAM role ARN. Karpenter EC2NodeClass에서 참조."
  value       = aws_iam_role.node.arn
}

output "node_role_name" {
  value = aws_iam_role.node.name
}

output "karpenter_node_instance_profile_name" {
  value = aws_iam_instance_profile.karpenter_node.name
}
