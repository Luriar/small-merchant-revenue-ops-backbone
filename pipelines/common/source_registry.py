from pathlib import Path
from typing import Dict, Any
import yaml


_REGISTRY_PATH = Path(__file__).parent.parent.parent / "configs" / "source_registry.yaml"


def load_registry() -> Dict[str, Any]:
    with open(_REGISTRY_PATH, encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return data.get("sources", {})


def get_source(source_name: str) -> Dict[str, Any]:
    registry = load_registry()
    if source_name not in registry:
        raise KeyError(f"Source '{source_name}' not found in registry")
    return registry[source_name]


def required_sources() -> Dict[str, Any]:
    return {k: v for k, v in load_registry().items() if v.get("required", False)}


def optional_sources() -> Dict[str, Any]:
    return {k: v for k, v in load_registry().items() if not v.get("required", False)}
