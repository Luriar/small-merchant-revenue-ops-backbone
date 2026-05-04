################################################################################
# Bastion module — outputs
################################################################################

output "instance_id" {
  description = "Bastion EC2 instance ID. SSM session 시작에 사용."
  value       = aws_instance.bastion.id
}

output "iam_role_arn" {
  description = "Bastion IAM role ARN."
  value       = aws_iam_role.bastion.arn
}

output "ssm_session_command" {
  description = "Bastion SSM session 시작 명령어 (복사해서 사용)."
  value       = "aws ssm start-session --target ${aws_instance.bastion.id} --region ${data.aws_region.current.name}"
}
