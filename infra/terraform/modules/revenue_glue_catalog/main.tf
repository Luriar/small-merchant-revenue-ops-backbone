################################################################################
# Revenue Glue Data Catalog
#
# Creates the Glue database and table schemas for the medallion layers:
#   Silver: revenue_signal, demand_signal, weather_signal, competition_snapshot
#   Gold:   revenue_context_mart, revenue_anomaly_results,
#           cause_evidence_candidates, action_recommendation_candidates,
#           revenue_brief_view
################################################################################

resource "aws_glue_catalog_database" "revenue_ops" {
  name        = var.glue_database_name
  description = "Revenue Ops medallion ETL catalog — Silver and Gold layer tables."
}

################################################################################
# Silver layer tables
################################################################################

resource "aws_glue_catalog_table" "silver_revenue_signal" {
  database_name = aws_glue_catalog_database.revenue_ops.name
  name          = "silver_revenue_signal"
  description   = "Cleaned revenue signal data aggregated by period and trade area."

  table_type = "EXTERNAL_TABLE"

  parameters = {
    "classification"     = "parquet"
    "parquet.compress"   = "SNAPPY"
    "EXTERNAL"           = "TRUE"
    "projection.enabled" = "false"
  }

  storage_descriptor {
    location      = "s3://${var.data_lake_bucket_id}/silver/revenue_signal/"
    input_format  = "org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat"
    output_format = "org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat"

    ser_de_info {
      serialization_library = "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe"
      parameters = {
        "serialization.format" = "1"
      }
    }

    columns {
      name    = "period_type"
      type    = "string"
      comment = "monthly | quarterly"
    }
    columns {
      name = "period_start"
      type = "date"
    }
    columns {
      name = "period_end"
      type = "date"
    }
    columns {
      name = "year"
      type = "int"
    }
    columns {
      name = "quarter"
      type = "int"
    }
    columns {
      name = "trade_area_code"
      type = "string"
    }
    columns {
      name = "trade_area_name"
      type = "string"
    }
    columns {
      name = "service_category_code"
      type = "string"
    }
    columns {
      name = "service_category_name"
      type = "string"
    }
    columns {
      name    = "revenue_amount"
      type    = "double"
      comment = "Estimated revenue in KRW"
    }
    columns {
      name = "transaction_count"
      type = "bigint"
    }
    columns {
      name = "weekday_revenue_amount"
      type = "double"
    }
    columns {
      name = "weekend_revenue_amount"
      type = "double"
    }
    columns {
      name = "source"
      type = "string"
    }
    columns {
      name = "source_updated_at"
      type = "timestamp"
    }
  }
}

resource "aws_glue_catalog_table" "silver_demand_signal" {
  database_name = aws_glue_catalog_database.revenue_ops.name
  name          = "silver_demand_signal"
  description   = "Population and time-band demand signal by trade area and period."

  table_type = "EXTERNAL_TABLE"

  parameters = {
    "classification"   = "parquet"
    "parquet.compress" = "SNAPPY"
    "EXTERNAL"         = "TRUE"
  }

  storage_descriptor {
    location      = "s3://${var.data_lake_bucket_id}/silver/demand_signal/"
    input_format  = "org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat"
    output_format = "org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat"

    ser_de_info {
      serialization_library = "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe"
      parameters = {
        "serialization.format" = "1"
      }
    }

    columns {
      name = "period_type"
      type = "string"
    }
    columns {
      name = "period_start"
      type = "date"
    }
    columns {
      name = "period_end"
      type = "date"
    }
    columns {
      name = "year"
      type = "int"
    }
    columns {
      name = "quarter"
      type = "int"
    }
    columns {
      name = "trade_area_code"
      type = "string"
    }
    columns {
      name = "trade_area_name"
      type = "string"
    }
    columns {
      name = "total_population"
      type = "bigint"
    }
    columns {
      name = "male_population"
      type = "bigint"
    }
    columns {
      name = "female_population"
      type = "bigint"
    }
    columns {
      name = "age_10_population"
      type = "bigint"
    }
    columns {
      name = "age_20_population"
      type = "bigint"
    }
    columns {
      name = "age_30_population"
      type = "bigint"
    }
    columns {
      name = "age_40_population"
      type = "bigint"
    }
    columns {
      name = "age_50_population"
      type = "bigint"
    }
    columns {
      name = "age_60_plus_population"
      type = "bigint"
    }
    columns {
      name    = "time_00_06"
      type    = "bigint"
      comment = "Foot traffic 00:00-06:00"
    }
    columns {
      name    = "time_06_11"
      type    = "bigint"
      comment = "Foot traffic 06:00-11:00"
    }
    columns {
      name    = "time_11_14"
      type    = "bigint"
      comment = "Foot traffic 11:00-14:00"
    }
    columns {
      name    = "time_14_17"
      type    = "bigint"
      comment = "Foot traffic 14:00-17:00"
    }
    columns {
      name    = "time_17_21"
      type    = "bigint"
      comment = "Foot traffic 17:00-21:00"
    }
    columns {
      name    = "time_21_24"
      type    = "bigint"
      comment = "Foot traffic 21:00-24:00"
    }
    columns {
      name = "source"
      type = "string"
    }
  }
}

