"""
Smoke test: full local pipeline runs without errors using sample data.
"""
import json
import subprocess
import sys
from pathlib import Path

import pytest


def test_pipeline_smoke_run():
    result = subprocess.run(
        [
            sys.executable, "-m",
            "pipelines.orchestration.run_local_medallion_pipeline",
            "--use-samples",
            "--target-year", "2024",
            "--target-quarter", "4",
        ],
        capture_output=True,
        text=True,
        cwd=str(Path(__file__).parent.parent),
    )
    assert result.returncode == 0, (
        f"Pipeline failed with exit code {result.returncode}\n"
        f"STDOUT:\n{result.stdout}\n"
        f"STDERR:\n{result.stderr}"
    )
    assert "Pipeline completed" in result.stdout


def test_run_log_created():
    log_path = Path(__file__).parent.parent / "data" / "runs" / "run_log.jsonl"
    assert log_path.exists(), "run_log.jsonl was not created"
    lines = log_path.read_text().strip().splitlines()
    assert len(lines) > 0, "run_log.jsonl is empty"
    record = json.loads(lines[0])
    assert "run_id" in record
    assert "status" in record


def test_silver_files_created():
    silver_root = Path(__file__).parent.parent / "data" / "silver"
    for schema in ["revenue_signal", "demand_signal", "weather_signal", "competition_snapshot"]:
        parquet_files = list((silver_root / schema).glob("*.parquet"))
        assert parquet_files, f"No parquet files in silver/{schema}"


def test_gold_mart_created():
    gold_root = Path(__file__).parent.parent / "data" / "gold"
    mart_files = list((gold_root / "revenue_context_mart").glob("*.parquet"))
    assert mart_files, "No parquet files in gold/revenue_context_mart"

    import pandas as pd
    df = pd.read_parquet(mart_files[0])
    assert len(df) > 0, "Gold mart is empty"


def test_anomaly_file_created():
    anomaly_dir = Path(__file__).parent.parent / "data" / "gold" / "revenue_anomaly_results"
    files = list(anomaly_dir.glob("*.parquet"))
    assert files, "No anomaly results parquet file found"

    import pandas as pd
    df = pd.read_parquet(files[0])
    assert len(df) > 0, "No anomalies detected — sample data should produce at least 1"


def test_evidence_candidates_created():
    ev_dir = Path(__file__).parent.parent / "data" / "gold" / "cause_evidence_candidates"
    files = list(ev_dir.glob("*.parquet"))
    assert files, "No evidence candidates parquet file found"

    import pandas as pd
    df = pd.read_parquet(files[0])
    assert len(df) > 0, "No evidence candidates generated"


def test_action_recommendations_created():
    act_dir = Path(__file__).parent.parent / "data" / "gold" / "action_recommendation_candidates"
    files = list(act_dir.glob("*.parquet"))
    assert files, "No action recommendations parquet file found"

    import pandas as pd
    df = pd.read_parquet(files[0])
    assert len(df) >= 3, f"Expected at least 3 action recommendations, got {len(df)}"


def test_revenue_brief_created():
    brief_dir = Path(__file__).parent.parent / "data" / "gold" / "revenue_brief_view"
    files = list(brief_dir.glob("*.parquet"))
    assert files, "No revenue brief parquet file found"

    import pandas as pd
    df = pd.read_parquet(files[0])
    assert len(df) > 0, "Revenue brief is empty"
    assert "headline" in df.columns
    assert "summary" in df.columns


def test_bronze_samples_not_mutated():
    sample_dir = Path(__file__).parent.parent / "data" / "samples" / "revenue_ops_demo"
    q3_sales = sample_dir / "bronze_seoul_sales_2024Q3.csv"
    assert q3_sales.exists(), "Q3 baseline sample file missing"
    content = q3_sales.read_text()
    assert "285000000" in content, "Q3 baseline revenue was mutated"
