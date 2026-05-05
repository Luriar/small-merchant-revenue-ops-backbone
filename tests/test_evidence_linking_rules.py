"""
Tests: Evidence linking rule logic.
"""
import pytest

from pipelines.analyze.link_cause_evidence import (
    POPULATION_DROP_STRONG,
    POPULATION_DROP_MEDIUM,
)


def test_strong_demand_threshold():
    assert POPULATION_DROP_STRONG == -10.0


def test_medium_demand_threshold():
    assert POPULATION_DROP_MEDIUM == -5.0


def _apply_demand_rule(pop_chg: float) -> str | None:
    if pop_chg <= POPULATION_DROP_STRONG:
        return "strong"
    elif pop_chg <= POPULATION_DROP_MEDIUM:
        return "medium"
    return None


def _apply_weather_rule(rain_days: int, heavy_rain: int) -> bool:
    return rain_days > 10 or heavy_rain > 3


def _apply_competition_rule(store_chg: int) -> bool:
    return store_chg > 0


def _apply_benchmark_rule(pop_chg: float, rev_delta: float) -> bool:
    return pop_chg > -5.0 and rev_delta <= -10.0


def test_demand_evidence_strong():
    assert _apply_demand_rule(-12.0) == "strong"


def test_demand_evidence_medium():
    assert _apply_demand_rule(-7.0) == "medium"


def test_demand_evidence_not_triggered_small_drop():
    assert _apply_demand_rule(-3.0) is None


def test_weather_evidence_many_rain_days():
    assert _apply_weather_rule(rain_days=12, heavy_rain=1) is True


def test_weather_evidence_heavy_rain():
    assert _apply_weather_rule(rain_days=5, heavy_rain=4) is True


def test_weather_evidence_not_triggered():
    assert _apply_weather_rule(rain_days=5, heavy_rain=1) is False


def test_competition_evidence_triggered():
    assert _apply_competition_rule(store_chg=6) is True


def test_competition_evidence_not_triggered_no_growth():
    assert _apply_competition_rule(store_chg=0) is False


def test_benchmark_evidence_demand_stable_revenue_drops():
    assert _apply_benchmark_rule(pop_chg=-2.0, rev_delta=-12.0) is True


def test_benchmark_evidence_not_triggered_when_demand_also_drops():
    assert _apply_benchmark_rule(pop_chg=-8.0, rev_delta=-12.0) is False


def test_benchmark_evidence_not_triggered_small_revenue_drop():
    assert _apply_benchmark_rule(pop_chg=-2.0, rev_delta=-5.0) is False
