variable "name_prefix" {
  type        = string
  description = "Common name prefix for all resources."
}

variable "lambda_function_names" {
  type        = list(string)
  description = "List of Lambda function names to create log groups and alarms for."
}

variable "state_machine_arn" {
  type        = string
  description = "ARN of the Step Functions state machine (used for alarm dimensions)."
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Tags applied to all resources in this module."
}