resource "aws_glue_catalog_table" "silver_weather_signal" {
  database_name = aws_glue_catalog_database.revenue_ops.name
  name          = "silver_weather_signal"
  description   = "Daily weather observations from KMA ASOS stations."

  table_type = "EXTERNAL_TABLE"

  parameters = {
    "classification"   = "parquet"
    "parquet.compress" = "SNAPPY"
    "EXTERNAL"         = "TRUE"
  }

  storage_descriptor {
    location      = "s3://${var.data_lake_bucket_id}/silver/weather_signal/"
    input_format  = "org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat"
    output_format = "org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat"

    ser_de_info {
      serialization_library = "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe"
      parameters = {
        "serialization.format" = "1"
      }
    }

    columns {
      name = "observed_date"
      type = "date"
    }
    columns {
      name = "station_id"
      type = "string"
    }
    columns {
      name = "station_name"
      type = "string"
    }
    columns {
      name    = "avg_temp"
      type    = "double"
      comment = "Average temperature (°C)"
    }
    columns {
      name = "min_temp"
      type = "double"
    }
    columns {
      name = "max_temp"
      type = "double"
    }
    columns {
      name    = "daily_rainfall"
      type    = "double"
      comment = "Daily precipitation (mm)"
    }
    columns {
      name    = "avg_humidity"
      type    = "double"
      comment = "Average relative humidity (%)"
    }
    columns {
      name = "is_rain_day"
      type = "boolean"
    }
    columns {
      name = "is_heavy_rain_day"
      type = "boolean"
    }
    columns {
      name = "is_hot_day"
      type = "boolean"
    }
    columns {
      name = "is_cold_day"
      type = "boolean"
    }
    columns {
      name = "source"
      type = "string"
    }
  }
}

resource "aws_glue_catalog_table" "silver_competition_snapshot" {
  database_name = aws_glue_catalog_database.revenue_ops.name
  name          = "silver_competition_snapshot"
  description   = "Quarterly snapshot of competitor store counts by trade area and service category."

  table_type = "EXTERNAL_TABLE"

  parameters = {
    "classification"   = "parquet"
    "parquet.compress" = "SNAPPY"
    "EXTERNAL"         = "TRUE"
  }

  storage_descriptor {
    location      = "s3://${var.data_lake_bucket_id}/silver/competition_snapshot/"
    input_format  = "org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat"
    output_format = "org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat"

    ser_de_info {
      serialization_library = "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe"
      parameters = {
        "serialization.format" = "1"
      }
    }

    columns {
      name = "snapshot_date"
      type = "date"
    }
    columns {
      name = "year"
      type = "int"
    }
    columns {
      name = "quarter"
      type = "int"
    }
    columns {
      name = "district_name"
      type = "string"
    }
    columns {
      name = "administrative_dong"
      type = "string"
    }
    columns {
      name = "trade_area_code"
      type = "string"
    }
    columns {
      name = "service_category_code"
      type = "string"
    }
    columns {
      name = "service_category_name"
      type = "string"
    }
    columns {
      name    = "store_count"
      type    = "int"
      comment = "Number of active stores in this trade area / category"
    }
    columns {
      name = "source"
      type = "string"
    }
  }
}

