"""
Revenue Brief publisher: generates structured brief from Gold marts.
One brief per anomaly cluster (trade_area + category).
"""
import json
import uuid
from pathlib import Path
from typing import Optional
import pandas as pd

from pipelines.common.config import gold_path
from pipelines.common.io import read_parquet, write_parquet
from pipelines.common.schemas import validate_schema
from pipelines.common.metadata import now_iso, quarter_label
from pipelines.common.run_logger import create_run, mark_processing, mark_completed, mark_failed


def publish(
    compare_year: int,
    compare_quarter: int,
    parent_run_id: Optional[str] = None,
) -> Path:
    dst = gold_path("revenue_brief_view")
    run_id = create_run(
        run_type="analyze",
        target_kind="revenue_brief",
        target_ref=f"revenue_brief_view/{compare_year}Q{compare_quarter}",
        parent_run_id=parent_run_id,
    )
    mark_processing(run_id)

    try:
        anomalies = read_parquet(gold_path("revenue_anomaly_results"))
        evidence = read_parquet(gold_path("cause_evidence_candidates"))
        actions = read_parquet(gold_path("action_recommendation_candidates"))
        mart = read_parquet(gold_path("revenue_context_mart"))
        mart_q = mart[(mart["year"] == compare_year) & (mart["quarter"] == compare_quarter)]

        period_label = quarter_label(compare_year, compare_quarter)
        generated_at = now_iso()
        briefs = []

        revenue_anomalies = anomalies[anomalies["anomaly_type"].isin(["revenue_drop", "severe_revenue_drop"])]

        # Group by trade_area + category
        groups = revenue_anomalies.groupby(
            ["trade_area_code", "trade_area_name", "service_category_code", "service_category_name"]
        )

        for (tac, tan, scc, scn), grp in groups:
            anom_ids = grp["anomaly_id"].tolist()
            rev_anom = grp[grp["metric"] == "revenue_amount"]
            delta = float(rev_anom["delta_pct"].min()) if not rev_anom.empty else 0.0

            ev_rows = evidence[evidence["anomaly_id"].isin(anom_ids)]
            act_rows = actions[actions["anomaly_id"].isin(anom_ids)]

            ctx = mart_q[
                (mart_q["trade_area_code"] == tac) &
                (mart_q["service_category_code"] == scc)
            ]
            freshness = ctx["source_coverage_score"].mean() if not ctx.empty else 0.0

            headline = _make_headline(tan, scn, delta, len(ev_rows))
            summary = _make_summary(delta, ev_rows)

            top_causes = json.dumps(
                ev_rows[["evidence_type", "evidence_strength", "summary"]].to_dict("records"),
                ensure_ascii=False,
            )
            rec_actions = json.dumps(
                act_rows[["action_type", "title", "why_this_action"]].drop_duplicates("title").head(5).to_dict("records"),
                ensure_ascii=False,
            )

            briefs.append({
                "brief_id": str(uuid.uuid4()),
                "trade_area_code": tac,
                "trade_area_name": tan,
                "service_category_code": scc,
                "service_category_name": scn,
                "period_label": period_label,
                "headline": headline,
                "summary": summary,
                "top_cause_candidates": top_causes,
                "recommended_actions": rec_actions,
                "data_freshness": round(float(freshness), 2),
                "generated_at": generated_at,
            })

        df = pd.DataFrame(briefs) if briefs else _empty_df()
        validate_schema(df, "revenue_brief_view", layer="gold")
        out = write_parquet(df, dst, f"revenue_brief_view_{compare_year}Q{compare_quarter}.parquet")
        mark_completed(run_id, output_ref=str(out))
        return out
    except Exception as e:
        mark_failed(run_id, e)
        raise


def _make_headline(trade_area: str, category: str, delta_pct: float, evidence_count: int) -> str:
    severity = "심각한 " if delta_pct <= -20 else ""
    return (
        f"{trade_area} {category}: {period_desc(delta_pct)} — "
        f"{evidence_count}개 원인 후보가 함께 관측되었습니다"
    )


def _make_summary(delta_pct: float, ev_rows: pd.DataFrame) -> str:
    ev_types = ev_rows["evidence_type"].unique().tolist() if not ev_rows.empty else []
    type_labels = {
        "demand": "수요 감소",
        "weather": "날씨 영향",
        "competition": "경쟁 심화",
        "context": "맥락 변화",
        "benchmark_or_conversion": "전환율/경쟁력 이슈",
    }
    labels = [type_labels.get(t, t) for t in ev_types]
    ev_str = ", ".join(labels) if labels else "근거 데이터 수집 중"
    return (
        f"매출이 {abs(delta_pct):.1f}% 하락하였습니다. "
        f"가능성 높은 원인 후보로는 {ev_str}이 함께 관측되었습니다. "
        "이는 원인으로 확정된 것이 아니며, 추가 확인이 필요합니다."
    )


def period_desc(delta_pct: float) -> str:
    if delta_pct <= -20:
        return f"매출 {abs(delta_pct):.1f}% 심각 하락"
    return f"매출 {abs(delta_pct):.1f}% 하락"


def _empty_df() -> pd.DataFrame:
    from pipelines.common.schemas import GOLD_SCHEMAS
    return pd.DataFrame(columns=GOLD_SCHEMAS["revenue_brief_view"])
