"""
Local Medallion Pipeline Orchestrator.

Usage:
  python -m pipelines.orchestration.run_local_medallion_pipeline \\
    --use-samples --target-year 2024 --target-quarter 4

Stages:
  1. Prepare Bronze (extract)
  2. Bronze → Silver (transform)
  3. Silver → Gold revenue_context_mart (mart)
  4. Detect anomalies (analyze)
  5. Link evidence candidates (analyze)
  6. Map action recommendations (analyze)
  7. Publish Revenue Brief (analyze)
"""
import argparse
import sys
import traceback

from pipelines.common import run_logger
from pipelines.common.run_logger import create_run, mark_processing, mark_completed, mark_failed

from pipelines.extract import (
    fetch_seoul_sales,
    fetch_seoul_population,
    fetch_trade_area_boundary,
    fetch_store_competition,
    fetch_weather_asos,
    fetch_holidays,
    fetch_local_events,
)
from pipelines.transform import (
    bronze_to_silver_revenue,
    bronze_to_silver_demand,
    bronze_to_silver_weather,
    bronze_to_silver_competition,
    bronze_to_silver_holiday,
    bronze_to_silver_local_event,
)
from pipelines.marts import (
    build_gold_revenue_context_mart,
)
from pipelines.analyze import (
    detect_revenue_anomalies,
    link_cause_evidence,
    map_action_recommendations,
    publish_revenue_brief,
)


def parse_args():
    p = argparse.ArgumentParser(description="Local Revenue Ops Medallion Pipeline")
    p.add_argument("--use-samples", action="store_true", default=True)
    p.add_argument("--no-use-samples", dest="use_samples", action="store_false")
    p.add_argument("--target-year", type=int, default=2024)
    p.add_argument("--target-quarter", type=int, default=4, choices=[1, 2, 3, 4])
    p.add_argument("--force-refresh", action="store_true", default=False)
    return p.parse_args()


def _baseline(year: int, quarter: int):
    if quarter == 1:
        return year - 1, 4
    return year, quarter - 1


