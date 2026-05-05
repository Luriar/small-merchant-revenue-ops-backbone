"""
Transform: Bronze store competition CSV → Silver competition_snapshot parquet.
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
    src = bronze_path("store_competition")
    dst = silver_path("competition_snapshot")

    run_id = create_run(
        run_type="transform",
        target_kind="silver_schema",
        target_ref=f"competition_snapshot/{year}Q{quarter}",
        parent_run_id=parent_run_id,
        input_ref=str(src),
    )
    mark_processing(run_id)

    try:
        df = read_bronze(src)
        df = _normalize(df, year, quarter)
        validate_schema(df, "competition_snapshot", layer="silver")
        out = write_parquet(df, dst, f"competition_snapshot_{year}Q{quarter}.parquet")
        mark_completed(run_id, output_ref=str(out))
        return out
    except Exception as e:
        mark_failed(run_id, e)
        raise


def _normalize(df: pd.DataFrame, year: int, quarter: int) -> pd.DataFrame:
    quarters = {1: "03-31", 2: "06-30", 3: "09-30", 4: "12-31"}
    snapshot_date = f"{year}-{quarters[quarter]}"

    col_map = {
        "district_name": "district_name",
        "administrative_dong": "administrative_dong",
        "trade_area_code": "trade_area_code",
        "service_category_code": "service_category_code",
        "service_category_name": "service_category_name",
        "store_count": "store_count",
    }
    out = pd.DataFrame()
    for tgt, src_col in col_map.items():
        out[tgt] = df[src_col] if src_col in df.columns else None

    out["snapshot_date"] = snapshot_date
    out["year"] = year
    out["quarter"] = quarter
    out["store_count"] = pd.to_numeric(out["store_count"], errors="coerce").fillna(0).astype(int)
    out["source"] = make_source_tag("store_competition")

    return out
