################################################################################
# Revenue Ops — Serverless Batch ETL + SaaS Surface
# Environment: revenue-dev
#
# Stack: S3 (data lake), Glue (jobs + catalog), Athena, Step Functions,
#        EventBridge Scheduler, Lambda (extractors), CloudWatch, SSM,
#        S3 (artifacts + frontend), CloudFront, Cognito, Aurora, API GW + Lambda
#
# NOT the old Product Ops streaming/CDC/EKS stack.
#
# Activation gates
# ─────────────────────────────────────────────────────────────────────────────
# enable_pipeline_foundation — gates all 10 ETL foundation modules (default: false)
# enable_schedule            — gates the EventBridge schedule run state (default: false)
# enable_artifacts           — gates the S3 artifact bucket (default: false)
# enable_frontend            — gates the CloudFront + S3 frontend (default: false)
# enable_api                 — gates the API Gateway + Lambda (default: false)
# enable_auth                — gates Cognito (default: false)
# enable_aurora              — gates Aurora Serverless v2 (default: false)
# enable_saas_observability  — gates the SaaS CloudWatch alarms (default: false)
#
# First safe plan (STEP 1-C / STEP 1-D):
#   enable_pipeline_foundation = false
#   enable_artifacts           = true
#   enable_frontend            = true
#   (all others false)
################################################################################

# ─────────────────────────────────────────────────────────────────────────────
# ETL PIPELINE FOUNDATION — gated by enable_pipeline_foundation
#
# All 10 modules below use count = var.enable_pipeline_foundation ? 1 : 0.
# When the gate is false, none of these resources are planned.
# Intra-ETL module output references use module.X[0].output syntax.
# Cross-tier callers (artifacts, aurora) use try(module.data_lake[0].kms_key_arn, "").
# ─────────────────────────────────────────────────────────────────────────────

module "data_lake" {
  count  = var.enable_pipeline_foundation ? 1 : 0
  source = "../../modules/revenue_data_lake"

  data_lake_bucket_name      = var.data_lake_bucket_name
  athena_results_bucket_name = var.athena_results_bucket_name
  use_kms                    = var.use_kms
  name_prefix                = local.name_prefix
  tags                       = local.common_tags
}

module "glue_catalog" {
  count  = var.enable_pipeline_foundation ? 1 : 0
  source = "../../modules/revenue_glue_catalog"

  glue_database_name   = var.glue_database_name
  data_lake_bucket_id  = module.data_lake[0].data_lake_bucket_id
  data_lake_bucket_arn = module.data_lake[0].data_lake_bucket_arn
  name_prefix          = local.name_prefix
  tags                 = local.common_tags
}

module "athena" {
  count  = var.enable_pipeline_foundation ? 1 : 0
  source = "../../modules/revenue_athena"

  workgroup_name            = "${local.name_prefix}-workgroup"
  athena_results_bucket_id  = module.data_lake[0].athena_results_bucket_id
  athena_results_bucket_arn = module.data_lake[0].athena_results_bucket_arn
  name_prefix               = local.name_prefix
  tags                      = local.common_tags
}

module "iam" {
  count  = var.enable_pipeline_foundation ? 1 : 0
  source = "../../modules/revenue_etl_iam"

  name_prefix          = local.name_prefix
  data_lake_bucket_arn = module.data_lake[0].data_lake_bucket_arn
  use_kms              = var.use_kms
  kms_key_arn          = module.data_lake[0].kms_key_arn
  tags                 = local.common_tags
}

module "lambda_extractors" {
  count  = var.enable_pipeline_foundation ? 1 : 0
  source = "../../modules/revenue_lambda_extractors"

  name_prefix          = local.name_prefix
  lambda_role_arn      = module.iam[0].lambda_role_arn
  data_lake_bucket_id  = module.data_lake[0].data_lake_bucket_id
  data_lake_bucket_arn = module.data_lake[0].data_lake_bucket_arn
  environment_name     = var.environment
  tags                 = local.common_tags
}

module "glue_jobs" {
  count  = var.enable_pipeline_foundation ? 1 : 0
  source = "../../modules/revenue_glue_jobs"

  name_prefix         = local.name_prefix
  glue_role_arn       = module.iam[0].glue_role_arn
  data_lake_bucket_id = module.data_lake[0].data_lake_bucket_id
  glue_database_name  = var.glue_database_name
  environment_name    = var.environment
  tags                = local.common_tags
}

module "step_functions" {
  count  = var.enable_pipeline_foundation ? 1 : 0
  source = "../../modules/revenue_step_functions"

  name_prefix             = local.name_prefix
  step_functions_role_arn = module.iam[0].step_functions_role_arn
  weather_lambda_arn      = module.lambda_extractors[0].weather_lambda_arn
  holidays_lambda_arn     = module.lambda_extractors[0].holidays_lambda_arn
  local_events_lambda_arn = module.lambda_extractors[0].local_events_lambda_arn
  glue_job_names          = module.glue_jobs[0].job_names
  tags                    = local.common_tags
}

module "eventbridge" {
  count  = var.enable_pipeline_foundation ? 1 : 0
  source = "../../modules/revenue_eventbridge"

