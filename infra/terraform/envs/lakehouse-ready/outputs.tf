output "runtime_profile" {
  value = {
    deployment_profile     = var.deployment_profile
    enable_lakehouse       = var.enable_lakehouse
    enable_glue_catalog    = var.enable_glue_catalog
    enable_athena          = var.enable_athena
    enable_clickhouse      = var.enable_clickhouse
    enable_msk             = var.enable_msk
    enable_airflow         = var.enable_airflow
    enable_cdc             = var.enable_cdc
    partition_conventions  = local.s3_partition_conventions
    planned_glue_tables    = local.glue_tables
    active_resource_policy = "profile skeleton only; no resources are created until module wiring is reviewed"
  }
}
