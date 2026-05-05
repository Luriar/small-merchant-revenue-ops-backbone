"""
Transform: Bronze Seoul sales CSV → Silver revenue_signal parquet.
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
    src = bronze_path("seoul_estimated_sales")
    dst = silver_path("revenue_signal")

    run_id = create_run(
        run_type="transform",
        target_kind="silver_schema",
        target_ref=f"revenue_signal/{year}Q{quarter}",
        parent_run_id=parent_run_id,
        input_ref=str(src),
    )
    mark_processing(run_id)

    try:
        df = read_bronze(src)
        df = _normalize(df, year, quarter)
        validate_schema(df, "revenue_signal", layer="silver")
        out = write_parquet(df, dst, f"revenue_signal_{year}Q{quarter}.parquet")
        mark_completed(run_id, output_ref=str(out))
        return out
    except Exception as e:
        mark_failed(run_id, e)
        raise


def _normalize(df: pd.DataFrame, year: int, quarter: int) -> pd.DataFrame:
    quarters = {1: ("01-01", "03-31"), 2: ("04-01", "06-30"), 3: ("07-01", "09-30"), 4: ("10-01", "12-31")}
    ps, pe = quarters[quarter]

    col_map = {
        "trade_area_code": "trade_area_code",
        "trade_area_name": "trade_area_name",
        "service_category_code": "service_category_code",
        "service_category_name": "service_category_name",
        "revenue_amount": "revenue_amount",
        "transaction_count": "transaction_count",
        "weekday_revenue_amount": "weekday_revenue_amount",
        "weekend_revenue_amount": "weekend_revenue_amount",
    }
    out = pd.DataFrame()
    for tgt, src_col in col_map.items():
        if src_col in df.columns:
            out[tgt] = df[src_col]
        else:
            out[tgt] = None

    out["period_type"] = "quarterly"
    out["period_start"] = f"{year}-{ps}"
    out["period_end"] = f"{year}-{pe}"
    out["year"] = year
    out["quarter"] = quarter
    out["source"] = make_source_tag("seoul_estimated_sales")
    out["source_updated_at"] = now_iso()

    numeric_cols = ["revenue_amount", "transaction_count", "weekday_revenue_amount", "weekend_revenue_amount"]
    for col in numeric_cols:
        out[col] = pd.to_numeric(out[col], errors="coerce").fillna(0.0)

    return out
