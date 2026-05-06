output "runtime_profile" {
  value = {
    deployment_profile         = var.deployment_profile
    enable_lakehouse           = var.enable_lakehouse
    enable_clickhouse          = var.enable_clickhouse
    enable_msk                 = var.enable_msk
    enable_airflow             = var.enable_airflow
    enable_cdc                 = var.enable_cdc
    enable_worker_runtime      = var.enable_worker_runtime
    enable_observability_stack = var.enable_observability_stack
    msk_topics                 = local.msk_topics
    airflow_dags               = local.airflow_dags
    cost_caution               = "disabled by default; do not apply without a reviewed cost and operations plan"
  }
}
