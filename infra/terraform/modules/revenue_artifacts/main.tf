resource "aws_s3_bucket" "artifacts" {
  count = var.enable_artifacts ? 1 : 0

  bucket        = var.artifact_bucket_name
  force_destroy = false

  tags = merge(var.tags, {
    Name    = var.artifact_bucket_name
    Purpose = "revenue-ops-artifacts"
  })
}

resource "aws_s3_bucket_versioning" "artifacts" {
  count = var.enable_artifacts ? 1 : 0

  bucket = aws_s3_bucket.artifacts[0].id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  count = var.enable_artifacts ? 1 : 0

  bucket = aws_s3_bucket.artifacts[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = var.use_kms ? "aws:kms" : "AES256"
      kms_master_key_id = var.use_kms ? var.kms_key_arn : null
    }
    bucket_key_enabled = var.use_kms
  }
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  count = var.enable_artifacts ? 1 : 0

  bucket = aws_s3_bucket.artifacts[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "artifacts" {
  count = var.enable_artifacts ? 1 : 0

  bucket = aws_s3_bucket.artifacts[0].id

  rule {
    id     = "expire-old-api-packages"
    status = "Enabled"

    filter {
      prefix = "api-packages/"
    }

    expiration {
      days = 90
    }
  }
}

resource "aws_s3_object" "prefix_markers" {
  for_each = var.enable_artifacts ? toset([
    "exports/",
    "api-packages/",
    "frontend-builds/",
    "pipeline-artifacts/",
  ]) : toset([])

  bucket  = aws_s3_bucket.artifacts[0].id
  key     = each.value
  content = ""
  tags    = var.tags
}
