"""
Tests: Action catalog loading and action mapping logic.
"""
from pathlib import Path
import yaml
import pytest


_CATALOG_PATH = Path(__file__).parent.parent / "configs" / "action_catalog.yaml"


def _load():
    with open(_CATALOG_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)


def test_catalog_loads():
    data = _load()
    assert "actions" in data
    assert "action_mapping" in data


def test_at_least_16_actions():
    data = _load()
    assert len(data["actions"]) >= 16


def test_all_actions_have_required_fields():
    data = _load()
    required = {"action_type", "title", "description", "why_this_action", "expected_effect", "risk_note"}
    for name, action in data["actions"].items():
        missing = required - set(action.keys())
        assert not missing, f"Action '{name}' missing fields: {missing}"


def test_action_mapping_covers_key_evidence_combinations():
    data = _load()
    mapping = data["action_mapping"]
    assert "revenue_drop_demand_weather" in mapping
    assert "revenue_drop_demand" in mapping
    assert "revenue_drop_competition" in mapping
    assert "revenue_drop_context" in mapping
    assert "revenue_drop_benchmark" in mapping


def test_each_mapping_has_at_least_3_actions():
    data = _load()
    for combo, m in data["action_mapping"].items():
        actions = m.get("recommended_actions", [])
        assert len(actions) >= 3, f"Mapping '{combo}' has fewer than 3 actions: {actions}"


def test_referenced_actions_exist():
    data = _load()
    action_names = set(data["actions"].keys())
    for combo, m in data["action_mapping"].items():
        for ak in m.get("recommended_actions", []):
            assert ak in action_names, f"Mapping '{combo}' references unknown action '{ak}'"


def test_action_type_from_taxonomy():
    data = _load()
    valid_types = {
        "promotion", "menu_update", "operational", "channel",
        "customer_retention", "cost_management", "communication"
    }
    for name, a in data["actions"].items():
        assert a["action_type"] in valid_types, (
            f"Action '{name}' has unknown action_type '{a['action_type']}'"
        )
