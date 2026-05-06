output "vpc_id" {
  description = "Revenue Ops-owned VPC ID. Null when disabled."
  value       = try(aws_vpc.main[0].id, null)
}

output "private_subnet_ids" {
  description = "Private isolated subnet IDs for Aurora."
  value       = [for subnet in aws_subnet.private : subnet.id]
}

output "vpc_egress_profile" {
  description = "Configured VPC egress profile: none, single_nat, or multi_az_nat."
  value       = var.enable_network ? var.vpc_egress_profile : "none"
}

output "public_subnet_ids" {
  description = "Public NAT subnet IDs. Empty when vpc_egress_profile is none."
  value       = [for subnet in aws_subnet.public : subnet.id]
}

output "nat_gateway_ids" {
  description = "NAT Gateway IDs. Empty when vpc_egress_profile is none."
  value       = [for nat in aws_nat_gateway.egress : nat.id]
}

output "nat_eip_public_ips" {
  description = "NAT Elastic IP public addresses. Empty when vpc_egress_profile is none."
  value       = [for eip in aws_eip.nat : eip.public_ip]
}

output "lambda_private_route_table_ids" {
  description = "Route table IDs associated with Lambda private subnets."
  value       = local.private_route_table_ids
}

output "lambda_private_subnet_ids" {
  description = "Private subnet IDs used by the Revenue Ops Lambda."
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
