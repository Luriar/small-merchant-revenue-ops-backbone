"""
Transform: Bronze local events CSV → Silver local_event_context parquet.
"""
from pathlib import Path
from typing import Optional
import pandas as pd

from pipelines.common.config import bronze_path, silver_path
from pipelines.common.io import read_bronze, write_parquet
from pipelines.common.schemas import validate_schema
from pipelines.common.metadata import make_source_tag
from pipelines.common.run_logger import create_run, mark_processing, mark_completed, mark_failed


def transform(year: int, quarter: int, parent_run_id: Optional[str] = None) -> Path:
    src = bronze_path("local_events")
    dst = silver_path("local_event_context")

    run_id = create_run(
        run_type="transform",
        target_kind="silver_schema",
        target_ref=f"local_event_context/{year}Q{quarter}",
        parent_run_id=parent_run_id,
        input_ref=str(src),
    )
    mark_processing(run_id)

    try:
        df = read_bronze(src)
        df = _normalize(df)
        validate_schema(df, "local_event_context", layer="silver")
        out = write_parquet(df, dst, f"local_event_context_{year}Q{quarter}.parquet")
        mark_completed(run_id, output_ref=str(out))
        return out
    except Exception as e:
        mark_failed(run_id, e)
        raise


def _normalize(df: pd.DataFrame) -> pd.DataFrame:
    col_map = {
        "event_id": "event_id",
        "event_name": "event_name",
        "district_name": "district_name",
        "place_name": "place_name",
        "start_date": "start_date",
        "end_date": "end_date",
        "is_free": "is_free",
        "category": "category",
        "latitude": "latitude",
        "longitude": "longitude",
    }
    out = pd.DataFrame()
    for tgt, src_col in col_map.items():
        out[tgt] = df[src_col] if src_col in df.columns else None

    if "is_free" in out.columns:
        out["is_free"] = out["is_free"].astype(bool)
    for col in ["latitude", "longitude"]:
        out[col] = pd.to_numeric(out[col], errors="coerce").fillna(0.0)

    out["source"] = make_source_tag("local_events")
    return out
