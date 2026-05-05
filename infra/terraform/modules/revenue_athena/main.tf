################################################################################
# Revenue Athena Workgroup
################################################################################

resource "aws_athena_workgroup" "revenue_ops" {
  name        = var.workgroup_name
  description = "Revenue Ops ETL workgroup — enforces result location and CloudWatch metrics."
  state       = "ENABLED"

  configuration {
    enforce_workgroup_configuration    = true
    publish_cloudwatch_metrics_enabled = true

    result_configuration {
      output_location = "s3://${var.athena_results_bucket_id}/results/"

      encryption_configuration {
        encryption_option = "SSE_S3"
      }
    }

    engine_version {
      selected_engine_version = "Athena engine version 3"
    }

    bytes_scanned_cutoff_per_query = 1073741824 # 1 GB guard rail per query
  }

  tags = merge(var.tags, {
    Name = var.workgroup_name
  })
}
