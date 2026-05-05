"""
Mart builder: joins Silver signals → Gold revenue_context_mart.
Computes period-over-period change metrics.
"""
from pathlib import Path
from typing import Optional
import pandas as pd

from pipelines.common.config import silver_path, gold_path
from pipelines.common.io import read_parquet, write_parquet
from pipelines.common.schemas import validate_schema
from pipelines.common.metadata import coverage_score
from pipelines.common.run_logger import create_run, mark_processing, mark_completed, mark_failed


def build(
    baseline_year: int,
    baseline_quarter: int,
    compare_year: int,
    compare_quarter: int,
    parent_run_id: Optional[str] = None,
) -> Path:
    dst = gold_path("revenue_context_mart")

    run_id = create_run(
        run_type="mart_build",
        target_kind="gold_mart",
        target_ref=f"revenue_context_mart/{compare_year}Q{compare_quarter}",
        parent_run_id=parent_run_id,
    )
    mark_processing(run_id)

    try:
        rev_base = _load_revenue(baseline_year, baseline_quarter)
        rev_cmp = _load_revenue(compare_year, compare_quarter)
        demand_base = _load_demand(baseline_year, baseline_quarter)
        demand_cmp = _load_demand(compare_year, compare_quarter)
        weather_cmp = _load_weather(compare_year, compare_quarter)
        competition_base = _load_competition(baseline_year, baseline_quarter)
        competition_cmp = _load_competition(compare_year, compare_quarter)
        holidays_cmp = _load_holidays(compare_year, compare_quarter)
        events_cmp = _load_events(compare_year, compare_quarter)

        mart = _join_and_compute(
            rev_base, rev_cmp,
            demand_base, demand_cmp,
            weather_cmp,
            competition_base, competition_cmp,
            holidays_cmp, events_cmp,
            baseline_year, baseline_quarter,
            compare_year, compare_quarter,
        )

        validate_schema(mart, "revenue_context_mart", layer="gold")
        out = write_parquet(mart, dst, f"revenue_context_mart_{compare_year}Q{compare_quarter}.parquet")
        mark_completed(run_id, output_ref=str(out))
        return out
    except Exception as e:
        mark_failed(run_id, e)
        raise


def _load_revenue(year: int, quarter: int) -> pd.DataFrame:
    try:
        return read_parquet(silver_path("revenue_signal"))
    except FileNotFoundError:
        return pd.DataFrame()


def _load_demand(year: int, quarter: int) -> pd.DataFrame:
    try:
        return read_parquet(silver_path("demand_signal"))
    except FileNotFoundError:
        return pd.DataFrame()


def _load_weather(year: int, quarter: int) -> pd.DataFrame:
    try:
        return read_parquet(silver_path("weather_signal"))
    except FileNotFoundError:
        return pd.DataFrame()


def _load_competition(year: int, quarter: int) -> pd.DataFrame:
    try:
        return read_parquet(silver_path("competition_snapshot"))
    except FileNotFoundError:
        return pd.DataFrame()


def _load_holidays(year: int, quarter: int) -> pd.DataFrame:
    try:
        return read_parquet(silver_path("holiday_context"))
    except FileNotFoundError:
        return pd.DataFrame()


def _load_events(year: int, quarter: int) -> pd.DataFrame:
    try:
        return read_parquet(silver_path("local_event_context"))
    except FileNotFoundError:
        return pd.DataFrame()


def _pct_change(base: float, current: float) -> float:
    if base == 0 or pd.isna(base):
        return 0.0
    return round((current - base) / base * 100, 2)


