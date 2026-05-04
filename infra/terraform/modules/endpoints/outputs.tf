################################################################################
# Endpoints module — outputs
################################################################################

output "vpce_security_group_id" {
  description = "VPC Endpoint SG ID."
  value       = aws_security_group.vpce.id
}
