output "vpc_id" {
  description = "Revenue Ops-owned VPC ID. Null when disabled."
  value       = try(aws_vpc.main[0].id, null)
}

output "private_subnet_ids" {
  description = "Private isolated subnet IDs for Aurora."
  value       = [for subnet in aws_subnet.private : subnet.id]
}

output "lambda_security_group_id" {
  description = "Future Lambda runtime security group ID. Null when disabled."
  value       = try(aws_security_group.lambda[0].id, null)
}

output "aurora_security_group_id" {
  description = "Aurora security group ID. Null when disabled."
  value       = try(aws_security_group.aurora[0].id, null)
}


output "vpc_endpoint_security_group_id" {
  description = "Security group ID for private interface VPC endpoints. Null when disabled."
  value       = try(aws_security_group.vpc_endpoint[0].id, null)
}

output "secretsmanager_vpc_endpoint_id" {
  description = "Secrets Manager interface VPC endpoint ID. Null when disabled."
  value       = try(aws_vpc_endpoint.secretsmanager[0].id, null)
}

output "s3_vpc_endpoint_id" {
  description = "S3 gateway VPC endpoint ID. Null when disabled."
  value       = try(aws_vpc_endpoint.s3[0].id, null)
}
