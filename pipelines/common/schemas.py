"""
Schema definitions and column-level validation for Silver and Gold layers.
Uses simple required-column checks — no heavy dependencies.
"""
from typing import Dict, List
import pandas as pd
from pipelines.common.errors import SchemaValidationError

SILVER_SCHEMAS: Dict[str, List[str]] = {
    "revenue_signal": [
        "period_type",
        "period_start",
        "period_end",
        "year",
        "quarter",
        "trade_area_code",
        "trade_area_name",
        "service_category_code",
        "service_category_name",
        "revenue_amount",
        "transaction_count",
        "weekday_revenue_amount",
        "weekend_revenue_amount",
        "source",
        "source_updated_at",
    ],
    "demand_signal": [
        "period_type",
        "period_start",
        "period_end",
        "year",
        "quarter",
        "trade_area_code",
        "trade_area_name",
        "total_population",
        "male_population",
        "female_population",
        "age_10_population",
        "age_20_population",
        "age_30_population",
        "age_40_population",
        "age_50_population",
        "age_60_plus_population",
        "time_00_06_population",
        "time_06_11_population",
        "time_11_14_population",
        "time_14_17_population",
        "time_17_21_population",
        "time_21_24_population",
        "source",
    ],
    "weather_signal": [
        "observed_date",
        "station_id",
        "station_name",
        "avg_temp",
        "min_temp",
        "max_temp",
        "daily_rainfall",
        "avg_humidity",
        "is_rain_day",
        "is_heavy_rain_day",
        "is_hot_day",
        "is_cold_day",
        "source",
    ],
    "competition_snapshot": [
        "snapshot_date",
        "year",
        "quarter",
        "district_name",
        "administrative_dong",
        "trade_area_code",
        "service_category_code",
        "service_category_name",
        "store_count",
        "source",
    ],
    "holiday_context": [
        "date",
        "holiday_name",
        "is_holiday",
        "source",
    ],
    "local_event_context": [
        "event_id",
        "event_name",
        "district_name",
        "place_name",
        "start_date",
        "end_date",
        "is_free",
        "category",
        "latitude",
        "longitude",
        "source",
    ],
}

GOLD_SCHEMAS: Dict[str, List[str]] = {
    "revenue_context_mart": [
        "period_start",
        "period_end",
        "year",
        "quarter",
        "trade_area_code",
        "trade_area_name",
        "service_category_code",
        "service_category_name",
        "revenue_amount",
        "transaction_count",
        "revenue_change_pct",
        "transaction_change_pct",
        "total_population",
        "population_change_pct",
        "store_count",
        "store_count_change",
        "rain_day_count",
        "heavy_rain_day_count",
        "hot_day_count",
        "cold_day_count",
        "holiday_count",
        "local_event_count",
        "source_coverage_score",
    ],
    "revenue_anomaly_results": [
        "anomaly_id",
        "trade_area_code",
        "trade_area_name",
        "service_category_code",
        "service_category_name",
        "metric",
        "baseline_period",
        "compare_period",
        "baseline_value",
        "actual_value",
        "delta_pct",
        "severity_score",
        "anomaly_type",
        "detected_at",
    ],
    "cause_evidence_candidates": [
        "evidence_id",
        "anomaly_id",
        "evidence_type",
        "evidence_strength",
        "summary",
        "source_ref",
        "metric_name",
        "baseline_value",
        "actual_value",
        "delta_pct",
    ],
    "action_recommendation_candidates": [
        "action_id",
        "anomaly_id",
        "action_type",
        "title",
        "description",
        "why_this_action",
        "expected_effect",
        "risk_note",
        "status",
    ],
    "revenue_brief_view": [
        "brief_id",
        "trade_area_code",
        "trade_area_name",
        "service_category_code",
        "service_category_name",
        "period_label",
        "headline",
        "summary",
        "top_cause_candidates",
        "recommended_actions",
        "data_freshness",
        "generated_at",
    ],
}


def validate_schema(df: pd.DataFrame, schema_name: str, layer: str = "silver") -> None:
    schemas = SILVER_SCHEMAS if layer == "silver" else GOLD_SCHEMAS
    if schema_name not in schemas:
        raise SchemaValidationError(f"Unknown schema '{schema_name}' in layer '{layer}'")
    required = schemas[schema_name]
    missing = [col for col in required if col not in df.columns]
    if missing:
        raise SchemaValidationError(
            f"Schema '{schema_name}' missing required columns: {missing}"
        )


def get_required_columns(schema_name: str, layer: str = "silver") -> List[str]:
    schemas = SILVER_SCHEMAS if layer == "silver" else GOLD_SCHEMAS
    return schemas.get(schema_name, [])
