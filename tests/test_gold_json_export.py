"""
Tests: Gold-to-JSON export script.
"""
import json
from pathlib import Path
import pytest

_REPO_ROOT = Path(__file__).parent.parent
_TRACKED_EXPORT = _REPO_ROOT / "apps" / "api" / "src" / "revenue-ops" / "data" / "revenue_ops_export.json"


def _run_export(tmp_path):
    from scripts.export_gold_to_json import export
    return export(out_dir=tmp_path, deterministic=True)


def test_export_returns_all_keys(tmp_path):
    result = _run_export(tmp_path)
    for key in ("briefs", "anomalies", "evidence", "actions", "context", "pipeline_meta"):
        assert key in result, f"Missing key '{key}' in export result"


def test_export_writes_json_file(tmp_path):
    _run_export(tmp_path)
    out_path = tmp_path / "revenue_ops_export.json"
    assert out_path.exists(), f"Export JSON file not found: {out_path}"


def test_export_json_is_valid(tmp_path):
    _run_export(tmp_path)
    out_path = tmp_path / "revenue_ops_export.json"
    with open(out_path, encoding="utf-8") as f:
        data = json.load(f)
    assert isinstance(data, dict)


def test_export_briefs_not_empty(tmp_path):
    result = _run_export(tmp_path)
    assert len(result["briefs"]) >= 1, "Expected at least 1 brief in export"


def test_export_briefs_have_required_fields(tmp_path):
    result = _run_export(tmp_path)
    required = {"brief_id", "trade_area_name", "service_category_name", "period_label", "headline", "summary"}
    for brief in result["briefs"]:
        missing = required - set(brief.keys())
        assert not missing, f"Brief missing fields: {missing}"


def test_export_anomalies_not_empty(tmp_path):
    result = _run_export(tmp_path)
    assert len(result["anomalies"]) >= 1


def test_export_evidence_not_empty(tmp_path):
    result = _run_export(tmp_path)
    assert len(result["evidence"]) >= 1


def test_export_actions_not_empty(tmp_path):
    result = _run_export(tmp_path)
    assert len(result["actions"]) >= 1


def test_export_actions_have_status(tmp_path):
    result = _run_export(tmp_path)
    valid_statuses = {"recommended", "selected", "planned", "done", "dismissed"}
    for action in result["actions"]:
        assert "status" in action, f"Action {action.get('action_id')} missing 'status'"
        assert action["status"] in valid_statuses, f"Invalid status: {action['status']}"


def test_export_top_cause_candidates_parsed(tmp_path):
    result = _run_export(tmp_path)
    for brief in result["briefs"]:
        candidates = brief.get("top_cause_candidates", [])
        assert isinstance(candidates, list), "top_cause_candidates should be a list (parsed from JSON)"


def test_export_recommended_actions_parsed(tmp_path):
    result = _run_export(tmp_path)
    for brief in result["briefs"]:
        actions = brief.get("recommended_actions", [])
        assert isinstance(actions, list), "recommended_actions should be a list (parsed from JSON)"


def test_export_pipeline_meta_has_gold_files(tmp_path):
    result = _run_export(tmp_path)
    meta = result["pipeline_meta"]
    assert "gold_files" in meta


def test_export_context_has_coverage_score(tmp_path):
    result = _run_export(tmp_path)
    for ctx in result["context"]:
        assert "source_coverage_score" in ctx
        score = ctx["source_coverage_score"]
        assert 0.0 <= score <= 1.0, f"Coverage score out of range: {score}"


def test_export_does_not_rewrite_tracked_demo_json(tmp_path):
    before = _TRACKED_EXPORT.read_bytes() if _TRACKED_EXPORT.exists() else None
    _run_export(tmp_path)
    after = _TRACKED_EXPORT.read_bytes() if _TRACKED_EXPORT.exists() else None
    assert after == before
