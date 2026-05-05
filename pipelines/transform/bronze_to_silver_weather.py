"""
Transform: Bronze KMA ASOS CSV → Silver weather_signal parquet.
"""
from pathlib import Path
from typing import Optional
import pandas as pd

from pipelines.common.config import bronze_path, silver_path
from pipelines.common.io import read_bronze, write_parquet
from pipelines.common.schemas import validate_schema
from pipelines.common.metadata import now_iso, make_source_tag
from pipelines.common.run_logger import create_run, mark_processing, mark_completed, mark_failed

RAIN_THRESHOLD_MM = 1.0
HEAVY_RAIN_THRESHOLD_MM = 30.0
HOT_THRESHOLD_C = 33.0
COLD_THRESHOLD_C = 0.0


def transform(year: int, quarter: int, parent_run_id: Optional[str] = None) -> Path:
    src = bronze_path("weather_asos")
    dst = silver_path("weather_signal")

    run_id = create_run(
        run_type="transform",
        target_kind="silver_schema",
        target_ref=f"weather_signal/{year}Q{quarter}",
        parent_run_id=parent_run_id,
        input_ref=str(src),
    )
    mark_processing(run_id)

    try:
        df = read_bronze(src)
        df = _normalize(df)
        validate_schema(df, "weather_signal", layer="silver")
        out = write_parquet(df, dst, f"weather_signal_{year}Q{quarter}.parquet")
        mark_completed(run_id, output_ref=str(out))
        return out
    except Exception as e:
        mark_failed(run_id, e)
        raise


def _normalize(df: pd.DataFrame) -> pd.DataFrame:
    col_map = {
        "observed_date": "observed_date",
        "station_id": "station_id",
        "station_name": "station_name",
        "avg_temp": "avg_temp",
        "min_temp": "min_temp",
        "max_temp": "max_temp",
        "daily_rainfall": "daily_rainfall",
        "avg_humidity": "avg_humidity",
    }
    out = pd.DataFrame()
    for tgt, src_col in col_map.items():
        out[tgt] = df[src_col] if src_col in df.columns else None

    for col in ["avg_temp", "min_temp", "max_temp", "avg_humidity"]:
        out[col] = pd.to_numeric(out[col], errors="coerce").fillna(0.0)
    out["daily_rainfall"] = pd.to_numeric(out["daily_rainfall"], errors="coerce").fillna(0.0)

    out["is_rain_day"] = out["daily_rainfall"] >= RAIN_THRESHOLD_MM
    out["is_heavy_rain_day"] = out["daily_rainfall"] >= HEAVY_RAIN_THRESHOLD_MM
    out["is_hot_day"] = out["max_temp"] >= HOT_THRESHOLD_C
    out["is_cold_day"] = out["min_temp"] <= COLD_THRESHOLD_C
    out["source"] = make_source_tag("weather_asos")

    return out