################################################################################
# Gold layer tables
################################################################################

resource "aws_glue_catalog_table" "gold_revenue_context_mart" {
  database_name = aws_glue_catalog_database.revenue_ops.name
  name          = "gold_revenue_context_mart"
  description   = "Joined mart combining revenue, demand, weather, and competition signals."

  table_type = "EXTERNAL_TABLE"

  parameters = {
    "classification"   = "parquet"
    "parquet.compress" = "SNAPPY"
    "EXTERNAL"         = "TRUE"
  }

  storage_descriptor {
    location      = "s3://${var.data_lake_bucket_id}/gold/revenue_context_mart/"
    input_format  = "org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat"
    output_format = "org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat"

    ser_de_info {
      serialization_library = "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe"
      parameters = {
        "serialization.format" = "1"
      }
    }

    columns {
      name = "period_type"
      type = "string"
    }
    columns {
      name = "period_start"
      type = "date"
    }
    columns {
      name = "period_end"
      type = "date"
    }
    columns {
      name = "year"
      type = "int"
    }
    columns {
      name = "quarter"
      type = "int"
    }
    columns {
      name = "trade_area_code"
      type = "string"
    }
    columns {
      name = "trade_area_name"
      type = "string"
    }
    columns {
      name = "service_category_code"
      type = "string"
    }
    columns {
      name = "service_category_name"
      type = "string"
    }
    columns {
      name = "revenue_amount"
      type = "double"
    }
    columns {
      name = "transaction_count"
      type = "bigint"
    }
    columns {
      name = "weekday_revenue_amount"
      type = "double"
    }
    columns {
      name = "weekend_revenue_amount"
      type = "double"
    }
    columns {
      name = "total_population"
      type = "bigint"
    }
    columns {
      name = "store_count"
      type = "int"
    }
    columns {
      name = "revenue_per_capita"
      type = "double"
    }
    columns {
      name = "revenue_per_store"
      type = "double"
    }
    columns {
      name = "avg_temp"
      type = "double"
    }
    columns {
      name = "rain_days"
      type = "int"
    }
    columns {
      name = "created_at"
      type = "timestamp"
    }
  }
}

resource "aws_glue_catalog_table" "gold_revenue_anomaly_results" {
  database_name = aws_glue_catalog_database.revenue_ops.name
  name          = "gold_revenue_anomaly_results"
  description   = "Statistical anomaly detection results for revenue signals."

  table_type = "EXTERNAL_TABLE"

  parameters = {
    "classification"   = "parquet"
    "parquet.compress" = "SNAPPY"
    "EXTERNAL"         = "TRUE"
  }

  storage_descriptor {
    location      = "s3://${var.data_lake_bucket_id}/gold/revenue_anomaly_results/"
    input_format  = "org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat"
    output_format = "org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat"

    ser_de_info {
      serialization_library = "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe"
      parameters = {
        "serialization.format" = "1"
      }
    }

    columns {
      name = "period_start"
      type = "date"
    }
    columns {
      name = "trade_area_code"
      type = "string"
    }
    columns {
      name = "service_category_code"
      type = "string"
    }
    columns {
      name = "revenue_amount"
      type = "double"
    }
    columns {
      name = "revenue_mean"
      type = "double"
    }
    columns {
      name = "revenue_stddev"
      type = "double"
    }
    columns {
      name = "z_score"
      type = "double"
    }
    columns {
      name    = "is_anomaly"
      type    = "boolean"
      comment = "True if |z_score| > threshold"
    }
    columns {
      name    = "anomaly_direction"
      type    = "string"
      comment = "UP | DOWN | null"
    }
    columns {
      name = "anomaly_severity"
      type = "string"
    }
    columns {
      name = "detection_method"
      type = "string"
    }
    columns {
      name = "created_at"
      type = "timestamp"
    }
  }
}

