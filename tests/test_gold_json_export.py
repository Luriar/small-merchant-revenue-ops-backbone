"""
Tests: Gold-to-JSON export script.
"""
import json
from pathlib import Path
import pytest

_REPO_ROOT = Path(__file__).parent.parent


def _run_export():
    from scripts.export_gold_to_json import export
    return export()


def test_export_returns_all_keys():
    result = _run_export()
    for key in ("briefs", "anomalies", "evidence", "actions", "context", "pipeline_meta"):
        assert key in result, f"Missing key '{key}' in export result"


def test_export_writes_json_file():
    _run_export()
    out_path = _REPO_ROOT / "apps" / "api" / "src" / "revenue-ops" / "data" / "revenue_ops_export.json"
    assert out_path.exists(), f"Export JSON file not found: {out_path}"


def test_export_json_is_valid():
    _run_export()
    out_path = _REPO_ROOT / "apps" / "api" / "src" / "revenue-ops" / "data" / "revenue_ops_export.json"
    with open(out_path, encoding="utf-8") as f:
        data = json.load(f)
    assert isinstance(data, dict)


def test_export_briefs_not_empty():
    result = _run_export()
    assert len(result["briefs"]) >= 1, "Expected at least 1 brief in export"


def test_export_briefs_have_required_fields():
    result = _run_export()
    required = {"brief_id", "trade_area_name", "service_category_name", "period_label", "headline", "summary"}
    for brief in result["briefs"]:
        missing = required - set(brief.keys())
        assert not missing, f"Brief missing fields: {missing}"


def test_export_anomalies_not_empty():
    result = _run_export()
    assert len(result["anomalies"]) >= 1


def test_export_evidence_not_empty():
    result = _run_export()
    assert len(result["evidence"]) >= 1


def test_export_actions_not_empty():
    result = _run_export()
    assert len(result["actions"]) >= 1


def test_export_actions_have_status():
    result = _run_export()
    valid_statuses = {"recommended", "selected", "planned", "done", "dismissed"}
    for action in result["actions"]:
        assert "status" in action, f"Action {action.get('action_id')} missing 'status'"
        assert action["status"] in valid_statuses, f"Invalid status: {action['status']}"


def test_export_top_cause_candidates_parsed():
    result = _run_export()
    for brief in result["briefs"]:
        candidates = brief.get("top_cause_candidates", [])
        assert isinstance(candidates, list), "top_cause_candidates should be a list (parsed from JSON)"


def test_export_recommended_actions_parsed():
    result = _run_export()
    for brief in result["briefs"]:
        actions = brief.get("recommended_actions", [])
        assert isinstance(actions, list), "recommended_actions should be a list (parsed from JSON)"


def test_export_pipeline_meta_has_gold_files():
    result = _run_export()
    meta = result["pipeline_meta"]
    assert "gold_files" in meta


def test_export_context_has_coverage_score():
    result = _run_export()
    for ctx in result["context"]:
        assert "source_coverage_score" in ctx
        score = ctx["source_coverage_score"]
        assert 0.0 <= score <= 1.0, f"Coverage score out of range: {score}"
