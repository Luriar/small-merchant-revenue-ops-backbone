output "frontend_bucket_name" {
  description = "Frontend S3 bucket name, or null when disabled."
  value       = var.enable_frontend ? aws_s3_bucket.frontend[0].id : null
}

output "frontend_bucket_arn" {
  description = "Frontend S3 bucket ARN, or null when disabled."
  value       = var.enable_frontend ? aws_s3_bucket.frontend[0].arn : null
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID, or null when disabled."
  value       = var.enable_frontend ? aws_cloudfront_distribution.frontend[0].id : null
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name, or null when disabled."
  value       = var.enable_frontend ? aws_cloudfront_distribution.frontend[0].domain_name : null
}
