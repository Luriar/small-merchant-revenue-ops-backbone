"""
Tests: Revenue anomaly detection rule logic.
"""
import pandas as pd
import pytest

from pipelines.analyze.detect_revenue_anomalies import (
    REVENUE_DROP_THRESHOLD,
    SEVERE_REVENUE_DROP_THRESHOLD,
    TRANSACTION_DROP_THRESHOLD,
)


def test_revenue_drop_threshold():
    assert REVENUE_DROP_THRESHOLD == -10.0


def test_severe_revenue_drop_threshold():
    assert SEVERE_REVENUE_DROP_THRESHOLD == -20.0


def test_transaction_drop_threshold():
    assert TRANSACTION_DROP_THRESHOLD == -10.0


def _mart_row(rev_chg: float = 0.0, txn_chg: float = 0.0, pop_chg: float = 0.0) -> dict:
    return {
        "year": 2024, "quarter": 4,
        "period_start": "2024-10-01", "period_end": "2024-12-31",
        "trade_area_code": "3110067", "trade_area_name": "성수",
        "service_category_code": "CS300006", "service_category_name": "커피음료",
        "revenue_amount": 250800000.0 * (1 + rev_chg / 100),
        "transaction_count": 25650.0 * (1 + txn_chg / 100),
        "revenue_change_pct": rev_chg,
        "transaction_change_pct": txn_chg,
        "total_population": 115000,
        "population_change_pct": pop_chg,
        "store_count": 34, "store_count_change": 6,
        "rain_day_count": 12, "heavy_rain_day_count": 4,
        "hot_day_count": 0, "cold_day_count": 5,
        "holiday_count": 3, "local_event_count": 2,
        "source_coverage_score": 0.86,
    }


def _run_rules(mart_row: dict) -> list:
    anomalies = []
    rev_chg = mart_row["revenue_change_pct"]
    txn_chg = mart_row["transaction_change_pct"]
    pop_chg = mart_row["population_change_pct"]

    if rev_chg <= SEVERE_REVENUE_DROP_THRESHOLD:
        anomalies.append("severe_revenue_drop")
    elif rev_chg <= REVENUE_DROP_THRESHOLD:
        anomalies.append("revenue_drop")

    if txn_chg <= TRANSACTION_DROP_THRESHOLD:
        anomalies.append("transaction_drop")

    if rev_chg < 0 and pop_chg >= 0:
        anomalies.append("weak_growth_warning")

    return anomalies


def test_revenue_drop_detected():
    row = _mart_row(rev_chg=-12.0, txn_chg=-10.0, pop_chg=-8.0)
    anomalies = _run_rules(row)
    assert "revenue_drop" in anomalies


def test_severe_revenue_drop_detected():
    row = _mart_row(rev_chg=-25.0)
    anomalies = _run_rules(row)
    assert "severe_revenue_drop" in anomalies
    assert "revenue_drop" not in anomalies


def test_transaction_drop_detected():
    row = _mart_row(rev_chg=-5.0, txn_chg=-15.0)
    anomalies = _run_rules(row)
    assert "transaction_drop" in anomalies


def test_weak_growth_warning_when_demand_stable():
    row = _mart_row(rev_chg=-5.0, pop_chg=2.0)
    anomalies = _run_rules(row)
    assert "weak_growth_warning" in anomalies


def test_no_anomaly_for_positive_revenue():
    row = _mart_row(rev_chg=5.0, txn_chg=3.0, pop_chg=2.0)
    anomalies = _run_rules(row)
    assert anomalies == []


def test_no_anomaly_for_small_decline():
    row = _mart_row(rev_chg=-5.0, txn_chg=-5.0, pop_chg=-3.0)
    anomalies = _run_rules(row)
    assert "revenue_drop" not in anomalies
    assert "transaction_drop" not in anomalies
