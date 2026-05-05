################################################################################
# M2 envs/dev — outputs
################################################################################

# ---- M1 (그대로 유지) ----
output "bastion_instance_id" {
  value = module.bastion.instance_id
}

output "ssm_session_command" {
  value = module.bastion.ssm_session_command
}

output "aurora_cluster_endpoint" {
  value = module.aurora.cluster_endpoint
}

output "aurora_secret_arn" {
  value = module.aurora.secret_arn
}

# ---- M2 ----
output "eks_cluster_name" {
  value = var.enable_m2 ? module.eks[0].cluster_name : null
}

output "eks_cluster_endpoint" {
  value = var.enable_m2 ? module.eks[0].cluster_endpoint : null
}

output "kubeconfig_command" {
  description = "bastion에서 kubectl 사용 위한 kubeconfig 업데이트 명령"
  value = var.enable_m2 ? format(
    "aws eks update-kubeconfig --name %s --region %s",
    module.eks[0].cluster_name,
    var.aws_region,
  ) : null
}

output "msk_bootstrap_brokers" {
  value = var.enable_m2 ? module.msk[0].bootstrap_brokers_sasl_iam : null
}

output "clickhouse_http_endpoint" {
  value = var.enable_m2 ? module.clickhouse[0].http_endpoint : null
}

output "clickhouse_native_endpoint" {
  value = var.enable_m2 ? module.clickhouse[0].native_endpoint : null
}

output "airflow_webserver_url" {
  value = var.enable_m2 ? module.airflow[0].webserver_url : null
}

output "airflow_dags_bucket" {
  value = var.enable_m2 ? module.airflow[0].dags_bucket_name : null
}

output "argocd_initial_admin_password_command" {
  value = var.enable_m2 ? module.argocd[0].initial_admin_password_command : null
}
