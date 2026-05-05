"""
Tests: Silver revenue_signal schema validation.
"""
import pandas as pd
import pytest

from pipelines.common.schemas import validate_schema, SILVER_SCHEMAS, SchemaValidationError


def _make_valid_revenue_signal():
    return pd.DataFrame([{
        "period_type": "quarterly",
        "period_start": "2024-10-01",
        "period_end": "2024-12-31",
        "year": 2024,
        "quarter": 4,
        "trade_area_code": "3110067",
        "trade_area_name": "성수",
        "service_category_code": "CS300006",
        "service_category_name": "커피음료",
        "revenue_amount": 250800000.0,
        "transaction_count": 25650.0,
        "weekday_revenue_amount": 172000000.0,
        "weekend_revenue_amount": 78800000.0,
        "source": "public:seoul_estimated_sales",
        "source_updated_at": "2024-01-01T00:00:00+00:00",
    }])


def test_valid_revenue_signal_passes():
    df = _make_valid_revenue_signal()
    validate_schema(df, "revenue_signal", layer="silver")


def test_missing_required_column_raises():
    df = _make_valid_revenue_signal().drop(columns=["revenue_amount"])
    with pytest.raises(SchemaValidationError) as exc:
        validate_schema(df, "revenue_signal", layer="silver")
    assert "revenue_amount" in str(exc.value)


def test_all_required_columns_defined():
    cols = SILVER_SCHEMAS["revenue_signal"]
    assert "period_type" in cols
    assert "trade_area_code" in cols
    assert "revenue_amount" in cols
    assert "transaction_count" in cols
    assert "source" in cols
    assert len(cols) == 15


def test_unknown_schema_raises():
    df = pd.DataFrame({"col": [1]})
    with pytest.raises(SchemaValidationError):
        validate_schema(df, "nonexistent_schema", layer="silver")
