################################################################################
# Network module — outputs
################################################################################

output "vpc_id" {
  description = "VPC ID. 다른 모듈이 참조."
  value       = aws_vpc.main.id
}

output "vpc_cidr" {
  description = "VPC CIDR. SG inbound 규칙 등에 사용."
  value       = aws_vpc.main.cidr_block
}

output "public_subnet_ids" {
  description = "Public subnet ID 리스트. bastion / 향후 ALB가 사용."
  value       = [aws_subnet.public_a.id, aws_subnet.public_b.id]
}

output "private_app_subnet_ids" {
  description = "Private app subnet ID 리스트. M2 EKS가 사용."
  value       = [aws_subnet.private_app_a.id, aws_subnet.private_app_b.id]
}

output "private_db_subnet_ids" {
  description = "Private DB subnet ID 리스트. Aurora subnet group이 사용."
  value       = [aws_subnet.private_db_a.id, aws_subnet.private_db_b.id]
}

output "public_route_table_id" {
  description = "Public route table ID. S3 Gateway endpoint 연결에 사용."
  value       = aws_route_table.public.id
}

output "private_app_route_table_ids" {
  description = "Private app route table ID 리스트. S3 Gateway endpoint 연결에 사용."
  value       = [aws_route_table.private_app_a.id, aws_route_table.private_app_b.id]
}

output "private_db_route_table_ids" {
  description = "Private DB route table ID 리스트. S3 Gateway endpoint 연결에 사용."
  value       = [aws_route_table.private_db_a.id, aws_route_table.private_db_b.id]
}

output "internet_gateway_id" {
  description = "IGW ID. M2 NAT 추가 시 EIP DependsOn에 사용."
  value       = aws_internet_gateway.main.id
}
