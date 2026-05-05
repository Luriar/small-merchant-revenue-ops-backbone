################################################################################
# Revenue EventBridge Scheduler
#
# Uses the newer EventBridge Scheduler API (aws_scheduler_schedule) rather than
# the legacy CloudWatch Events API. This provides timezone support, flexible
# rate expressions, and per-schedule IAM roles.
#
# Default: schedule is DISABLED (enable_schedule = false) so developers don't
# accidentally trigger runs in dev. Set enable_schedule = true when ready.
################################################################################

resource "aws_scheduler_schedule" "revenue_ops_daily" {
  name        = "${var.name_prefix}-daily-pipeline"
  description = "Triggers the Revenue Ops Medallion Pipeline daily at 2:00 AM UTC."
  group_name  = "default"

  state = var.enable_schedule ? "ENABLED" : "DISABLED"

  schedule_expression          = var.schedule_expression
  schedule_expression_timezone = "UTC"

  flexible_time_window {
    mode                      = "FLEXIBLE"
    maximum_window_in_minutes = 30
  }

  target {
    arn      = var.state_machine_arn
    role_arn = var.eventbridge_role_arn

    input = jsonencode({
      pipeline_trigger = "scheduled"
      triggered_by     = "eventbridge-scheduler"
    })

    retry_policy {
      maximum_event_age_in_seconds = 3600
      maximum_retry_attempts       = 2
    }
  }
}
