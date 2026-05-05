"""
Export Gold parquet files to JSON for the Revenue Ops API.

Usage:
    python3 scripts/export_gold_to_json.py [--quarter 2024Q4]

Outputs to apps/api/src/revenue-ops/data/
"""
import argparse
import json
import os
import uuid
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).parent.parent
GOLD_DIR = REPO_ROOT / "data" / "gold"
OUT_DIR = REPO_ROOT / "apps" / "api" / "src" / "revenue-ops" / "data"
DETERMINISTIC_TIMESTAMP = "2024-12-31T00:00:00+00:00"
DETERMINISTIC_NAMESPACE = uuid.uuid5(
    uuid.NAMESPACE_URL,
    "small-merchant-revenue-ops-backbone/revenue-ops-export",
)


def _latest_parquet(subdir: str) -> Path | None:
    files = sorted((GOLD_DIR / subdir).glob("*.parquet"))
    return files[-1] if files else None


def _read(subdir: str) -> pd.DataFrame:
    p = _latest_parquet(subdir)
    if p is None:
        return pd.DataFrame()
    return pd.read_parquet(p)


def _parse_json_col(df: pd.DataFrame, col: str) -> pd.DataFrame:
    if col in df.columns:
        df = df.copy()
        df[col] = df[col].apply(lambda v: json.loads(v) if isinstance(v, str) else v)
    return df


def _stable_id(kind: str, *parts: object) -> str:
    material = "|".join(str(part) for part in (kind, *parts) if part is not None)
    return str(uuid.uuid5(DETERMINISTIC_NAMESPACE, material))


def _deterministic_payload(payload: dict) -> dict:
    anomaly_id_map = {}

    for brief in payload["briefs"]:
        brief["brief_id"] = _stable_id(
            "brief",
            brief.get("trade_area_code"),
            brief.get("service_category_code"),
            brief.get("period_label"),
        )
        if "generated_at" in brief:
            brief["generated_at"] = DETERMINISTIC_TIMESTAMP

    for anomaly in payload["anomalies"]:
        original_id = anomaly.get("anomaly_id")
        new_id = _stable_id(
            "anomaly",
            anomaly.get("trade_area_code"),
            anomaly.get("service_category_code"),
            anomaly.get("metric"),
            anomaly.get("baseline_period"),
            anomaly.get("compare_period"),
            anomaly.get("anomaly_type"),
        )
        anomaly["anomaly_id"] = new_id
        anomaly_id_map[original_id] = new_id
        if "detected_at" in anomaly:
            anomaly["detected_at"] = DETERMINISTIC_TIMESTAMP

    for evidence in payload["evidence"]:
        original_anomaly_id = evidence.get("anomaly_id")
        evidence["anomaly_id"] = anomaly_id_map.get(original_anomaly_id, original_anomaly_id)
        evidence["evidence_id"] = _stable_id(
            "evidence",
            evidence.get("anomaly_id"),
            evidence.get("evidence_type"),
            evidence.get("metric_name"),
            evidence.get("source_ref"),
            evidence.get("summary"),
        )
        if "detected_at" in evidence:
            evidence["detected_at"] = DETERMINISTIC_TIMESTAMP

    for action in payload["actions"]:
        original_anomaly_id = action.get("anomaly_id")
        action["anomaly_id"] = anomaly_id_map.get(original_anomaly_id, original_anomaly_id)
        action["action_id"] = _stable_id(
            "action",
            action.get("anomaly_id"),
            action.get("action_type"),
            action.get("title"),
        )
        if "generated_at" in action:
            action["generated_at"] = DETERMINISTIC_TIMESTAMP

    return payload


def export(
    quarter: str | None = None,
    out_dir: str | Path | None = None,
    deterministic: bool | None = None,
) -> dict:
    briefs_df = _read("revenue_brief_view")
    anomalies_df = _read("revenue_anomaly_results")
    evidence_df = _read("cause_evidence_candidates")
    actions_df = _read("action_recommendation_candidates")
    context_df = _read("revenue_context_mart")

    if quarter and not briefs_df.empty and "period_label" in briefs_df.columns:
        briefs_df = briefs_df[briefs_df["period_label"] == quarter]

    briefs_df = _parse_json_col(briefs_df, "top_cause_candidates")
    briefs_df = _parse_json_col(briefs_df, "recommended_actions")

    briefs = briefs_df.to_dict(orient="records") if not briefs_df.empty else []
    anomalies = anomalies_df.to_dict(orient="records") if not anomalies_df.empty else []
    evidence = evidence_df.to_dict(orient="records") if not evidence_df.empty else []
    actions = actions_df.to_dict(orient="records") if not actions_df.empty else []
    context = context_df.to_dict(orient="records") if not context_df.empty else []

    pipeline_meta = {
        "run_log_path": "data/runs/run_log.jsonl",
        "gold_files": {
            "revenue_brief_view": str(_latest_parquet("revenue_brief_view") or ""),
            "revenue_anomaly_results": str(_latest_parquet("revenue_anomaly_results") or ""),
            "cause_evidence_candidates": str(_latest_parquet("cause_evidence_candidates") or ""),
            "action_recommendation_candidates": str(_latest_parquet("action_recommendation_candidates") or ""),
            "revenue_context_mart": str(_latest_parquet("revenue_context_mart") or ""),
        },
    }

    payload = {
        "briefs": briefs,
        "anomalies": anomalies,
        "evidence": evidence,
        "actions": actions,
        "context": context,
        "pipeline_meta": pipeline_meta,
    }

    deterministic = (
        os.getenv("REVENUE_OPS_DETERMINISTIC_EXPORT") == "1"
        if deterministic is None
        else deterministic
    )
    if deterministic:
        payload = _deterministic_payload(payload)

    output_dir = Path(out_dir) if out_dir is not None else OUT_DIR
    output_dir.mkdir(parents=True, exist_ok=True)
    out_path = output_dir / "revenue_ops_export.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2, default=str)

    print(f"Exported {len(briefs)} brief(s), {len(anomalies)} anomaly record(s), "
          f"{len(evidence)} evidence record(s), {len(actions)} action record(s) → {out_path}")
    return payload


def main():
    parser = argparse.ArgumentParser(description="Export Gold parquet to JSON for Revenue Ops API")
    parser.add_argument("--quarter", default=None, help="Filter by period label, e.g. 2024Q4")
    parser.add_argument("--out-dir", default=None, help="Output directory for revenue_ops_export.json")
    parser.add_argument("--deterministic", action="store_true", help="Use stable IDs and timestamps for repeatable validation")
    args = parser.parse_args()
    export(quarter=args.quarter, out_dir=args.out_dir, deterministic=args.deterministic)


if __name__ == "__main__":
    main()
