output "controller_role_arn" {
  description = "Karpenter controller IAM role ARN. Helm values에 IRSA annotation으로 주입."
  value       = aws_iam_role.karpenter_controller.arn
}

output "interruption_queue_name" {
  value = aws_sqs_queue.interruption.name
}

output "interruption_queue_arn" {
  value = aws_sqs_queue.interruption.arn
}
