from datetime import datetime, timezone
from typing import Optional


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def make_source_tag(source_name: str) -> str:
    return f"public:{source_name}"


def quarter_label(year: int, quarter: int) -> str:
    return f"{year}Q{quarter}"


def quarter_date_range(year: int, quarter: int):
    starts = {1: "01-01", 2: "04-01", 3: "07-01", 4: "10-01"}
    ends = {1: "03-31", 2: "06-30", 3: "09-30", 4: "12-31"}
    period_start = f"{year}-{starts[quarter]}"
    period_end = f"{year}-{ends[quarter]}"
    return period_start, period_end


def coverage_score(sources_available: int, sources_total: int) -> float:
    if sources_total == 0:
        return 0.0
    return round(sources_available / sources_total, 2)
