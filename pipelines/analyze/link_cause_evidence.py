"""
Rule-based evidence linking: matches anomalies to context signals.
Does NOT claim causality — only 가능성 높은 원인 후보 (likely cause candidates).
"""
import uuid
from pathlib import Path
from typing import Optional
import pandas as pd

from pipelines.common.config import gold_path
from pipelines.common.io import read_parquet, write_parquet
from pipelines.common.schemas import validate_schema
from pipelines.common.run_logger import create_run, mark_processing, mark_completed, mark_failed

POPULATION_DROP_STRONG = -10.0
POPULATION_DROP_MEDIUM = -5.0


def link(
    compare_year: int,
    compare_quarter: int,
    parent_run_id: Optional[str] = None,
) -> Path:
    dst = gold_path("cause_evidence_candidates")
    run_id = create_run(
        run_type="analyze",
        target_kind="evidence_linking",
        target_ref=f"cause_evidence_candidates/{compare_year}Q{compare_quarter}",
        parent_run_id=parent_run_id,
    )
    mark_processing(run_id)

    try:
        anomalies = read_parquet(gold_path("revenue_anomaly_results"))
        mart = read_parquet(gold_path("revenue_context_mart"))
        mart_q = mart[(mart["year"] == compare_year) & (mart["quarter"] == compare_quarter)]

        evidence_rows = []
        for _, anom in anomalies.iterrows():
            if anom["anomaly_type"] not in ("revenue_drop", "severe_revenue_drop"):
                continue

            ctx = mart_q[
                (mart_q["trade_area_code"] == anom["trade_area_code"]) &
                (mart_q["service_category_code"] == anom["service_category_code"])
            ]
            if ctx.empty:
                continue
            ctx_row = ctx.iloc[0]

            rev_delta = anom["delta_pct"]
            pop_chg = ctx_row.get("population_change_pct", 0.0)
            rain_days = ctx_row.get("rain_day_count", 0)
            heavy_rain = ctx_row.get("heavy_rain_day_count", 0)
            store_chg = ctx_row.get("store_count_change", 0)
            event_count = ctx_row.get("local_event_count", 0)
            holiday_count = ctx_row.get("holiday_count", 0)
            population = ctx_row.get("total_population", 0)

            # Demand evidence
            if pop_chg <= POPULATION_DROP_STRONG:
                evidence_rows.append(_make_evidence(
                    anom["anomaly_id"],
                    evidence_type="demand",
                    strength="strong",
                    summary=f"생활인구가 {abs(pop_chg):.1f}% 감소하여 매출 하락과 함께 관측되었습니다. 수요 감소가 영향을 주었을 가능성이 있습니다.",
                    source_ref="silver/demand_signal",
                    metric_name="population_change_pct",
                    baseline_val=population / (1 + pop_chg / 100) if pop_chg != -100 else 0,
                    actual_val=population,
                    delta_pct=pop_chg,
                ))
            elif pop_chg <= POPULATION_DROP_MEDIUM:
                evidence_rows.append(_make_evidence(
                    anom["anomaly_id"],
                    evidence_type="demand",
                    strength="medium",
                    summary=f"생활인구가 {abs(pop_chg):.1f}% 감소하여 매출 하락과 함께 관측되었습니다. 추가 확인이 필요합니다.",
                    source_ref="silver/demand_signal",
                    metric_name="population_change_pct",
                    baseline_val=population / (1 + pop_chg / 100) if pop_chg != -100 else 0,
                    actual_val=population,
                    delta_pct=pop_chg,
                ))

            # Weather evidence
            if rain_days > 10 or heavy_rain > 3:
                evidence_rows.append(_make_evidence(
                    anom["anomaly_id"],
                    evidence_type="weather",
                    strength="medium",
                    summary=f"해당 기간 강수일 {rain_days}일(강한 비 {heavy_rain}일)이 관측되어 방문 고객 감소에 영향을 주었을 가능성이 있습니다.",
                    source_ref="silver/weather_signal",
                    metric_name="rain_day_count",
                    baseline_val=0,
                    actual_val=float(rain_days),
                    delta_pct=0.0,
                ))

            # Competition evidence
            if store_chg > 0:
                evidence_rows.append(_make_evidence(
                    anom["anomaly_id"],
                    evidence_type="competition",
                    strength="medium",
                    summary=f"동일 상권·업종 점포수가 {store_chg}개 증가하여 경쟁 심화가 매출에 영향을 주었을 가능성이 있습니다. 추가 확인이 필요합니다.",
                    source_ref="silver/competition_snapshot",
                    metric_name="store_count_change",
                    baseline_val=ctx_row.get("store_count", 0) - store_chg,
                    actual_val=float(ctx_row.get("store_count", 0)),
                    delta_pct=0.0,
                ))

            # Context evidence (low event count)
            if event_count < 3:
                evidence_rows.append(_make_evidence(
                    anom["anomaly_id"],
                    evidence_type="context",
                    strength="weak",
                    summary=f"해당 기간 지역 행사 수({event_count}건)가 적어 외부 수요 유입이 감소했을 가능성이 있습니다.",
                    source_ref="silver/local_event_context",
                    metric_name="local_event_count",
                    baseline_val=0,
                    actual_val=float(event_count),
                    delta_pct=0.0,
                ))

            # Benchmark/conversion evidence (demand stable but revenue drops)
            if pop_chg > -5.0 and rev_delta <= -10.0:
                evidence_rows.append(_make_evidence(
                    anom["anomaly_id"],
                    evidence_type="benchmark_or_conversion",
                    strength="medium",
                    summary="유동인구는 유지되었으나 매출이 하락하였습니다. 전환율 저하, 경쟁력 문제, 또는 오퍼 이슈가 원인 후보일 수 있습니다. 추가 확인이 필요합니다.",
                    source_ref="silver/revenue_signal",
                    metric_name="revenue_change_pct",
                    baseline_val=anom["baseline_value"],
                    actual_val=anom["actual_value"],
                    delta_pct=rev_delta,
                ))

        df = pd.DataFrame(evidence_rows) if evidence_rows else _empty_df()
        validate_schema(df, "cause_evidence_candidates", layer="gold")
        out = write_parquet(df, dst, f"cause_evidence_candidates_{compare_year}Q{compare_quarter}.parquet")
        mark_completed(run_id, output_ref=str(out))
        return out
    except Exception as e:
        mark_failed(run_id, e)
        raise


def _make_evidence(anomaly_id: str, evidence_type: str, strength: str, summary: str,
                   source_ref: str, metric_name: str, baseline_val: float,
                   actual_val: float, delta_pct: float) -> dict:
    return {
        "evidence_id": str(uuid.uuid4()),
        "anomaly_id": anomaly_id,
        "evidence_type": evidence_type,
        "evidence_strength": strength,
        "summary": summary,
        "source_ref": source_ref,
        "metric_name": metric_name,
        "baseline_value": round(float(baseline_val), 2),
        "actual_value": round(float(actual_val), 2),
        "delta_pct": round(float(delta_pct), 2),
    }


def _empty_df() -> pd.DataFrame:
    from pipelines.common.schemas import GOLD_SCHEMAS
    return pd.DataFrame(columns=GOLD_SCHEMAS["cause_evidence_candidates"])
