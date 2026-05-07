variable "project_name" {
  type        = string
  default     = "revenue-ops"
  description = "Project name used as a resource naming prefix."
}

variable "environment" {
  type        = string
  default     = "revenue-dev"
  description = "Deployment environment name."
}

variable "aws_region" {
  type        = string
  default     = "ap-northeast-2"
  description = "AWS region for all resources."
}

variable "enable_pipeline_foundation" {
  type        = bool
  default     = false
  description = <<-EOT
    Enable the Medallion ETL pipeline foundation:
      - S3 data lake (bronze/silver/gold) + Athena results bucket
      - Glue Data Catalog (database + tables)
      - Athena workgroup
      - ETL IAM roles (Lambda, Glue, Step Functions, EventBridge)
      - Lambda extractor functions (weather, holidays, local events)
      - Glue ETL jobs (bronze→silver, gold)
      - Step Functions state machine
      - EventBridge Scheduler schedule resource (DISABLED by default; see enable_schedule)
      - CloudWatch log groups / ETL observability
      - SSM Parameter Store secrets (API keys)
    Set to false (default) to plan only the SaaS surface
    (artifacts, frontend, api, auth, aurora) without planning any pipeline
    backend resources. This keeps the first-plan blast radius minimal.
    Note: data_lake_bucket_name and athena_results_bucket_name are still
    required variable inputs even when false; they are simply not used for
    resource creation.
  EOT
}

variable "enable_schedule" {
  type        = bool
  default     = false
  description = "Enable the EventBridge Scheduler that triggers the daily pipeline. Set to true only when ready for automated runs. Has no effect when enable_pipeline_foundation is false."
}

variable "enable_frontend" {
  type        = bool
  default     = false
  description = "Enable the S3 + CloudFront + Route 53 frontend hosting foundation."
}

variable "enable_api" {
  type        = bool
  default     = false
  description = "Enable the API Gateway + Lambda Revenue Ops API foundation."
}

variable "enable_auth" {
  type        = bool
  default     = false
  description = "Enable the Cognito auth foundation."
}

variable "enable_api_jwt_authorizer" {
  type        = bool
  default     = false
  description = "Enable API Gateway JWT enforcement for Revenue API routes. Keep false while Cognito resources exist but frontend login/token flow is not wired."
}

variable "enable_aurora" {
  type        = bool
  default     = false
  description = "Enable the Aurora Serverless v2 persistence foundation."
}

variable "enable_aurora_network_foundation" {
  type        = bool
  default     = false
  description = "Enable the Revenue Ops-owned isolated VPC/subnet/security-group foundation for Aurora. Does not create Aurora/RDS."
}

variable "enable_api_lambda_vpc_access" {
  type        = bool
  default     = false
  description = "Attach the Revenue Ops API Lambda to the private Aurora network and enable private AWS service endpoint access."
}

variable "enable_artifacts" {
  type        = bool
  default     = false
  description = "Enable the S3 artifact bucket for export-backed JSON and deployable packages."
}

variable "enable_saas_observability" {
  type        = bool
  default     = false
  description = "Enable CloudWatch alarms/logs for the SaaS frontend/API foundation."
}

variable "schedule_expression" {
  type        = string
  default     = "cron(0 2 * * ? *)"
  description = "EventBridge Scheduler cron expression. Default: 2:00 AM UTC daily."
}

variable "data_lake_bucket_name" {
  type        = string
  description = "Name of the S3 bucket used as the data lake (bronze/silver/gold layers)."
}

variable "athena_results_bucket_name" {
  type        = string
  description = "Name of the S3 bucket used to store Athena query results."
}

variable "artifact_bucket_name" {
  type        = string
  default     = null
  description = "Optional S3 bucket for export-backed JSON and Lambda/package artifacts. Required when enable_artifacts is true."
}

variable "frontend_bucket_name" {
  type        = string
  default     = null
  description = "Optional S3 bucket for the React/Vite static frontend. Required when enable_frontend is true."
}

variable "frontend_domain_aliases" {
  type        = list(string)
  default     = []
  description = "Optional CloudFront aliases such as app.example.com. Requires a us-east-1 ACM certificate."
}

