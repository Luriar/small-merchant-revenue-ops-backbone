output "data_lake_bucket_id" {
  description = "Name (ID) of the data lake S3 bucket."
  value       = aws_s3_bucket.data_lake.id
}

output "data_lake_bucket_arn" {
  description = "ARN of the data lake S3 bucket."
  value       = aws_s3_bucket.data_lake.arn
}

output "athena_results_bucket_id" {
  description = "Name (ID) of the Athena results S3 bucket."
  value       = aws_s3_bucket.athena_results.id
}

output "athena_results_bucket_arn" {
  description = "ARN of the Athena results S3 bucket."
  value       = aws_s3_bucket.athena_results.arn
}

output "kms_key_arn" {
  description = "ARN of the KMS key used for bucket encryption. Empty string when use_kms = false."
  value       = var.use_kms ? aws_kms_key.data_lake[0].arn : ""
}
