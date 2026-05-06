locals {
  s3_partition_conventions = [
    "dataset=revenue_daily_facts/year=YYYY/month=MM/day=DD/",
    "dataset=revenue_item_facts/year=YYYY/month=MM/day=DD/",
    "dataset=context_observations/year=YYYY/month=MM/day=DD/",
    "dataset=store_revenue_daily_mart/year=YYYY/month=MM/day=DD/",
  ]

  glue_tables = [
    "revenue_daily_facts",
    "revenue_item_facts",
    "context_observations",
    "store_revenue_daily_mart",
  ]
}
