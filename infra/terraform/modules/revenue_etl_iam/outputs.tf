output "lambda_role_arn" {
  description = "ARN of the IAM role used by Lambda extractor functions."
  value       = aws_iam_role.lambda_extractor.arn
}

output "glue_role_arn" {
  description = "ARN of the IAM role used by Glue ETL jobs."
  value       = aws_iam_role.glue_job.arn
}

output "step_functions_role_arn" {
  description = "ARN of the IAM role used by the Step Functions state machine."
  value       = aws_iam_role.step_functions.arn
}

output "eventbridge_role_arn" {
  description = "ARN of the IAM role used by EventBridge Scheduler to invoke Step Functions."
  value       = aws_iam_role.eventbridge_invoke.arn
}
