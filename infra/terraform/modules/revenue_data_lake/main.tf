################################################################################
# Revenue Data Lake — S3 Medallion Architecture
#
# Layers:
#   bronze/   — raw ingested data (immutable, JSON/CSV)
#   silver/   — cleaned & typed Parquet
#   gold/     — analytics-ready marts
#   error/    — records that failed transformation
#   metadata/ — schema snapshots, data quality reports
#   runs/     — Step Functions execution logs
#   scripts/  — Glue job scripts deployed here
#   artifacts/— packaging artifacts (Lambda ZIPs, etc.)
################################################################################

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

################################################################################
# Optional KMS Key
################################################################################

resource "aws_kms_key" "data_lake" {
  count = var.use_kms ? 1 : 0

  description             = "KMS key for ${var.name_prefix} data lake encryption"
  deletion_window_in_days = 14
  enable_key_rotation     = true

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-data-lake-kms"
  })
}

resource "aws_kms_alias" "data_lake" {
  count = var.use_kms ? 1 : 0

  name          = "alias/${var.name_prefix}-data-lake"
  target_key_id = aws_kms_key.data_lake[0].key_id
}

################################################################################
# Data Lake bucket
################################################################################

resource "aws_s3_bucket" "data_lake" {
  bucket        = var.data_lake_bucket_name
  force_destroy = false

  tags = merge(var.tags, {
    Name    = var.data_lake_bucket_name
    Purpose = "data-lake"
  })
}

resource "aws_s3_bucket_versioning" "data_lake" {
  bucket = aws_s3_bucket.data_lake.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "data_lake" {
  bucket = aws_s3_bucket.data_lake.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = var.use_kms ? "aws:kms" : "AES256"
      kms_master_key_id = var.use_kms ? aws_kms_key.data_lake[0].arn : null
    }
    bucket_key_enabled = var.use_kms ? true : false
  }
}

resource "aws_s3_bucket_public_access_block" "data_lake" {
  bucket = aws_s3_bucket.data_lake.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Lifecycle: transition Bronze to cheaper storage after 90 days,
# expire Silver source objects after 365 days
resource "aws_s3_bucket_lifecycle_configuration" "data_lake" {
  bucket = aws_s3_bucket.data_lake.id

  rule {
    id     = "bronze-ia-transition"
    status = "Enabled"

    filter {
      prefix = "bronze/"
    }

    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 365
      storage_class = "GLACIER"
    }
  }

  rule {
    id     = "silver-ia-transition"
    status = "Enabled"

    filter {
      prefix = "silver/"
    }

    transition {
      days          = 180
      storage_class = "STANDARD_IA"
    }
  }

  rule {
    id     = "error-expiry"
    status = "Enabled"

    filter {
      prefix = "error/"
    }

    expiration {
      days = 90
    }
  }

  rule {
    id     = "runs-expiry"
    status = "Enabled"

    filter {
      prefix = "runs/"
    }

    expiration {
      days = 60
    }
  }
}

# Folder marker objects (S3 prefixes)
resource "aws_s3_object" "folder_markers" {
  for_each = toset([
    "bronze/",
    "silver/",
    "gold/",
    "error/",
    "metadata/",
    "runs/",
    "scripts/",
    "artifacts/",
  ])

  bucket  = aws_s3_bucket.data_lake.id
  key     = each.value
  content = ""

  tags = var.tags
}

################################################################################
# Athena results bucket
################################################################################

resource "aws_s3_bucket" "athena_results" {
  bucket        = var.athena_results_bucket_name
  force_destroy = false

  tags = merge(var.tags, {
    Name    = var.athena_results_bucket_name
    Purpose = "athena-results"
  })
}

resource "aws_s3_bucket_versioning" "athena_results" {
  bucket = aws_s3_bucket.athena_results.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "athena_results" {
  bucket = aws_s3_bucket.athena_results.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = var.use_kms ? "aws:kms" : "AES256"
      kms_master_key_id = var.use_kms ? aws_kms_key.data_lake[0].arn : null
    }
    bucket_key_enabled = var.use_kms ? true : false
  }
}

resource "aws_s3_bucket_public_access_block" "athena_results" {
  bucket = aws_s3_bucket.athena_results.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "athena_results" {
  bucket = aws_s3_bucket.athena_results.id

  rule {
    id     = "athena-results-expiry"
    status = "Enabled"

    filter {
      prefix = ""
    }

    expiration {
      days = 30
    }
  }
}
