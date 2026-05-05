variable "name_prefix" {
  type        = string
  description = "Common name prefix for all resources."
}

variable "step_functions_role_arn" {
  type        = string
  description = "ARN of the IAM role for the Step Functions state machine."
}

variable "weather_lambda_arn" {
  type        = string
  description = "ARN of the fetch_weather_asos Lambda function."
}

variable "holidays_lambda_arn" {
  type        = string
  description = "ARN of the fetch_holidays Lambda function."
}

variable "local_events_lambda_arn" {
  type        = string
  description = "ARN of the fetch_local_events Lambda function."
}

variable "glue_job_names" {
  type        = map(string)
  description = "Map of logical job key to actual Glue job name (from revenue_glue_jobs module output)."
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Tags applied to all resources in this module."
}
