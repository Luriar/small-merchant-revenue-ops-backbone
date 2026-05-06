locals {
  bronze_prefixes = [
    "raw/revenue_uploads/",
    "raw/context/",
    "rejected/revenue_uploads/",
    "bronze/revenue/",
    "silver/revenue_daily_facts/",
    "silver/context_observations/",
    "gold/store_revenue_daily_mart/",
  ]

  job_queues = [
    "upload-parse-queue",
    "context-collect-queue",
    "mart-build-queue",
    "action-outcome-eval-queue",
  ]

  schedules = [
    "daily-context-collector",
    "nightly-mart-build",
    "daily-action-outcome-eval",
    "weekly-benchmark-collector",
  ]

  workflows = [
    "upload_parse_workflow",
    "context_collect_workflow",
    "mart_build_workflow",
    "action_outcome_eval_workflow",
  ]
}
