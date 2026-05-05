"""
Rule-based action recommendation mapping.
Maps evidence type combinations to action catalog entries.
"""
import uuid
from pathlib import Path
from typing import Optional, List, Set
import yaml
import pandas as pd

from pipelines.common.config import gold_path
from pipelines.common.io import read_parquet, write_parquet
from pipelines.common.schemas import validate_schema
from pipelines.common.run_logger import create_run, mark_processing, mark_completed, mark_failed

_CATALOG_PATH = Path(__file__).parent.parent.parent / "configs" / "action_catalog.yaml"


def _load_catalog() -> dict:
    with open(_CATALOG_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)


def map_actions(
    compare_year: int,
    compare_quarter: int,
    parent_run_id: Optional[str] = None,
) -> Path:
    dst = gold_path("action_recommendation_candidates")
    run_id = create_run(
        run_type="analyze",
        target_kind="action_mapping",
        target_ref=f"action_recommendation_candidates/{compare_year}Q{compare_quarter}",
        parent_run_id=parent_run_id,
    )
    mark_processing(run_id)

    try:
        anomalies = read_parquet(gold_path("revenue_anomaly_results"))
        evidence = read_parquet(gold_path("cause_evidence_candidates"))
        catalog = _load_catalog()
        mapping = catalog.get("action_mapping", {})
        actions_def = catalog.get("actions", {})

        rows = []
        revenue_anomalies = anomalies[anomalies["anomaly_type"].isin(["revenue_drop", "severe_revenue_drop"])]

        for _, anom in revenue_anomalies.iterrows():
            anom_id = anom["anomaly_id"]
            ev_rows = evidence[evidence["anomaly_id"] == anom_id]
            ev_types: Set[str] = set(ev_rows["evidence_type"].tolist())
            ev_types.add("revenue_drop")

            action_keys = _select_actions(ev_types, mapping)
            for ak in action_keys:
                if ak not in actions_def:
                    continue
                a = actions_def[ak]
                rows.append({
                    "action_id": str(uuid.uuid4()),
                    "anomaly_id": anom_id,
                    "action_type": a.get("action_type", ""),
                    "title": a.get("title", ""),
                    "description": a.get("description", ""),
                    "why_this_action": a.get("why_this_action", ""),
                    "expected_effect": a.get("expected_effect", ""),
                    "risk_note": a.get("risk_note", ""),
                    "status": "recommended",
                })

        df = pd.DataFrame(rows) if rows else _empty_df()
        validate_schema(df, "action_recommendation_candidates", layer="gold")
        out = write_parquet(df, dst, f"action_recommendation_candidates_{compare_year}Q{compare_quarter}.parquet")
        mark_completed(run_id, output_ref=str(out))
        return out
    except Exception as e:
        mark_failed(run_id, e)
        raise


def _select_actions(ev_types: Set[str], mapping: dict) -> List[str]:
    selected: List[str] = []
    seen: Set[str] = set()

    has_demand = "demand" in ev_types
    has_weather = "weather" in ev_types
    has_competition = "competition" in ev_types
    has_context = "context" in ev_types
    has_benchmark = "benchmark_or_conversion" in ev_types

    def _add(keys: List[str]) -> None:
        for k in keys:
            if k not in seen:
                seen.add(k)
                selected.append(k)

    if has_demand and has_weather:
        _add(mapping.get("revenue_drop_demand_weather", {}).get("recommended_actions", []))
    if has_demand:
        _add(mapping.get("revenue_drop_demand", {}).get("recommended_actions", []))
    if has_competition:
        _add(mapping.get("revenue_drop_competition", {}).get("recommended_actions", []))
    if has_context:
        _add(mapping.get("revenue_drop_context", {}).get("recommended_actions", []))
    if has_benchmark:
        _add(mapping.get("revenue_drop_benchmark", {}).get("recommended_actions", []))

    # Ensure at least 3 recommendations by falling back to demand mapping
    if len(selected) < 3:
        fallback = mapping.get("revenue_drop_demand", {}).get("recommended_actions", [])
        _add(fallback)

    return selected


def _empty_df() -> pd.DataFrame:
    from pipelines.common.schemas import GOLD_SCHEMAS
    return pd.DataFrame(columns=GOLD_SCHEMAS["action_recommendation_candidates"])