variable "frontend_hosted_zone_id" {
  type        = string
  default     = null
  description = "Optional Route 53 hosted zone ID for frontend DNS records."
}

variable "frontend_acm_certificate_arn" {
  type        = string
  default     = null
  description = "Optional us-east-1 ACM certificate ARN for frontend CloudFront aliases."
}

variable "create_frontend_dns_records" {
  type        = bool
  default     = false
  description = "Create Route 53 alias records for frontend_domain_aliases."
}

variable "api_lambda_s3_bucket" {
  type        = string
  default     = null
  description = "Optional S3 bucket containing the Revenue Ops API Lambda artifact. Required when enable_api is true."
}

variable "api_lambda_s3_key" {
  type        = string
  default     = null
  description = "Optional S3 key for the Revenue Ops API Lambda artifact. Required when enable_api is true."
}

variable "api_custom_domain_name" {
  type        = string
  default     = null
  description = "Optional API Gateway custom domain."
}

variable "api_acm_certificate_arn" {
  type        = string
  default     = null
  description = "Optional regional ACM certificate ARN for the API Gateway custom domain."
}

variable "api_hosted_zone_id" {
  type        = string
  default     = null
  description = "Optional Route 53 hosted zone ID for the API custom domain."
}

variable "create_api_dns_record" {
  type        = bool
  default     = false
  description = "Create a Route 53 alias record for api_custom_domain_name."
}

variable "enable_api_xray" {
  type        = bool
  default     = true
  description = "Enable X-Ray tracing for the Revenue Ops API Lambda."
}

variable "enable_api_lambda_versioning" {
  type        = bool
  default     = false
  description = "Publish immutable Lambda versions for the Revenue Ops API."
}

variable "enable_api_lambda_alias" {
  type        = bool
  default     = false
  description = "Create the live Lambda alias and wire API Gateway to the alias ARN."
}

variable "api_lambda_alias_name" {
  type        = string
  default     = "live"
  description = "Lambda alias name for API Gateway and CodeDeploy."
}

variable "api_lambda_alias_initial_version" {
  type        = string
  default     = null
  description = "Optional initial Lambda version for the live alias."
}

variable "enable_api_codedeploy_canary" {
  type        = bool
  default     = false
  description = "Create CodeDeploy Lambda canary deployment group and rollback alarms."
}

variable "api_codedeploy_deployment_config_name" {
  type        = string
  default     = "CodeDeployDefault.LambdaCanary10Percent5Minutes"
  description = "CodeDeploy deployment config used by the API Lambda deployment group."
}

variable "public_context_secret_id" {
  type        = string
  default     = "/revenue-ops/revenue-dev/external/public-context"
  description = "Secrets Manager secret ID for Kakao/Seoul/KMA public context credentials. Secret values are managed outside Terraform."
}

variable "public_context_secret_arn" {
  type        = string
  default     = null
  description = "Optional exact ARN for the public context secret. If null, the API module derives a narrow ARN pattern from public_context_secret_id."
}

variable "kma_default_nx" {
  type        = string
  default     = null
  description = "Optional KMA grid X fallback for live weather collection."
}

variable "kma_default_ny" {
  type        = string
  default     = null
  description = "Optional KMA grid Y fallback for live weather collection."
}

variable "kma_api_base_url" {
  type        = string
  default     = null
  description = "Optional KMA API base URL. Secret Manager may also supply this value."
}

variable "kma_forecast_endpoint" {
  type        = string
  default     = null
  description = "Optional KMA forecast endpoint path or absolute URL."
}

variable "kma_nowcast_endpoint" {
  type        = string
  default     = null
  description = "Optional KMA nowcast endpoint path or absolute URL."
}

variable "seoul_open_data_base_url" {
  type        = string
  default     = null
  description = "Optional Seoul Open Data API base URL."
}

variable "seoul_commercial_sales_endpoint" {
  type        = string
  default     = null
  description = "Optional Seoul Open Data endpoint for commercial sales benchmarks."
}