def run(args):
    year = args.target_year
    quarter = args.target_quarter
    use_samples = args.use_samples
    baseline_year, baseline_quarter = _baseline(year, quarter)

    print(f"\nM3 Revenue Ops Medallion Pipeline")
    print(f"  Target: {year}Q{quarter}  Baseline: {baseline_year}Q{baseline_quarter}")
    print(f"  Mode: {'sample' if use_samples else 'live'}\n")

    root_run_id = create_run(
        run_type="pipeline",
        target_kind="medallion_pipeline",
        target_ref=f"{year}Q{quarter}",
    )
    mark_processing(root_run_id)

    bronze_count = 0
    silver_count = 0
    anomaly_count = 0
    evidence_count = 0
    action_count = 0
    brief_count = 0

    failed_stages = []

    # ── Stage 1: Extract (Bronze) ──────────────────────────────────────────
    print("Stage 1: Extracting Bronze sources...")
    extract_jobs = [
        ("seoul_sales_baseline",    lambda: fetch_seoul_sales.fetch(baseline_year, baseline_quarter, use_samples, root_run_id)),
        ("seoul_sales_compare",     lambda: fetch_seoul_sales.fetch(year, quarter, use_samples, root_run_id)),
        ("seoul_population_base",   lambda: fetch_seoul_population.fetch(baseline_year, baseline_quarter, use_samples, root_run_id)),
        ("seoul_population_cmp",    lambda: fetch_seoul_population.fetch(year, quarter, use_samples, root_run_id)),
        ("trade_area_boundary",     lambda: fetch_trade_area_boundary.fetch(use_samples, root_run_id)),
        ("store_competition_base",  lambda: fetch_store_competition.fetch(baseline_year, baseline_quarter, use_samples, root_run_id)),
        ("store_competition_cmp",   lambda: fetch_store_competition.fetch(year, quarter, use_samples, root_run_id)),
        ("weather_baseline",        lambda: fetch_weather_asos.fetch(baseline_year, baseline_quarter, use_samples, root_run_id)),
        ("weather_compare",         lambda: fetch_weather_asos.fetch(year, quarter, use_samples, root_run_id)),
        ("holidays",                lambda: fetch_holidays.fetch(year, use_samples, root_run_id)),
        ("local_events_baseline",   lambda: fetch_local_events.fetch(baseline_year, baseline_quarter, use_samples, root_run_id)),
        ("local_events_compare",    lambda: fetch_local_events.fetch(year, quarter, use_samples, root_run_id)),
    ]

    for name, job in extract_jobs:
        try:
            job()
            bronze_count += 1
            print(f"  [OK] {name}")
        except Exception as e:
            print(f"  [WARN] {name}: {e}")

    # ── Stage 2: Transform (Silver) ────────────────────────────────────────
    print("\nStage 2: Transforming Bronze → Silver...")
    silver_jobs = [
        ("revenue_signal (baseline)", lambda: bronze_to_silver_revenue.transform(baseline_year, baseline_quarter, root_run_id)),
        ("revenue_signal (compare)",  lambda: bronze_to_silver_revenue.transform(year, quarter, root_run_id)),
        ("demand_signal (baseline)",  lambda: bronze_to_silver_demand.transform(baseline_year, baseline_quarter, root_run_id)),
        ("demand_signal (compare)",   lambda: bronze_to_silver_demand.transform(year, quarter, root_run_id)),
        ("weather_signal (baseline)", lambda: bronze_to_silver_weather.transform(baseline_year, baseline_quarter, root_run_id)),
        ("weather_signal (compare)",  lambda: bronze_to_silver_weather.transform(year, quarter, root_run_id)),
        ("competition_snapshot (base)", lambda: bronze_to_silver_competition.transform(baseline_year, baseline_quarter, root_run_id)),
        ("competition_snapshot (cmp)",  lambda: bronze_to_silver_competition.transform(year, quarter, root_run_id)),
        ("holiday_context",           lambda: bronze_to_silver_holiday.transform(year, root_run_id)),
        ("local_event_context (base)",lambda: bronze_to_silver_local_event.transform(baseline_year, baseline_quarter, root_run_id)),
        ("local_event_context (cmp)", lambda: bronze_to_silver_local_event.transform(year, quarter, root_run_id)),
    ]

    required_silver = {"revenue_signal (compare)", "revenue_signal (baseline)"}
    for name, job in silver_jobs:
        try:
            job()
            silver_count += 1
            print(f"  [OK] {name}")
        except Exception as e:
            if name in required_silver:
                failed_stages.append(f"Silver/{name}: {e}")
                print(f"  [FAIL] {name}: {e}")
            else:
                print(f"  [WARN] {name}: {e}")

    if failed_stages:
        mark_failed(root_run_id, Exception(f"Required stages failed: {failed_stages}"))
        print(f"\n[FAIL] Required silver stages failed. Aborting.")
        return False

    # ── Stage 3: Gold context mart ─────────────────────────────────────────
    print("\nStage 3: Building Gold revenue_context_mart...")
    try:
        out = build_gold_revenue_context_mart.build(
            baseline_year, baseline_quarter, year, quarter, root_run_id
        )
        import pandas as pd
        mart = pd.read_parquet(out)
        gold_mart_rows = len(mart)
        print(f"  [OK] revenue_context_mart — {gold_mart_rows} rows")
    except Exception as e:
        traceback.print_exc()
        mark_failed(root_run_id, e)
        print(f"\n[FAIL] Gold mart build failed: {e}")
        return False

    # ── Stage 4: Detect anomalies ──────────────────────────────────────────
    print("\nStage 4: Detecting revenue anomalies...")
    try:
        out = detect_revenue_anomalies.detect(year, quarter, baseline_year, baseline_quarter, root_run_id)
        import pandas as pd
        df = pd.read_parquet(out)
        anomaly_count = len(df)
        print(f"  [OK] anomalies detected: {anomaly_count}")
    except Exception as e:
        traceback.print_exc()
        mark_failed(root_run_id, e)
        print(f"\n[FAIL] Anomaly detection failed: {e}")
        return False

    # ── Stage 5: Link evidence ─────────────────────────────────────────────
    print("\nStage 5: Linking cause evidence candidates...")
    try:
        out = link_cause_evidence.link(year, quarter, root_run_id)
        import pandas as pd
        df = pd.read_parquet(out)
        evidence_count = len(df)
        print(f"  [OK] evidence candidates: {evidence_count}")
    except Exception as e:
        traceback.print_exc()
        mark_failed(root_run_id, e)
        print(f"\n[FAIL] Evidence linking failed: {e}")
        return False

    # ── Stage 6: Map actions ───────────────────────────────────────────────
    print("\nStage 6: Mapping action recommendations...")
    try:
        out = map_action_recommendations.map_actions(year, quarter, root_run_id)
        import pandas as pd
        df = pd.read_parquet(out)
        action_count = len(df)
        print(f"  [OK] action recommendations: {action_count}")
    except Exception as e:
        traceback.print_exc()
        mark_failed(root_run_id, e)
        print(f"\n[FAIL] Action mapping failed: {e}")
        return False

    # ── Stage 7: Publish Revenue Brief ────────────────────────────────────
    print("\nStage 7: Publishing Revenue Brief...")
    try:
        out = publish_revenue_brief.publish(year, quarter, root_run_id)
        import pandas as pd
        df = pd.read_parquet(out)
        brief_count = len(df)
        print(f"  [OK] revenue briefs: {brief_count}")
        if not df.empty:
            print(f"\n  Brief headline: {df['headline'].iloc[0]}")
            print(f"  Summary: {df['summary'].iloc[0][:120]}...")
    except Exception as e:
        traceback.print_exc()
        mark_failed(root_run_id, e)
        print(f"\n[FAIL] Revenue Brief publish failed: {e}")
        return False

    mark_completed(root_run_id, output_ref=str(out))

    # ── Summary ────────────────────────────────────────────────────────────
    print(f"""
M3 Revenue Ops Medallion Pipeline completed
- Bronze sources prepared: {bronze_count}
- Silver datasets written: {silver_count}
- Gold mart rows: {gold_mart_rows}
- Anomalies detected: {anomaly_count}
- Evidence candidates: {evidence_count}
- Action recommendations: {action_count}
- Revenue briefs: {brief_count}
""")
    return True


if __name__ == "__main__":
    args = parse_args()
    success = run(args)
    sys.exit(0 if success else 1)
