"""
Transform: Bronze holidays CSV → Silver holiday_context parquet.
"""
from pathlib import Path
from typing import Optional
import pandas as pd

from pipelines.common.config import bronze_path, silver_path
from pipelines.common.io import read_bronze, write_parquet
from pipelines.common.schemas import validate_schema
from pipelines.common.metadata import make_source_tag
from pipelines.common.run_logger import create_run, mark_processing, mark_completed, mark_failed


def transform(year: int, parent_run_id: Optional[str] = None) -> Path:
    src = bronze_path("holidays")
    dst = silver_path("holiday_context")

    run_id = create_run(
        run_type="transform",
        target_kind="silver_schema",
        target_ref=f"holiday_context/{year}",
        parent_run_id=parent_run_id,
        input_ref=str(src),
    )
    mark_processing(run_id)

    try:
        df = read_bronze(src)
        df = _normalize(df)
        validate_schema(df, "holiday_context", layer="silver")
        out = write_parquet(df, dst, f"holiday_context_{year}.parquet")
        mark_completed(run_id, output_ref=str(out))
        return out
    except Exception as e:
        mark_failed(run_id, e)
        raise


def _normalize(df: pd.DataFrame) -> pd.DataFrame:
    out = pd.DataFrame()
    out["date"] = df["date"] if "date" in df.columns else None
    out["holiday_name"] = df["holiday_name"] if "holiday_name" in df.columns else ""
    out["is_holiday"] = df["is_holiday"].astype(bool) if "is_holiday" in df.columns else True
    out["source"] = make_source_tag("holidays")
    return out
