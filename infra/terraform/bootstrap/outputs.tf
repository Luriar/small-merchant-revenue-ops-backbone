output "state_bucket_name" {
  description = "S3 bucket name for Terraform remote state — use in envs/revenue-dev/backend.tf"
  value       = aws_s3_bucket.tfstate.id
}

output "dynamodb_table_name" {
  description = "DynamoDB table name for state locking — use in envs/revenue-dev/backend.tf"
  value       = aws_dynamodb_table.tflock.id
}

output "aws_region" {
  description = "AWS region where the backend resources were created"
  value       = var.aws_region
}

output "backend_config_snippet" {
  description = "Ready-to-paste backend block for envs/revenue-dev/backend.tf"
  value       = <<-EOT
    terraform {
      backend "s3" {
        bucket         = "${aws_s3_bucket.tfstate.id}"
        key            = "revenue-ops/revenue-dev/terraform.tfstate"
        region         = "${var.aws_region}"
        dynamodb_table = "${aws_dynamodb_table.tflock.id}"
        encrypt        = true
      }
    }
  EOT
}
