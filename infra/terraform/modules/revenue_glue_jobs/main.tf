################################################################################
# Revenue Glue ETL Jobs — Medallion Pipeline
#
# All jobs use Python Shell (pythonshell) with the smallest DPU (0.0625).
# Scripts must be uploaded to s3://<bucket>/scripts/glue/<job_name>.py
# before the jobs are triggered.
#
# Layers:
#   Bronze → Silver: revenue, demand, weather, competition
#   Silver → Gold:   context mart, anomaly detection, cause linking,
#                    action recommendations
################################################################################

locals {
  # Common default arguments shared across all Glue jobs
  common_default_args = {
    "--enable-continuous-cloudwatch-log" = "true"
    "--enable-metrics"                   = "true"
    "--data_lake_bucket"                 = var.data_lake_bucket_id
    "--glue_database_name"               = var.glue_database_name
    "--environment"                      = var.environment_name
    "--TempDir"                          = "s3://${var.data_lake_bucket_id}/artifacts/glue-temp/"
  }
}

################################################################################
# Bronze → Silver: revenue
################################################################################

resource "aws_glue_job" "bronze_to_silver_revenue" {
  name         = "${var.name_prefix}-bronze-to-silver-revenue"
  description  = "Cleans and types raw revenue signal data from bronze and writes Parquet to silver."
  role_arn     = var.glue_role_arn
  glue_version = "3.0"
  max_capacity = 0.0625

  command {
    name            = "pythonshell"
    python_version  = "3"
    script_location = "s3://${var.data_lake_bucket_id}/scripts/glue/bronze_to_silver_revenue.py"
  }

  default_arguments = merge(local.common_default_args, {
    "--job_name" = "${var.name_prefix}-bronze-to-silver-revenue"
  })

  execution_property {
    max_concurrent_runs = 1
  }

  tags = merge(var.tags, {
    Name  = "${var.name_prefix}-bronze-to-silver-revenue"
    Layer = "silver"
  })
}

################################################################################
# Bronze → Silver: demand
################################################################################

resource "aws_glue_job" "bronze_to_silver_demand" {
  name         = "${var.name_prefix}-bronze-to-silver-demand"
  description  = "Cleans and types raw demand signal data from bronze and writes Parquet to silver."
  role_arn     = var.glue_role_arn
  glue_version = "3.0"
  max_capacity = 0.0625

  command {
    name            = "pythonshell"
    python_version  = "3"
    script_location = "s3://${var.data_lake_bucket_id}/scripts/glue/bronze_to_silver_demand.py"
  }

  default_arguments = merge(local.common_default_args, {
    "--job_name" = "${var.name_prefix}-bronze-to-silver-demand"
  })

  execution_property {
    max_concurrent_runs = 1
  }

  tags = merge(var.tags, {
    Name  = "${var.name_prefix}-bronze-to-silver-demand"
    Layer = "silver"
  })
}

################################################################################
# Bronze → Silver: weather
################################################################################

resource "aws_glue_job" "bronze_to_silver_weather" {
  name         = "${var.name_prefix}-bronze-to-silver-weather"
  description  = "Cleans and types raw ASOS weather data from bronze and writes Parquet to silver."
  role_arn     = var.glue_role_arn
  glue_version = "3.0"
  max_capacity = 0.0625

  command {
    name            = "pythonshell"
    python_version  = "3"
    script_location = "s3://${var.data_lake_bucket_id}/scripts/glue/bronze_to_silver_weather.py"
  }

  default_arguments = merge(local.common_default_args, {
    "--job_name" = "${var.name_prefix}-bronze-to-silver-weather"
  })

  execution_property {
    max_concurrent_runs = 1
  }

  tags = merge(var.tags, {
    Name  = "${var.name_prefix}-bronze-to-silver-weather"
    Layer = "silver"
  })
}

################################################################################
# Bronze → Silver: competition
################################################################################