resource "aws_glue_catalog_table" "gold_cause_evidence_candidates" {
  database_name = aws_glue_catalog_database.revenue_ops.name
  name          = "gold_cause_evidence_candidates"
  description   = "Candidate causal evidence linked to detected revenue anomalies."

  table_type = "EXTERNAL_TABLE"

  parameters = {
    "classification"   = "parquet"
    "parquet.compress" = "SNAPPY"
    "EXTERNAL"         = "TRUE"
  }

  storage_descriptor {
    location      = "s3://${var.data_lake_bucket_id}/gold/cause_evidence_candidates/"
    input_format  = "org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat"
    output_format = "org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat"

    ser_de_info {
      serialization_library = "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe"
      parameters = {
        "serialization.format" = "1"
      }
    }

    columns {
      name = "anomaly_id"
      type = "string"
    }
    columns {
      name = "period_start"
      type = "date"
    }
    columns {
      name = "trade_area_code"
      type = "string"
    }
    columns {
      name = "service_category_code"
      type = "string"
    }
    columns {
      name = "cause_type"
      type = "string"
    }
    columns {
      name = "cause_description"
      type = "string"
    }
    columns {
      name = "evidence_strength"
      type = "double"
    }
    columns {
      name = "signal_source"
      type = "string"
    }
    columns {
      name = "created_at"
      type = "timestamp"
    }
  }
}

resource "aws_glue_catalog_table" "gold_action_recommendation_candidates" {
  database_name = aws_glue_catalog_database.revenue_ops.name
  name          = "gold_action_recommendation_candidates"
  description   = "Recommended actions for merchants based on anomaly cause evidence."

  table_type = "EXTERNAL_TABLE"

  parameters = {
    "classification"   = "parquet"
    "parquet.compress" = "SNAPPY"
    "EXTERNAL"         = "TRUE"
  }

  storage_descriptor {
    location      = "s3://${var.data_lake_bucket_id}/gold/action_recommendation_candidates/"
    input_format  = "org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat"
    output_format = "org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat"

    ser_de_info {
      serialization_library = "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe"
      parameters = {
        "serialization.format" = "1"
      }
    }

    columns {
      name = "recommendation_id"
      type = "string"
    }
    columns {
      name = "anomaly_id"
      type = "string"
    }
    columns {
      name = "trade_area_code"
      type = "string"
    }
    columns {
      name = "service_category_code"
      type = "string"
    }
    columns {
      name = "action_type"
      type = "string"
    }
    columns {
      name = "action_description"
      type = "string"
    }
    columns {
      name = "priority_score"
      type = "double"
    }
    columns {
      name = "expected_impact"
      type = "string"
    }
    columns {
      name = "created_at"
      type = "timestamp"
    }
  }
}

resource "aws_glue_catalog_table" "gold_revenue_brief_view" {
  database_name = aws_glue_catalog_database.revenue_ops.name
  name          = "gold_revenue_brief_view"
  description   = "Executive summary view: anomalies, causes, and recommended actions per merchant."

  table_type = "EXTERNAL_TABLE"

  parameters = {
    "classification"   = "parquet"
    "parquet.compress" = "SNAPPY"
    "EXTERNAL"         = "TRUE"
  }

  storage_descriptor {
    location      = "s3://${var.data_lake_bucket_id}/gold/revenue_brief_view/"
    input_format  = "org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat"
    output_format = "org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat"

    ser_de_info {
      serialization_library = "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe"
      parameters = {
        "serialization.format" = "1"
      }
    }

    columns {
      name = "brief_date"
      type = "date"
    }
    columns {
      name = "trade_area_code"
      type = "string"
    }
    columns {
      name = "trade_area_name"
      type = "string"
    }
    columns {
      name = "service_category_name"
      type = "string"
    }
    columns {
      name = "revenue_amount"
      type = "double"
    }
    columns {
      name = "revenue_change_pct"
      type = "double"
    }
    columns {
      name = "anomaly_detected"
      type = "boolean"
    }
    columns {
      name = "anomaly_direction"
      type = "string"
    }
    columns {
      name = "top_cause"
      type = "string"
    }
    columns {
      name = "top_action"
      type = "string"
    }
    columns {
      name = "created_at"
      type = "timestamp"
    }
  }
}
