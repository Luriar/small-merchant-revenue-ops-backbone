"""
Bronze extractor: Trade area boundary/code mapping data.
"""
import shutil
from pathlib import Path
from typing import Optional

from pipelines.common.config import bronze_path, samples_path
from pipelines.common.run_logger import create_run, mark_processing, mark_completed, mark_failed

SOURCE_NAME = "trade_area_boundary"


def fetch(use_samples: bool = True, parent_run_id: Optional[str] = None) -> Path:
    out_dir = bronze_path(SOURCE_NAME)
    out_dir.mkdir(parents=True, exist_ok=True)

    run_id = create_run(
        run_type="extract",
        target_kind="source",
        target_ref=SOURCE_NAME,
        parent_run_id=parent_run_id,
        input_ref="samples" if use_samples else "seoul_openapi",
    )
    mark_processing(run_id)

    try:
        if use_samples:
            sample_file = samples_path() / "bronze_trade_area_boundary.csv"
            if not sample_file.exists():
                raise FileNotFoundError(f"Sample file not found: {sample_file}")
            dest = out_dir / sample_file.name
            shutil.copy2(sample_file, dest)
            mark_completed(run_id, output_ref=str(dest))
            return dest
        else:
            raise NotImplementedError("Live trade area boundary extraction not implemented in M3.")
    except Exception as e:
        mark_failed(run_id, e)
        raise
