from pathlib import Path
from typing import Optional
import pandas as pd


def read_parquet(path: Path) -> pd.DataFrame:
    files = sorted(path.glob("*.parquet"))
    if not files:
        raise FileNotFoundError(f"No parquet files in {path}")
    return pd.concat([pd.read_parquet(f) for f in files], ignore_index=True)


def write_parquet(df: pd.DataFrame, path: Path, filename: str = "data.parquet") -> Path:
    path.mkdir(parents=True, exist_ok=True)
    out = path / filename
    df.to_parquet(out, index=False)
    return out


def read_csv(path: Path) -> pd.DataFrame:
    files = sorted(path.glob("*.csv"))
    if not files:
        raise FileNotFoundError(f"No CSV files in {path}")
    return pd.concat([pd.read_csv(f) for f in files], ignore_index=True)


def write_csv(df: pd.DataFrame, path: Path, filename: str = "data.csv") -> Path:
    path.mkdir(parents=True, exist_ok=True)
    out = path / filename
    df.to_csv(out, index=False, encoding="utf-8-sig")
    return out


def read_bronze(bronze_dir: Path) -> pd.DataFrame:
    parquet_files = list(bronze_dir.glob("*.parquet"))
    csv_files = list(bronze_dir.glob("*.csv"))
    if parquet_files:
        return pd.concat([pd.read_parquet(f) for f in sorted(parquet_files)], ignore_index=True)
    if csv_files:
        return pd.concat([pd.read_csv(f) for f in sorted(csv_files)], ignore_index=True)
    raise FileNotFoundError(f"No CSV or Parquet files found in bronze path: {bronze_dir}")


def parquet_exists(path: Path) -> bool:
    return bool(list(path.glob("*.parquet")))
