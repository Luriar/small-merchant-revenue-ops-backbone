locals {
  msk_topics = [
    "revenue.upload.accepted",
    "revenue.fact.normalized",
    "context.observation.collected",
    "benchmark.snapshot.loaded",
    "cause.candidate.generated",
    "action.status.changed",
    "action.outcome.evaluated",
    "platform.dlq",
  ]

  airflow_dags = [
    "daily_public_context_ingest",
    "daily_revenue_mart_build",
    "daily_cause_candidate_generation",
    "daily_action_outcome_evaluation",
    "weekly_commercial_benchmark_ingest",
    "reprocess_failed_uploads",
    "backfill_store_context",
  ]
}
