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

  glue_database_name   = var.glue_database_name
  data_lake_bucket_id  = module.data_lake.data_lake_bucket_id
  data_lake_bucket_arn = module.data_lake.data_lake_bucket_arn
  name_prefix          = local.name_prefix
  tags                 = local.common_tags
}

module "athena" {
  source = "../../modules/revenue_athena"

  workgroup_name            = "${local.name_prefix}-workgroup"
  athena_results_bucket_id  = module.data_lake.athena_results_bucket_id
  athena_results_bucket_arn = module.data_lake.athena_results_bucket_arn
  name_prefix               = local.name_prefix
  tags                      = local.common_tags
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

  name_prefix         = local.name_prefix
  glue_role_arn       = module.iam.glue_role_arn
  data_lake_bucket_id = module.data_lake.data_lake_bucket_id
  glue_database_name  = var.glue_database_name
  environment_name    = var.environment
  tags                = local.common_tags
}

module "step_functions" {
  source = "../../modules/revenue_step_functions"

  name_prefix             = local.name_prefix
  step_functions_role_arn = module.iam.step_functions_role_arn
  weather_lambda_arn      = module.lambda_extractors.weather_lambda_arn
  holidays_lambda_arn     = module.lambda_extractors.holidays_lambda_arn
  local_events_lambda_arn = module.lambda_extractors.local_events_lambda_arn
  glue_job_names          = module.glue_jobs.job_names
  tags                    = local.common_tags
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

  name_prefix       = local.name_prefix
  state_machine_arn = module.step_functions.state_machine_arn
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

module "artifacts" {
  source = "../../modules/revenue_artifacts"

  enable_artifacts     = var.enable_artifacts
  artifact_bucket_name = var.artifact_bucket_name
  use_kms              = var.use_kms
  kms_key_arn          = module.data_lake.kms_key_arn
  name_prefix          = local.name_prefix
  tags                 = local.common_tags
}

module "frontend_hosting" {
  source = "../../modules/revenue_frontend_hosting"

  enable_frontend      = var.enable_frontend
  frontend_bucket_name = var.frontend_bucket_name
  domain_aliases       = var.frontend_domain_aliases
  hosted_zone_id       = var.frontend_hosted_zone_id
  acm_certificate_arn  = var.frontend_acm_certificate_arn
  create_dns_records   = var.create_frontend_dns_records
  artifact_bucket_arn  = module.artifacts.artifact_bucket_arn
  artifact_bucket_name = module.artifacts.artifact_bucket_name
  name_prefix          = local.name_prefix
  tags                 = local.common_tags
}

module "auth" {
  source = "../../modules/revenue_cognito"

  enable_auth   = var.enable_auth
  name_prefix   = local.name_prefix
  callback_urls = var.cognito_callback_urls
  logout_urls   = var.cognito_logout_urls
  domain_prefix = var.cognito_domain_prefix
  frontend_urls = var.frontend_domain_aliases
  tags          = local.common_tags
}

module "aurora" {
  source = "../../modules/revenue_aurora"

  enable_aurora              = var.enable_aurora
  name_prefix                = local.name_prefix
  vpc_id                     = var.aurora_vpc_id
  private_subnet_ids         = var.aurora_private_subnet_ids
  allowed_security_group_ids = var.aurora_allowed_security_group_ids
  database_name              = var.aurora_database_name
  master_username            = var.aurora_master_username
  min_acu                    = var.aurora_min_acu
  max_acu                    = var.aurora_max_acu
  use_kms                    = var.use_kms
  kms_key_arn                = module.data_lake.kms_key_arn
  tags                       = local.common_tags
}

module "revenue_api" {
  source = "../../modules/revenue_api_gateway_lambda"

  enable_api                  = var.enable_api
  name_prefix                 = local.name_prefix
  lambda_s3_bucket            = var.api_lambda_s3_bucket
  lambda_s3_key               = var.api_lambda_s3_key
  artifact_bucket_name        = module.artifacts.artifact_bucket_name
  artifact_bucket_arn         = module.artifacts.artifact_bucket_arn
  aurora_secret_arn           = module.aurora.master_secret_arn
  cognito_user_pool_id        = module.auth.user_pool_id
  cognito_user_pool_arn       = module.auth.user_pool_arn
  cognito_user_pool_client_id = module.auth.web_client_id
  custom_domain_name          = var.api_custom_domain_name
  acm_certificate_arn         = var.api_acm_certificate_arn
  hosted_zone_id              = var.api_hosted_zone_id
  create_dns_record           = var.create_api_dns_record
  enable_xray                 = var.enable_api_xray
  tags                        = local.common_tags
}

module "saas_observability" {
  source = "../../modules/revenue_saas_observability"

  enable_observability       = var.enable_saas_observability
  name_prefix                = local.name_prefix
  api_lambda_function_name   = module.revenue_api.lambda_function_name
  api_gateway_api_id         = module.revenue_api.api_id
  cloudfront_distribution_id = module.frontend_hosting.cloudfront_distribution_id
  alarm_actions              = var.alarm_actions
  tags                       = local.common_tags
}
