################################################################################
# Revenue Ops — Serverless Batch ETL
# Environment: revenue-dev
#
# Stack: S3 (data lake), Glue (jobs + catalog), Athena, Step Functions,
#        EventBridge Scheduler, Lambda (extractors), CloudWatch, SSM
#
# NOT the old Product Ops streaming/CDC/EKS stack.
################################################################################

module "data_lake" {
  source = "../../modules/revenue_data_lake"

  data_lake_bucket_name      = var.data_lake_bucket_name
  athena_results_bucket_name = var.athena_results_bucket_name
  use_kms                    = var.use_kms
  name_prefix                = local.name_prefix
  tags                       = local.common_tags
}

module "glue_catalog" {
  source = "../../modules/revenue_glue_catalog"

  glue_database_name  = var.glue_database_name
  data_lake_bucket_id = module.data_lake.data_lake_bucket_id
  data_lake_bucket_arn = module.data_lake.data_lake_bucket_arn
  name_prefix         = local.name_prefix
  tags                = local.common_tags
}

module "athena" {
  source = "../../modules/revenue_athena"

  workgroup_name             = "${local.name_prefix}-workgroup"
  athena_results_bucket_id   = module.data_lake.athena_results_bucket_id
  athena_results_bucket_arn  = module.data_lake.athena_results_bucket_arn
  name_prefix                = local.name_prefix
  tags                       = local.common_tags
}

module "iam" {
  source = "../../modules/revenue_etl_iam"

  name_prefix          = local.name_prefix
  data_lake_bucket_arn = module.data_lake.data_lake_bucket_arn
  use_kms              = var.use_kms
  kms_key_arn          = module.data_lake.kms_key_arn
  tags                 = local.common_tags
}

module "lambda_extractors" {
  source = "../../modules/revenue_lambda_extractors"

  name_prefix          = local.name_prefix
  lambda_role_arn      = module.iam.lambda_role_arn
  data_lake_bucket_id  = module.data_lake.data_lake_bucket_id
  data_lake_bucket_arn = module.data_lake.data_lake_bucket_arn
  environment_name     = var.environment
  tags                 = local.common_tags
}

module "glue_jobs" {
  source = "../../modules/revenue_glue_jobs"

  name_prefix          = local.name_prefix
  glue_role_arn        = module.iam.glue_role_arn
  data_lake_bucket_id  = module.data_lake.data_lake_bucket_id
  glue_database_name   = var.glue_database_name
  environment_name     = var.environment
  tags                 = local.common_tags
}

module "step_functions" {
  source = "../../modules/revenue_step_functions"

  name_prefix              = local.name_prefix
  step_functions_role_arn  = module.iam.step_functions_role_arn
  weather_lambda_arn       = module.lambda_extractors.weather_lambda_arn
  holidays_lambda_arn      = module.lambda_extractors.holidays_lambda_arn
  local_events_lambda_arn  = module.lambda_extractors.local_events_lambda_arn
  glue_job_names           = module.glue_jobs.job_names
  tags                     = local.common_tags
}

module "eventbridge" {
  source = "../../modules/revenue_eventbridge"

  name_prefix          = local.name_prefix
  enable_schedule      = var.enable_schedule
  schedule_expression  = var.schedule_expression
  state_machine_arn    = module.step_functions.state_machine_arn
  eventbridge_role_arn = module.iam.eventbridge_role_arn
  tags                 = local.common_tags
}

module "observability" {
  source = "../../modules/revenue_observability"

  name_prefix           = local.name_prefix
  state_machine_arn     = module.step_functions.state_machine_arn
  lambda_function_names = [
    module.lambda_extractors.weather_lambda_name,
    module.lambda_extractors.holidays_lambda_name,
    module.lambda_extractors.local_events_lambda_name,
  ]
  tags = local.common_tags
}

module "secrets" {
  source = "../../modules/revenue_secrets"

  name_prefix = local.name_prefix
  use_kms     = var.use_kms
  kms_key_arn = module.data_lake.kms_key_arn
  tags        = local.common_tags
}
