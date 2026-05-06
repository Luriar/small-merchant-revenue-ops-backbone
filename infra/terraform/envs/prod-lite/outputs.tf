output "runtime_profile" {
  value = {
    deployment_profile            = var.deployment_profile
    enable_s3_bronze              = var.enable_s3_bronze
    enable_sqs_jobs               = var.enable_sqs_jobs
    enable_step_functions         = var.enable_step_functions
    enable_eventbridge_schedulers = var.enable_eventbridge_schedulers
    enable_lakehouse              = var.enable_lakehouse
    enable_clickhouse             = var.enable_clickhouse
    enable_msk                    = var.enable_msk
    enable_airflow                = var.enable_airflow
    enable_cdc                    = var.enable_cdc
    enable_worker_runtime         = var.enable_worker_runtime
    bronze_prefixes               = local.bronze_prefixes
    job_queues                    = local.job_queues
    schedules                     = local.schedules
    workflows                     = local.workflows
  }
}