resource "aws_glue_job" "bronze_to_silver_competition" {
  name         = "${var.name_prefix}-bronze-to-silver-competition"
  description  = "Cleans and types raw competition snapshot data from bronze and writes Parquet to silver."
  role_arn     = var.glue_role_arn
  glue_version = "3.0"
  max_capacity = 0.0625

  command {
    name            = "pythonshell"
    python_version  = "3"
    script_location = "s3://${var.data_lake_bucket_id}/scripts/glue/bronze_to_silver_competition.py"
  }

  default_arguments = merge(local.common_default_args, {
    "--job_name" = "${var.name_prefix}-bronze-to-silver-competition"
  })

  execution_property {
    max_concurrent_runs = 1
  }

  tags = merge(var.tags, {
    Name  = "${var.name_prefix}-bronze-to-silver-competition"
    Layer = "silver"
  })
}

################################################################################
# Silver → Gold: revenue context mart
################################################################################

resource "aws_glue_job" "build_gold_revenue_context_mart" {
  name         = "${var.name_prefix}-build-gold-revenue-context-mart"
  description  = "Joins silver signals (revenue, demand, weather, competition) into the gold revenue context mart."
  role_arn     = var.glue_role_arn
  glue_version = "3.0"
  max_capacity = 0.0625

  command {
    name            = "pythonshell"
    python_version  = "3"
    script_location = "s3://${var.data_lake_bucket_id}/scripts/glue/build_gold_revenue_context_mart.py"
  }

  default_arguments = merge(local.common_default_args, {
    "--job_name" = "${var.name_prefix}-build-gold-revenue-context-mart"
  })

  execution_property {
    max_concurrent_runs = 1
  }

  tags = merge(var.tags, {
    Name  = "${var.name_prefix}-build-gold-revenue-context-mart"
    Layer = "gold"
  })
}

################################################################################
# Silver → Gold: anomaly detection
################################################################################

resource "aws_glue_job" "detect_revenue_anomalies" {
  name         = "${var.name_prefix}-detect-revenue-anomalies"
  description  = "Applies statistical anomaly detection (z-score) to the gold revenue context mart."
  role_arn     = var.glue_role_arn
  glue_version = "3.0"
  max_capacity = 0.0625

  command {
    name            = "pythonshell"
    python_version  = "3"
    script_location = "s3://${var.data_lake_bucket_id}/scripts/glue/detect_revenue_anomalies.py"
  }

  default_arguments = merge(local.common_default_args, {
    "--job_name" = "${var.name_prefix}-detect-revenue-anomalies"
  })

  execution_property {
    max_concurrent_runs = 1
  }

  tags = merge(var.tags, {
    Name  = "${var.name_prefix}-detect-revenue-anomalies"
    Layer = "gold"
  })
}

################################################################################
# Silver → Gold: cause evidence linking
################################################################################

resource "aws_glue_job" "link_cause_evidence" {
  name         = "${var.name_prefix}-link-cause-evidence"
  description  = "Links detected anomalies to causal evidence from contextual signals."
  role_arn     = var.glue_role_arn
  glue_version = "3.0"
  max_capacity = 0.0625

  command {
    name            = "pythonshell"
    python_version  = "3"
    script_location = "s3://${var.data_lake_bucket_id}/scripts/glue/link_cause_evidence.py"
  }

  default_arguments = merge(local.common_default_args, {
    "--job_name" = "${var.name_prefix}-link-cause-evidence"
  })

  execution_property {
    max_concurrent_runs = 1
  }

  tags = merge(var.tags, {
    Name  = "${var.name_prefix}-link-cause-evidence"
    Layer = "gold"
  })
}

################################################################################
# Silver → Gold: action recommendations
################################################################################

resource "aws_glue_job" "map_action_recommendations" {
  name         = "${var.name_prefix}-map-action-recommendations"
  description  = "Maps cause evidence to actionable recommendations for merchants."
  role_arn     = var.glue_role_arn
  glue_version = "3.0"
  max_capacity = 0.0625

  command {
    name            = "pythonshell"
    python_version  = "3"
    script_location = "s3://${var.data_lake_bucket_id}/scripts/glue/map_action_recommendations.py"
  }

  default_arguments = merge(local.common_default_args, {
    "--job_name" = "${var.name_prefix}-map-action-recommendations"
  })

  execution_property {
    max_concurrent_runs = 1
  }

  tags = merge(var.tags, {
    Name  = "${var.name_prefix}-map-action-recommendations"
    Layer = "gold"
  })
}
