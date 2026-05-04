################################################################################
# Bootstrap: Terraform state backend (S3 + DynamoDB)
#
# 이 디렉토리는 1회만 apply한다. State backend 자체를 만드는 모듈이라
# 자기 자신의 state는 로컬에 둔다 (chicken-and-egg 회피).
#
# 실행 방법:
#   cd bootstrap
#   terraform init
#   terraform apply
#
# apply 후 출력된 bucket 이름과 dynamodb table 이름을 envs/dev/backend.tf에 사용한다.
#
# 주의:
#   - 이 디렉토리의 terraform.tfstate는 git에 올리지 말 것 (.gitignore 처리)
#   - 한 번 만든 후 거의 건드릴 일 없음
################################################################################

terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  # backend 없음 — 로컬 state 사용
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = var.project_name
      ManagedBy = "terraform"
      Purpose   = "tf-state-backend"
    }
  }
}

variable "aws_region" {
  description = "Backend 리소스를 만들 region. envs/dev와 같은 region 권장."
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "리소스 이름 prefix"
  type        = string
  default     = "productops"
}

################################################################################
# 랜덤 suffix — bucket 이름 글로벌 유일성 확보
################################################################################

resource "random_id" "bucket_suffix" {
  byte_length = 4
}

################################################################################
# State bucket
################################################################################

resource "aws_s3_bucket" "tfstate" {
  bucket        = "${var.project_name}-tfstate-${random_id.bucket_suffix.hex}"
  force_destroy = false # state bucket은 실수로 지워지면 안 됨

  tags = {
    Name = "${var.project_name}-tfstate"
  }
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
# Lock table (concurrent apply 방지)
################################################################################

resource "aws_dynamodb_table" "tflock" {
  name         = "${var.project_name}-tflock"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  tags = {
    Name = "${var.project_name}-tflock"
  }
}

################################################################################
# Outputs — envs/dev/backend.tf 에 그대로 복사해서 사용
################################################################################

output "tfstate_bucket" {
  description = "envs/dev/backend.tf의 bucket 값"
  value       = aws_s3_bucket.tfstate.id
}

output "tflock_table" {
  description = "envs/dev/backend.tf의 dynamodb_table 값"
  value       = aws_dynamodb_table.tflock.id
}

output "aws_region" {
  description = "envs/dev/backend.tf의 region 값"
  value       = var.aws_region
}

output "backend_config_snippet" {
  description = "envs/dev/backend.tf에 그대로 복사할 backend 설정"
  value       = <<-EOT
    terraform {
      backend "s3" {
        bucket         = "${aws_s3_bucket.tfstate.id}"
        key            = "envs/dev/terraform.tfstate"
        region         = "${var.aws_region}"
        dynamodb_table = "${aws_dynamodb_table.tflock.id}"
        encrypt        = true
      }
    }
  EOT
}
