"""
Mart builder: runs anomaly detection rules on revenue_context_mart → gold/revenue_anomaly_results.
Delegates to detect_revenue_anomalies for rule evaluation.
"""
from pathlib import Path
from typing import Optional

from pipelines.analyze.detect_revenue_anomalies import detect
from pipelines.common.run_logger import create_run, mark_processing, mark_completed, mark_failed


def build(
    compare_year: int,
    compare_quarter: int,
    baseline_year: int,
    baseline_quarter: int,
    parent_run_id: Optional[str] = None,
) -> Path:
    run_id = create_run(
        run_type="mart_build",
        target_kind="gold_mart",
        target_ref=f"revenue_anomaly_results/{compare_year}Q{compare_quarter}",
        parent_run_id=parent_run_id,
    )
    mark_processing(run_id)
    try:
        out = detect(
            compare_year=compare_year,
            compare_quarter=compare_quarter,
            baseline_year=baseline_year,
            baseline_quarter=baseline_quarter,
            parent_run_id=run_id,
        )
        mark_completed(run_id, output_ref=str(out))
        return out
    except Exception as e:
        mark_failed(run_id, e)
        raise
