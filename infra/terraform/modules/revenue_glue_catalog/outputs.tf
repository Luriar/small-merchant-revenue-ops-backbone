output "glue_database_name" {
  description = "Name of the Glue Data Catalog database."
  value       = aws_glue_catalog_database.revenue_ops.name
}

output "table_names" {
  description = "List of all Glue catalog table names created in this module."
  value = [
    aws_glue_catalog_table.silver_revenue_signal.name,
    aws_glue_catalog_table.silver_demand_signal.name,
    aws_glue_catalog_table.silver_weather_signal.name,
    aws_glue_catalog_table.silver_competition_snapshot.name,
    aws_glue_catalog_table.gold_revenue_context_mart.name,
    aws_glue_catalog_table.gold_revenue_anomaly_results.name,
    aws_glue_catalog_table.gold_cause_evidence_candidates.name,
    aws_glue_catalog_table.gold_action_recommendation_candidates.name,
    aws_glue_catalog_table.gold_revenue_brief_view.name,
  ]
}
