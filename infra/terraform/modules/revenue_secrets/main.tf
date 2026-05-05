################################################################################
# Revenue Secrets — SSM Parameter Store
#
# All secret parameters are initialised with a PLACEHOLDER value.
# Update the values manually (or via CI/CD) before the first pipeline run:
#
#   aws ssm put-parameter \
#     --name "/<name_prefix>/SEOUL_OPENAPI_KEY" \
#     --value "your-real-key" \
#     --type SecureString \
#     --overwrite
#
# The lifecycle ignore_changes = [value] block prevents Terraform from
# reverting manually updated secrets on subsequent applies.
################################################################################

resource "aws_ssm_parameter" "seoul_openapi_key" {
  name        = "/${var.name_prefix}/SEOUL_OPENAPI_KEY"
  description = "Seoul Open Data Plaza API key for local events extraction. Update before first run."
  type        = "SecureString"
  value       = "PLACEHOLDER"
  key_id      = var.use_kms ? var.kms_key_arn : null

  tags = merge(var.tags, {
    Name   = "/${var.name_prefix}/SEOUL_OPENAPI_KEY"
    Secret = "true"
  })

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "data_go_kr_service_key" {
  name        = "/${var.name_prefix}/DATA_GO_KR_SERVICE_KEY"
  description = "data.go.kr public data portal service key for holidays API. Update before first run."
  type        = "SecureString"
  value       = "PLACEHOLDER"
  key_id      = var.use_kms ? var.kms_key_arn : null

  tags = merge(var.tags, {
    Name   = "/${var.name_prefix}/DATA_GO_KR_SERVICE_KEY"
    Secret = "true"
  })

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "kma_asos_station_id" {
  name        = "/${var.name_prefix}/KMA_ASOS_STATION_ID"
  description = "KMA ASOS weather station ID. Default 108 = Seoul. Override to target a different station."
  type        = "String"
  value       = "108"

  tags = merge(var.tags, {
    Name   = "/${var.name_prefix}/KMA_ASOS_STATION_ID"
    Secret = "false"
  })
}
