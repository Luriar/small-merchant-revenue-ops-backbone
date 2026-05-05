"""
Tests: Silver weather_signal schema validation and derived boolean fields.
"""
import pandas as pd
import pytest

from pipelines.common.schemas import validate_schema, SILVER_SCHEMAS


def _make_weather_row(rainfall: float = 0.0, max_temp: float = 20.0, min_temp: float = 10.0) -> dict:
    return {
        "observed_date": "2024-10-01",
        "station_id": "108",
        "station_name": "서울",
        "avg_temp": (max_temp + min_temp) / 2,
        "min_temp": min_temp,
        "max_temp": max_temp,
        "daily_rainfall": rainfall,
        "avg_humidity": 70.0,
        "is_rain_day": rainfall >= 1.0,
        "is_heavy_rain_day": rainfall >= 30.0,
        "is_hot_day": max_temp >= 33.0,
        "is_cold_day": min_temp <= 0.0,
        "source": "public:weather_asos",
    }


def test_valid_weather_signal():
    df = pd.DataFrame([_make_weather_row()])
    validate_schema(df, "weather_signal", layer="silver")


def test_rain_day_flag():
    row = _make_weather_row(rainfall=5.0)
    assert row["is_rain_day"] is True
    assert row["is_heavy_rain_day"] is False


def test_heavy_rain_flag():
    row = _make_weather_row(rainfall=35.0)
    assert row["is_heavy_rain_day"] is True


def test_cold_day_flag():
    row = _make_weather_row(min_temp=-2.0)
    assert row["is_cold_day"] is True


def test_hot_day_flag():
    row = _make_weather_row(max_temp=34.0)
    assert row["is_hot_day"] is True


def test_required_columns_count():
    assert len(SILVER_SCHEMAS["weather_signal"]) == 13
