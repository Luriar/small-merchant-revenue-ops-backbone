output "log_group_names" {
  description = "List of all CloudWatch Log Group names created by this module."
  value = concat(
    [for lg in aws_cloudwatch_log_group.lambda : lg.name],
    [
      aws_cloudwatch_log_group.glue_bronze_to_silver.name,
      aws_cloudwatch_log_group.glue_gold.name,
      aws_cloudwatch_log_group.step_functions_execution.name,
    ]
  )
}
