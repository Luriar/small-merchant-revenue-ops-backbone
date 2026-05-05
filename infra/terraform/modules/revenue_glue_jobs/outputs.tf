output "job_names" {
  description = "Map of logical job key to actual Glue job name for use in Step Functions definitions."
  value = {
    bronze_to_silver_revenue        = aws_glue_job.bronze_to_silver_revenue.name
    bronze_to_silver_demand         = aws_glue_job.bronze_to_silver_demand.name
    bronze_to_silver_weather        = aws_glue_job.bronze_to_silver_weather.name
    bronze_to_silver_competition    = aws_glue_job.bronze_to_silver_competition.name
    build_gold_revenue_context_mart = aws_glue_job.build_gold_revenue_context_mart.name
    detect_revenue_anomalies        = aws_glue_job.detect_revenue_anomalies.name
    link_cause_evidence             = aws_glue_job.link_cause_evidence.name
    map_action_recommendations      = aws_glue_job.map_action_recommendations.name
  }
}