def _join_and_compute(
    rev_base, rev_cmp,
    demand_base, demand_cmp,
    weather_cmp,
    competition_base, competition_cmp,
    holidays_cmp, events_cmp,
    baseline_year, baseline_quarter,
    compare_year, compare_quarter,
) -> pd.DataFrame:
    key_cols = ["trade_area_code", "trade_area_name", "service_category_code", "service_category_name"]

    if rev_cmp.empty:
        raise ValueError("Compare period revenue_signal is empty — cannot build mart")

    # Normalize key column types to avoid merge type mismatches
    for df in [rev_cmp, rev_base, demand_cmp, demand_base, competition_cmp, competition_base]:
        if not df.empty:
            for col in ["trade_area_code", "trade_area_name", "service_category_code", "service_category_name"]:
                if col in df.columns:
                    df[col] = df[col].astype(str)

    rev_cmp_q = rev_cmp[(rev_cmp["year"] == compare_year) & (rev_cmp["quarter"] == compare_quarter)].copy()
    rev_base_q = rev_base[(rev_base["year"] == baseline_year) & (rev_base["quarter"] == baseline_quarter)].copy() if not rev_base.empty else pd.DataFrame()

    mart = rev_cmp_q[key_cols + ["period_start", "period_end", "year", "quarter",
                                   "revenue_amount", "transaction_count"]].copy()

    if not rev_base_q.empty:
        base_rev = rev_base_q[key_cols + ["revenue_amount", "transaction_count"]].rename(
            columns={"revenue_amount": "base_revenue", "transaction_count": "base_transactions"}
        )
        mart = mart.merge(base_rev, on=key_cols, how="left")
        mart["revenue_change_pct"] = mart.apply(
            lambda r: _pct_change(r["base_revenue"], r["revenue_amount"]), axis=1
        )
        mart["transaction_change_pct"] = mart.apply(
            lambda r: _pct_change(r["base_transactions"], r["transaction_count"]), axis=1
        )
    else:
        mart["revenue_change_pct"] = 0.0
        mart["transaction_change_pct"] = 0.0

    # Demand signals
    demand_key = ["trade_area_code", "trade_area_name"]
    sources_available = 1
    if not demand_cmp.empty:
        demand_cmp_q = demand_cmp[(demand_cmp["year"] == compare_year) & (demand_cmp["quarter"] == compare_quarter)]
        demand_agg = demand_cmp_q.groupby(demand_key)["total_population"].sum().reset_index()
        mart = mart.merge(demand_agg, on=demand_key, how="left")
        mart["total_population"] = mart["total_population"].fillna(0)
        sources_available += 1

        if not demand_base.empty:
            demand_base_q = demand_base[(demand_base["year"] == baseline_year) & (demand_base["quarter"] == baseline_quarter)]
            demand_base_agg = demand_base_q.groupby(demand_key)["total_population"].sum().reset_index()
            demand_base_agg = demand_base_agg.rename(columns={"total_population": "base_population"})
            mart = mart.merge(demand_base_agg, on=demand_key, how="left")
            mart["population_change_pct"] = mart.apply(
                lambda r: _pct_change(r.get("base_population", 0), r["total_population"]), axis=1
            )
        else:
            mart["population_change_pct"] = 0.0
    else:
        mart["total_population"] = 0
        mart["population_change_pct"] = 0.0

    # Competition signals
    comp_key = ["trade_area_code", "service_category_code"]
    if not competition_cmp.empty:
        comp_cmp_q = competition_cmp[(competition_cmp["year"] == compare_year) & (competition_cmp["quarter"] == compare_quarter)]
        comp_agg = comp_cmp_q.groupby(comp_key)["store_count"].sum().reset_index()
        mart = mart.merge(comp_agg, on=comp_key, how="left")
        mart["store_count"] = mart["store_count"].fillna(0).astype(int)
        sources_available += 1

        if not competition_base.empty:
            comp_base_q = competition_base[(competition_base["year"] == baseline_year) & (competition_base["quarter"] == baseline_quarter)]
            comp_base_agg = comp_base_q.groupby(comp_key)["store_count"].sum().reset_index()
            comp_base_agg = comp_base_agg.rename(columns={"store_count": "base_store_count"})
            mart = mart.merge(comp_base_agg, on=comp_key, how="left")
            mart["store_count_change"] = (mart["store_count"] - mart["base_store_count"].fillna(0)).astype(int)
        else:
            mart["store_count_change"] = 0
    else:
        mart["store_count"] = 0
        mart["store_count_change"] = 0

    # Weather aggregates
    if not weather_cmp.empty:
        mart["rain_day_count"] = int(weather_cmp["is_rain_day"].sum())
        mart["heavy_rain_day_count"] = int(weather_cmp["is_heavy_rain_day"].sum())
        mart["hot_day_count"] = int(weather_cmp["is_hot_day"].sum())
        mart["cold_day_count"] = int(weather_cmp["is_cold_day"].sum())
        sources_available += 1
    else:
        mart["rain_day_count"] = 0
        mart["heavy_rain_day_count"] = 0
        mart["hot_day_count"] = 0
        mart["cold_day_count"] = 0

    # Holiday count
    if not holidays_cmp.empty:
        mart["holiday_count"] = int(holidays_cmp["is_holiday"].sum())
        sources_available += 1
    else:
        mart["holiday_count"] = 0

    # Local event count
    if not events_cmp.empty:
        mart["local_event_count"] = len(events_cmp)
        sources_available += 1
    else:
        mart["local_event_count"] = 0

    mart["source_coverage_score"] = coverage_score(sources_available, 7)

    # Drop intermediate base columns
    for col in ["base_revenue", "base_transactions", "base_population", "base_store_count"]:
        if col in mart.columns:
            mart = mart.drop(columns=[col])

    return mart.reset_index(drop=True)
