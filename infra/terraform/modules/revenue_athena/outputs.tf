output "workgroup_name" {
  description = "Name of the Athena workgroup."
  value       = aws_athena_workgroup.revenue_ops.name
}

output "workgroup_arn" {
  description = "ARN of the Athena workgroup."
  value       = aws_athena_workgroup.revenue_ops.arn
}
