"""
Tests: Step Functions ASL JSON is syntactically valid and structurally correct.
"""
import json
from pathlib import Path
import pytest

_ASL_PATH = Path(__file__).parent.parent / "pipelines" / "orchestration" / "step_functions_state_machine.asl.json"

REQUIRED_STATES = [
    "CreateRun",
    "ExtractSources",
    "ValidateBronze",
    "BronzeToSilver",
    "SilverToGold",
    "DetectAnomalies",
    "LinkEvidence",
    "MapActions",
    "PublishRevenueBrief",
    "CompleteRun",
    "FailRun",
]


def test_asl_file_exists():
    assert _ASL_PATH.exists(), f"ASL file not found: {_ASL_PATH}"


def test_asl_valid_json():
    content = _ASL_PATH.read_text(encoding="utf-8")
    try:
        data = json.loads(content)
    except json.JSONDecodeError as e:
        pytest.fail(f"ASL is not valid JSON: {e}")
    assert data is not None


def test_asl_has_start_at():
    data = json.loads(_ASL_PATH.read_text())
    assert "StartAt" in data, "ASL missing 'StartAt'"


def test_asl_has_states():
    data = json.loads(_ASL_PATH.read_text())
    assert "States" in data, "ASL missing 'States'"
    assert isinstance(data["States"], dict)
    assert len(data["States"]) > 0


def test_asl_required_states_present():
    data = json.loads(_ASL_PATH.read_text())
    states = data["States"]
    for state_name in REQUIRED_STATES:
        assert state_name in states, f"Required state '{state_name}' missing from ASL"


def test_asl_start_at_is_valid_state():
    data = json.loads(_ASL_PATH.read_text())
    assert data["StartAt"] in data["States"], (
        f"StartAt '{data['StartAt']}' is not a defined state"
    )


def test_asl_has_fail_state():
    data = json.loads(_ASL_PATH.read_text())
    fail_states = [k for k, v in data["States"].items() if v.get("Type") == "Fail"]
    assert fail_states, "ASL has no Fail state"
