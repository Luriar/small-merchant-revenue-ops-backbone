"""
Export Gold parquet files to JSON for the Revenue Ops API.

Usage:
    python3 scripts/export_gold_to_json.py [--quarter 2024Q4]

Outputs to apps/api/src/revenue-ops/data/
"""
import argparse
import json
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).parent.parent
GOLD_DIR = REPO_ROOT / "data" / "gold"
OUT_DIR = REPO_ROOT / "apps" / "api" / "src" / "revenue-ops" / "data"


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


def export(quarter: str | None = None) -> dict:
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

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / "revenue_ops_export.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2, default=str)

    print(f"Exported {len(briefs)} brief(s), {len(anomalies)} anomaly record(s), "
          f"{len(evidence)} evidence record(s), {len(actions)} action record(s) → {out_path}")
    return payload


def main():
    parser = argparse.ArgumentParser(description="Export Gold parquet to JSON for Revenue Ops API")
    parser.add_argument("--quarter", default=None, help="Filter by period label, e.g. 2024Q4")
    args = parser.parse_args()
    export(quarter=args.quarter)


if __name__ == "__main__":
    main()
