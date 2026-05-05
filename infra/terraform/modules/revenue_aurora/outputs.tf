output "cluster_arn" {
  description = "Aurora cluster ARN, or null when disabled."
  value       = var.enable_aurora ? aws_rds_cluster.aurora[0].arn : null
}

output "cluster_endpoint" {
  description = "Aurora writer endpoint, or null when disabled."
  value       = var.enable_aurora ? aws_rds_cluster.aurora[0].endpoint : null
}

output "cluster_reader_endpoint" {
  description = "Aurora reader endpoint, or null when disabled."
  value       = var.enable_aurora ? aws_rds_cluster.aurora[0].reader_endpoint : null
}

output "security_group_id" {
  description = "Aurora security group ID, or null when disabled."
  value       = var.enable_aurora ? aws_security_group.aurora[0].id : null
}

output "master_secret_arn" {
  description = "Secrets Manager secret ARN for Aurora master credentials, or null when disabled."
  value       = var.enable_aurora ? aws_secretsmanager_secret.master[0].arn : null
}
