################################################################################
# Aurora module — outputs
################################################################################

output "cluster_id" {
  description = "Aurora cluster ID."
  value       = aws_rds_cluster.main.id
}

output "cluster_endpoint" {
  description = "Writer endpoint. AURORA_DATABASE_URL 호스트 부분."
  value       = aws_rds_cluster.main.endpoint
}

output "cluster_reader_endpoint" {
  description = "Reader endpoint. (M1 writer 1개라 동일하게 동작하지만 별도 노출)"
  value       = aws_rds_cluster.main.reader_endpoint
}

output "cluster_port" {
  description = "Aurora port (5432)."
  value       = aws_rds_cluster.main.port
}

output "database_name" {
  description = "초기 DB name."
  value       = aws_rds_cluster.main.database_name
}

output "master_username" {
  description = "Master user name."
  value       = aws_rds_cluster.main.master_username
}

output "secret_arn" {
  description = "Master credential Secret ARN. bastion이 회수."
  value       = aws_secretsmanager_secret.master.arn
}

output "secret_name" {
  description = "Secret 이름. AWS CLI로 회수 시 사용."
  value       = aws_secretsmanager_secret.master.name
}

output "security_group_id" {
  description = "Aurora SG ID."
  value       = aws_security_group.aurora.id
}

output "parameter_group_name" {
  description = "Cluster parameter group 이름. M2 CDC 활성화 시 수정 대상."
  value       = aws_rds_cluster_parameter_group.main.name
}
