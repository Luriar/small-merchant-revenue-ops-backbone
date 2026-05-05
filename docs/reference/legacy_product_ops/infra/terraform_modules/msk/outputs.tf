output "cluster_arn" {
  value = aws_msk_serverless_cluster.main.arn
}

output "cluster_name" {
  value = aws_msk_serverless_cluster.main.cluster_name
}

output "bootstrap_brokers_sasl_iam" {
  description = "MSK Serverless bootstrap brokers (IAM SASL). Strimzi/CH/Airflow 설정에 사용."
  value       = aws_msk_serverless_cluster.main.bootstrap_brokers_sasl_iam
}

output "security_group_id" {
  value = aws_security_group.msk.id
}
