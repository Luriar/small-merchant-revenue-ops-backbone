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
