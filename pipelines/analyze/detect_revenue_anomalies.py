"""
Rule-based revenue anomaly detection.
Applies explainable threshold rules to revenue_context_mart.
No black-box ML.
"""
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
import pandas as pd

from pipelines.common.config import gold_path
from pipelines.common.io import read_parquet, write_parquet
from pipelines.common.schemas import validate_schema
from pipelines.common.run_logger import create_run, mark_processing, mark_completed, mark_failed

REVENUE_DROP_THRESHOLD = -10.0
SEVERE_REVENUE_DROP_THRESHOLD = -20.0
TRANSACTION_DROP_THRESHOLD = -10.0


def detect(
    compare_year: int,
    compare_quarter: int,
    baseline_year: int,
    baseline_quarter: int,
    parent_run_id: Optional[str] = None,
) -> Path:
    dst = gold_path("revenue_anomaly_results")
    run_id = create_run(
        run_type="analyze",
        target_kind="anomaly_detection",
        target_ref=f"revenue_anomaly_results/{compare_year}Q{compare_quarter}",
        parent_run_id=parent_run_id,
    )
    mark_processing(run_id)

    try:
        mart = read_parquet(gold_path("revenue_context_mart"))
        mart_q = mart[(mart["year"] == compare_year) & (mart["quarter"] == compare_quarter)]

        anomalies = []
        baseline_label = f"{baseline_year}Q{baseline_quarter}"
        compare_label = f"{compare_year}Q{compare_quarter}"
        detected_at = datetime.now(timezone.utc).isoformat()

        for _, row in mart_q.iterrows():
            key = {
                "trade_area_code": row["trade_area_code"],
                "trade_area_name": row["trade_area_name"],
                "service_category_code": row["service_category_code"],
                "service_category_name": row["service_category_name"],
            }
            rev_chg = row.get("revenue_change_pct", 0.0)
            txn_chg = row.get("transaction_change_pct", 0.0)
            pop_chg = row.get("population_change_pct", 0.0)

            if rev_chg <= SEVERE_REVENUE_DROP_THRESHOLD:
                anomalies.append(_make_anomaly(key, "revenue_amount", baseline_label, compare_label,
                                               "severe_revenue_drop", rev_chg, severity=3.0, detected_at=detected_at,
                                               baseline_val=row.get("revenue_amount", 0) / (1 + rev_chg / 100),
                                               actual_val=row.get("revenue_amount", 0)))
            elif rev_chg <= REVENUE_DROP_THRESHOLD:
                anomalies.append(_make_anomaly(key, "revenue_amount", baseline_label, compare_label,
                                               "revenue_drop", rev_chg, severity=2.0, detected_at=detected_at,
                                               baseline_val=row.get("revenue_amount", 0) / (1 + rev_chg / 100) if rev_chg != -100 else 0,
                                               actual_val=row.get("revenue_amount", 0)))

            if txn_chg <= TRANSACTION_DROP_THRESHOLD:
                anomalies.append(_make_anomaly(key, "transaction_count", baseline_label, compare_label,
                                               "transaction_drop", txn_chg, severity=1.5, detected_at=detected_at,
                                               baseline_val=row.get("transaction_count", 0) / (1 + txn_chg / 100) if txn_chg != -100 else 0,
                                               actual_val=row.get("transaction_count", 0)))

            if rev_chg < 0 and pop_chg >= 0:
                anomalies.append(_make_anomaly(key, "revenue_amount", baseline_label, compare_label,
                                               "weak_growth_warning", rev_chg, severity=1.0, detected_at=detected_at,
                                               baseline_val=row.get("revenue_amount", 0) / (1 + rev_chg / 100) if rev_chg != -100 else 0,
                                               actual_val=row.get("revenue_amount", 0)))

        if anomalies:
            df = pd.DataFrame(anomalies)
        else:
            df = _empty_df()

        validate_schema(df, "revenue_anomaly_results", layer="gold")
        out = write_parquet(df, dst, f"revenue_anomaly_results_{compare_year}Q{compare_quarter}.parquet")
        mark_completed(run_id, output_ref=str(out))
        return out
    except Exception as e:
        mark_failed(run_id, e)
        raise


def _make_anomaly(key: dict, metric: str, baseline_period: str, compare_period: str,
                  anomaly_type: str, delta_pct: float, severity: float, detected_at: str,
                  baseline_val: float, actual_val: float) -> dict:
    return {
        "anomaly_id": str(uuid.uuid4()),
        **key,
        "metric": metric,
        "baseline_period": baseline_period,
        "compare_period": compare_period,
        "baseline_value": round(float(baseline_val), 2),
        "actual_value": round(float(actual_val), 2),
        "delta_pct": round(float(delta_pct), 2),
        "severity_score": severity,
        "anomaly_type": anomaly_type,
        "detected_at": detected_at,
    }


def _empty_df() -> pd.DataFrame:
    from pipelines.common.schemas import GOLD_SCHEMAS
    return pd.DataFrame(columns=GOLD_SCHEMAS["revenue_anomaly_results"])
