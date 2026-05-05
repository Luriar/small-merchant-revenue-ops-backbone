################################################################################
# Bootstrap: Terraform state backend (S3 + DynamoDB)
#
# This directory is applied only once. It creates the state backend itself,
# so its own state is kept locally (avoiding the chicken-and-egg problem).
#
# Usage:
#   cd bootstrap
#   terraform init
#   terraform apply -var='state_bucket_name=revenue-ops-tfstate-YOURACCOUNTID'
#
# After apply, use the outputs in envs/revenue-dev/backend.tf.
#
# Note:
#   - Do NOT commit terraform.tfstate from this directory (.gitignore handles it)
#   - Apply once, rarely touch again
################################################################################

data "aws_caller_identity" "current" {}

################################################################################
# Random suffix — ensures globally unique S3 bucket name
################################################################################

resource "random_id" "bucket_suffix" {
  byte_length = 4
}

################################################################################
# State bucket
################################################################################

resource "aws_s3_bucket" "tfstate" {
  bucket        = var.state_bucket_name != "" ? var.state_bucket_name : "${var.project_name}-tfstate-${random_id.bucket_suffix.hex}"
  force_destroy = false

  tags = merge(var.tags, {
    Name        = "${var.project_name}-tfstate"
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
    Purpose     = "tf-state-backend"
  })
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

################################################################################
# Lock table — prevents concurrent applies
################################################################################

resource "aws_dynamodb_table" "tflock" {
  name         = "${var.project_name}-tflock"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  tags = merge(var.tags, {
    Name        = "${var.project_name}-tflock"
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
    Purpose     = "tf-state-lock"
  })
}
