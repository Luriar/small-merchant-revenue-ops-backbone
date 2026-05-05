variable "name_prefix" {
  type        = string
  description = "Common name prefix for all resources."
}

variable "enable_schedule" {
  type        = bool
  default     = false
  description = "Set to true to enable the daily schedule. Keep false in dev until ready for automated runs."
}

variable "schedule_expression" {
  type        = string
  default     = "cron(0 2 * * ? *)"
  description = "EventBridge Scheduler cron expression. Default: 2:00 AM UTC daily."
}

variable "state_machine_arn" {
  type        = string
  description = "ARN of the Step Functions state machine to trigger."
}

variable "eventbridge_role_arn" {
  type        = string
  description = "ARN of the IAM role that EventBridge Scheduler uses to invoke Step Functions."
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Tags applied to all resources in this module."
}