variable "seoul_foot_traffic_endpoint" {
  type        = string
  default     = null
  description = "Optional Seoul Open Data endpoint for foot traffic or floating population proxy."
}

variable "seoul_store_density_endpoint" {
  type        = string
  default     = null
  description = "Optional Seoul Open Data endpoint for same-category store density proxy."
}

variable "bronze_bucket_name" {
  type        = string
  default     = null
  description = "Optional S3 Bronze bucket name for sanitized public context collector raw artifacts."
}

variable "cognito_callback_urls" {
  type        = list(string)
  default     = []
  description = "Allowed Cognito app client callback URLs."
}

variable "cognito_logout_urls" {
  type        = list(string)
  default     = []
  description = "Allowed Cognito app client logout URLs."
}

variable "cognito_domain_prefix" {
  type        = string
  default     = null
  description = "Optional Cognito hosted UI domain prefix."
}

variable "aurora_vpc_id" {
  type        = string
  default     = null
  description = "VPC ID for Aurora Serverless v2. Required when enable_aurora is true."
}

variable "aurora_private_subnet_ids" {
  type        = list(string)
  default     = []
  description = "Private subnet IDs for Aurora Serverless v2. Required when enable_aurora is true."
}

variable "aurora_allowed_security_group_ids" {
  type        = list(string)
  default     = []
  description = "Security groups allowed to connect to Aurora."
}

variable "aurora_network_vpc_cidr" {
  type        = string
  default     = "10.42.0.0/20"
  description = "CIDR block for the dedicated Revenue Ops Aurora network foundation."
}

variable "aurora_network_private_subnet_cidrs" {
  type        = list(string)
  default     = ["10.42.0.0/24", "10.42.1.0/24"]
  description = "Two private isolated subnet CIDRs for the Revenue Ops Aurora network foundation."

  validation {
    condition     = length(var.aurora_network_private_subnet_cidrs) >= 2
    error_message = "At least two private subnet CIDRs are required for the Aurora network foundation."
  }
}

variable "aurora_network_public_subnet_cidrs" {
  type        = list(string)
  default     = ["10.42.10.0/24", "10.42.11.0/24"]
  description = "Public NAT subnet CIDRs used only when vpc_egress_profile is single_nat or multi_az_nat."

  validation {
    condition     = length(var.aurora_network_public_subnet_cidrs) >= 2
    error_message = "At least two public subnet CIDRs are required for HA NAT planning."
  }
}

variable "vpc_egress_profile" {
  type        = string
  default     = "none"
  description = "Outbound internet egress profile for VPC-attached Revenue Ops collectors: none, single_nat, or multi_az_nat."

  validation {
    condition     = contains(["none", "single_nat", "multi_az_nat"], var.vpc_egress_profile)
    error_message = "vpc_egress_profile must be one of: none, single_nat, multi_az_nat."
  }
}

variable "aurora_network_availability_zones" {
  type        = list(string)
  default     = []
  description = "Optional explicit AZ names for Aurora private subnets. Defaults to the first two available AZs in the region."
}

variable "aurora_database_name" {
  type        = string
  default     = "revenue_ops"
  description = "Initial Aurora database name."
}

variable "aurora_master_username" {
  type        = string
  default     = "revenue_ops_admin"
  description = "Aurora master username. Password is generated and stored in Secrets Manager."
}

variable "aurora_min_acu" {
  type        = number
  default     = 0.5
  description = "Aurora Serverless v2 minimum ACU."
}

variable "aurora_max_acu" {
  type        = number
  default     = 1
  description = "Aurora Serverless v2 maximum ACU for the initial small-merchant dev foundation."
}

variable "alarm_actions" {
  type        = list(string)
  default     = []
  description = "Optional SNS topic ARNs or other alarm action ARNs."
}

variable "glue_database_name" {
  type        = string
  default     = "revenue_ops_dev"
  description = "Name of the Glue Data Catalog database."
}

variable "use_kms" {
  type        = bool
  default     = false
  description = "Enable KMS encryption for S3 buckets and SSM SecureString parameters. When false, AES256 is used."
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Additional tags merged onto all resources."
}