  name_prefix          = local.name_prefix
  enable_schedule      = var.enable_schedule
  schedule_expression  = var.schedule_expression
  state_machine_arn    = module.step_functions[0].state_machine_arn
  eventbridge_role_arn = module.iam[0].eventbridge_role_arn
  tags                 = local.common_tags
}

module "observability" {
  count  = var.enable_pipeline_foundation ? 1 : 0
  source = "../../modules/revenue_observability"

  name_prefix       = local.name_prefix
  state_machine_arn = module.step_functions[0].state_machine_arn
  lambda_function_names = [
    module.lambda_extractors[0].weather_lambda_name,
    module.lambda_extractors[0].holidays_lambda_name,
    module.lambda_extractors[0].local_events_lambda_name,
  ]
  tags = local.common_tags
}

module "secrets" {
  count  = var.enable_pipeline_foundation ? 1 : 0
  source = "../../modules/revenue_secrets"

  name_prefix = local.name_prefix
  use_kms     = var.use_kms
  kms_key_arn = module.data_lake[0].kms_key_arn
  tags        = local.common_tags
}

# ─────────────────────────────────────────────────────────────────────────────
# SAAS SURFACE — individually gated; no dependency on enable_pipeline_foundation
#
# kms_key_arn for artifacts and aurora falls back to "" when the pipeline
# foundation is disabled (use_kms defaults to false; KMS is unused in that path).
# ─────────────────────────────────────────────────────────────────────────────

module "aurora_network" {
  source = "../../modules/revenue_network"

  enable_network       = var.enable_aurora_network_foundation
  name_prefix          = local.name_prefix
  vpc_cidr             = var.aurora_network_vpc_cidr
  private_subnet_cidrs = var.aurora_network_private_subnet_cidrs
  public_subnet_cidrs  = var.aurora_network_public_subnet_cidrs
  availability_zones   = var.aurora_network_availability_zones
  vpc_egress_profile   = var.vpc_egress_profile
  tags                 = local.common_tags
}

module "artifacts" {
  source = "../../modules/revenue_artifacts"

  enable_artifacts     = var.enable_artifacts
  artifact_bucket_name = var.artifact_bucket_name
  use_kms              = var.use_kms
  kms_key_arn          = try(module.data_lake[0].kms_key_arn, "")
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
  kms_key_arn                = try(module.data_lake[0].kms_key_arn, "")
  tags                       = local.common_tags
}

resource "aws_security_group_rule" "api_lambda_to_aurora_module_egress" {
  count = var.enable_api_lambda_vpc_access && var.enable_aurora ? 1 : 0

  type                     = "egress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = module.aurora_network.lambda_security_group_id
  source_security_group_id = module.aurora.security_group_id
  description              = "Allow API Lambda security group to reach the module-created Aurora PostgreSQL security group."
}

module "revenue_api" {
  source = "../../modules/revenue_api_gateway_lambda"

  enable_api                      = var.enable_api
  name_prefix                     = local.name_prefix
  lambda_s3_bucket                = var.api_lambda_s3_bucket
  lambda_s3_key                   = var.api_lambda_s3_key
  artifact_bucket_name            = module.artifacts.artifact_bucket_name
  artifact_bucket_arn             = module.artifacts.artifact_bucket_arn
  aurora_secret_arn               = module.aurora.master_secret_arn
  aurora_cluster_endpoint         = module.aurora.cluster_endpoint
  aurora_database_name            = var.aurora_database_name
  aurora_port                     = 5432
  public_context_secret_id        = var.public_context_secret_id
  public_context_secret_arn       = var.public_context_secret_arn
  kma_default_nx                  = var.kma_default_nx
  kma_default_ny                  = var.kma_default_ny
  kma_api_base_url                = var.kma_api_base_url
  kma_forecast_endpoint           = var.kma_forecast_endpoint
  kma_nowcast_endpoint            = var.kma_nowcast_endpoint
  seoul_open_data_base_url        = var.seoul_open_data_base_url
  seoul_commercial_sales_endpoint = var.seoul_commercial_sales_endpoint
  seoul_foot_traffic_endpoint     = var.seoul_foot_traffic_endpoint
  seoul_store_density_endpoint    = var.seoul_store_density_endpoint
  bronze_bucket_name              = var.bronze_bucket_name
  lambda_vpc_subnet_ids           = var.enable_api_lambda_vpc_access ? module.aurora_network.private_subnet_ids : []
  lambda_vpc_security_group_ids   = var.enable_api_lambda_vpc_access ? [module.aurora_network.lambda_security_group_id] : []
  cognito_user_pool_id            = var.enable_api_jwt_authorizer ? module.auth.user_pool_id : null
  cognito_user_pool_arn           = var.enable_api_jwt_authorizer ? module.auth.user_pool_arn : null
  cognito_user_pool_client_id     = var.enable_api_jwt_authorizer ? module.auth.web_client_id : null
  enable_cognito_authorizer       = var.enable_api_jwt_authorizer
  custom_domain_name              = var.api_custom_domain_name
  acm_certificate_arn             = var.api_acm_certificate_arn
  hosted_zone_id                  = var.api_hosted_zone_id
  create_dns_record               = var.create_api_dns_record
  enable_xray                     = var.enable_api_xray
  tags                            = local.common_tags
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
