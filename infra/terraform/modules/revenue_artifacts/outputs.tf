output "artifact_bucket_name" {
  description = "Artifact bucket name, or null when disabled."
  value       = var.enable_artifacts ? aws_s3_bucket.artifacts[0].id : null
}

output "artifact_bucket_arn" {
  description = "Artifact bucket ARN, or null when disabled."
  value       = var.enable_artifacts ? aws_s3_bucket.artifacts[0].arn : null
}
