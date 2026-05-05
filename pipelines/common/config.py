import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


def get_local_data_root() -> Path:
    return Path(os.getenv("LOCAL_DATA_ROOT", "./data"))


def use_sample_data() -> bool:
    return os.getenv("USE_SAMPLE_DATA", "true").lower() in ("true", "1", "yes")


def get_aws_region() -> str:
    return os.getenv("AWS_REGION", "ap-northeast-2")


def get_revenue_ops_bucket() -> str:
    return os.getenv("REVENUE_OPS_BUCKET", "")


def get_seoul_openapi_key() -> str:
    return os.getenv("SEOUL_OPENAPI_KEY", "")


def get_data_go_kr_key() -> str:
    return os.getenv("DATA_GO_KR_SERVICE_KEY", "")


def get_kma_station_id() -> str:
    return os.getenv("KMA_ASOS_STATION_ID", "108")


def bronze_path(source_name: str) -> Path:
    source_dirs = {
        "seoul_estimated_sales": "bronze/seoul_sales",
        "seoul_living_population": "bronze/seoul_population",
        "trade_area_boundary": "bronze/trade_area_boundary",
        "store_competition": "bronze/store_competition",
        "weather_asos": "bronze/weather_asos",
        "holidays": "bronze/holidays",
        "local_events": "bronze/local_events",
    }
    return get_local_data_root() / source_dirs[source_name]


def silver_path(schema_name: str) -> Path:
    return get_local_data_root() / "silver" / schema_name


def gold_path(mart_name: str) -> Path:
    return get_local_data_root() / "gold" / mart_name


def samples_path() -> Path:
    return get_local_data_root() / "samples" / "revenue_ops_demo"


def runs_path() -> Path:
    return get_local_data_root() / "runs"
