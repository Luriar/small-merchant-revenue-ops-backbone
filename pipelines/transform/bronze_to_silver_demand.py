"""
Transform: Bronze Seoul population CSV → Silver demand_signal parquet.
"""
from pathlib import Path
from typing import Optional
import pandas as pd

from pipelines.common.config import bronze_path, silver_path
from pipelines.common.io import read_bronze, write_parquet
from pipelines.common.schemas import validate_schema
from pipelines.common.metadata import now_iso, make_source_tag
from pipelines.common.run_logger import create_run, mark_processing, mark_completed, mark_failed


def transform(year: int, quarter: int, parent_run_id: Optional[str] = None) -> Path:
    src = bronze_path("seoul_living_population")
    dst = silver_path("demand_signal")

    run_id = create_run(
        run_type="transform",
        target_kind="silver_schema",
        target_ref=f"demand_signal/{year}Q{quarter}",
        parent_run_id=parent_run_id,
        input_ref=str(src),
    )
    mark_processing(run_id)

    try:
        df = read_bronze(src)
        df = _normalize(df, year, quarter)
        validate_schema(df, "demand_signal", layer="silver")
        out = write_parquet(df, dst, f"demand_signal_{year}Q{quarter}.parquet")
        mark_completed(run_id, output_ref=str(out))
        return out
    except Exception as e:
        mark_failed(run_id, e)
        raise


def _normalize(df: pd.DataFrame, year: int, quarter: int) -> pd.DataFrame:
    quarters = {1: ("01-01", "03-31"), 2: ("04-01", "06-30"), 3: ("07-01", "09-30"), 4: ("10-01", "12-31")}
    ps, pe = quarters[quarter]

    pop_cols = [
        "total_population", "male_population", "female_population",
        "age_10_population", "age_20_population", "age_30_population",
        "age_40_population", "age_50_population", "age_60_plus_population",
        "time_00_06_population", "time_06_11_population", "time_11_14_population",
        "time_14_17_population", "time_17_21_population", "time_21_24_population",
    ]
    out = pd.DataFrame()
    for col in ["trade_area_code", "trade_area_name"] + pop_cols:
        out[col] = df[col] if col in df.columns else None

    out["period_type"] = "quarterly"
    out["period_start"] = f"{year}-{ps}"
    out["period_end"] = f"{year}-{pe}"
    out["year"] = year
    out["quarter"] = quarter
    out["source"] = make_source_tag("seoul_living_population")

    for col in pop_cols:
        out[col] = pd.to_numeric(out[col], errors="coerce").fillna(0.0)

    return out
