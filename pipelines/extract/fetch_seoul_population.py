"""
Bronze extractor: Seoul living population data.
"""
import shutil
from pathlib import Path
from typing import Optional

from pipelines.common.config import bronze_path, samples_path
from pipelines.common.run_logger import create_run, mark_processing, mark_completed, mark_failed

SOURCE_NAME = "seoul_living_population"


def fetch(year: int, quarter: int, use_samples: bool = True, parent_run_id: Optional[str] = None) -> Path:
    out_dir = bronze_path(SOURCE_NAME)
    out_dir.mkdir(parents=True, exist_ok=True)

    run_id = create_run(
        run_type="extract",
        target_kind="source",
        target_ref=f"{SOURCE_NAME}/{year}Q{quarter}",
        parent_run_id=parent_run_id,
        input_ref="samples" if use_samples else "seoul_openapi",
    )
    mark_processing(run_id)

    try:
        if use_samples:
            sample_file = samples_path() / f"bronze_seoul_population_{year}Q{quarter}.csv"
            if not sample_file.exists():
                raise FileNotFoundError(f"Sample file not found: {sample_file}")
            dest = out_dir / sample_file.name
            shutil.copy2(sample_file, dest)
            mark_completed(run_id, output_ref=str(dest))
            return dest
        else:
            raise NotImplementedError(
                "Live Seoul Open API extraction not implemented in M3. "
                "Use --use-samples or provide CSV in bronze path."
            )
    except Exception as e:
        mark_failed(run_id, e)
        raise
