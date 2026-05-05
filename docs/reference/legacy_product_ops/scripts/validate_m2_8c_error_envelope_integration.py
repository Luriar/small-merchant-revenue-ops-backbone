#!/usr/bin/env python3
"""Static validator for the M2-8C-Prep CDC error envelope contract."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

from m2_8i_validator_compat import (
    git_diff_is_empty_or_approved_m2_8i,
    server_has_no_cdc_recovery_or_approved_m2_8i,
)


ROOT = Path(__file__).resolve().parents[1]

REQUIRED_DOCS = [
    "docs/m2_8c_prep_error_envelope_integration_kr.md",
    "docs/m2_8c_error_envelope_decision_record_kr.md",
]

REQUIRED_CHECKLISTS = [
    "ops/m2_8c_error_envelope_integration/checklists/error_envelope_integration_checklist.md",
    "ops/m2_8c_error_envelope_integration/checklists/route_error_mapping_checklist.md",
    "ops/m2_8c_error_envelope_integration/checklists/redaction_safety_checklist.md",
]

REQUIRED_FILES = [
    *REQUIRED_DOCS,
    *REQUIRED_CHECKLISTS,
    "fixtures/m2_8c_errors/error_envelope_examples.json",
]

REQUIRED_MARKERS = [
    ("not live route wiring", [r"not live route wiring", r"no live route wiring"]),
    ("server.js must not be modified", [r"`?server\.js`? must not be modified", r"no server\.js modification"]),
    ("auth.js must not be modified", [r"`?auth\.js`? must not be modified", r"no auth\.js modification"]),
    ("no production error behavior change", [r"no production error behavior change"]),
    ("OpenAPI main merge", [r"openapi main merge"]),
    ("error envelope", [r"error envelope"]),
    ("validation_error", [r"validation_error"]),
    ("unauthorized", [r"unauthorized"]),
    ("forbidden", [r"forbidden"]),
    ("not_found", [r"not_found"]),
    ("idempotency_conflict", [r"idempotency_conflict"]),
    ("invalid_state_transition", [r"invalid_state_transition"]),
    ("worker_boundary_conflict", [r"worker_boundary_conflict"]),
    ("internal_error", [r"internal_error"]),
    ("400", [r"400"]),
    ("401", [r"401"]),
    ("403", [r"403"]),
    ("404", [r"404"]),
    ("409", [r"409"]),
    ("500", [r"500"]),
    ("evidence_report_ref", [r"evidence_report_ref"]),
    ("no raw payloads", [r"no raw payloads"]),
    ("no full message bodies", [r"no full message bodies"]),
    ("no issue raw values", [r"no issue raw values"]),
    ("no prod_change payload/actor values", [r"no prod_change payload/actor values"]),
    ("no stack traces", [r"no stack traces"]),
    ("no SQL details", [r"no sql details"]),
    ("logs must not reveal raw values", [r"logs must not reveal raw values"]),
]

REQUIRED_ROUTE_ACTIONS = [
    "GET /api/v1/cdc/failures",
    "GET /api/v1/cdc/failures/{failure_id}",
    "GET /api/v1/cdc/failures/{failure_id}/state-log",
    "POST /api/v1/cdc/failures/{failure_id}/replay-requests",
    "GET /api/v1/cdc/replay-requests",
    "GET /api/v1/cdc/replay-requests/{replay_request_id}",
    "POST /api/v1/cdc/replay-requests/{replay_request_id}/approve",
    "POST /api/v1/cdc/replay-requests/{replay_request_id}/cancel",
    "future worker action: linkNewRunId",
    "future worker action: mark replay running/succeeded/failed",
    "future cleanup action: mark cleanup_complete",
]

REQUIRED_ERROR_CODES = [
    "validation_error",
    "unauthorized",
    "forbidden",
    "not_found",
    "idempotency_conflict",
    "invalid_state_transition",
    "worker_boundary_conflict",
    "internal_error",
]

SUSPICIOUS_KEYS = {
    "payload",
    "body",
    "title",
    "reporter",
    "actor",
    "raw_message",
    "message_body",
    "full_message",
    "secret",
    "password",
    "token",
    "endpoint",
    "db_url",
    "connection_string",
    "stack",
    "sql",
    "query",
    "compared_body",
    "compared_payload",
}

PACKAGE_SCRIPT = "validate:m2-8c-prep:error-envelope"


class Validator:
    def __init__(self) -> None:
        self.pass_count = 0
        self.fail_count = 0

    def check(self, condition: bool, message: str) -> None:
        if condition:
            self.pass_count += 1
            print(f"PASS: {message}")
        else:
            self.fail_count += 1
            print(f"FAIL: {message}")

    def summary(self) -> int:
        print(f"\nSummary: {self.pass_count} PASS, {self.fail_count} FAIL")
        return 1 if self.fail_count else 0


def path_for(relative_path: str) -> Path:
    return ROOT / relative_path


def file_exists(relative_path: str) -> bool:
    return path_for(relative_path).is_file()


def read_text(relative_path: str) -> str:
    return path_for(relative_path).read_text(encoding="utf-8")


def read_existing_text(relative_path: str) -> str:
    path = path_for(relative_path)
    return path.read_text(encoding="utf-8") if path.is_file() else ""


def combined_required_text() -> str:
    return "\n".join(read_existing_text(relative_path) for relative_path in REQUIRED_FILES).casefold()


def load_json_object(relative_path: str) -> dict[str, Any] | None:
    try:
        value = json.loads(read_text(relative_path))
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


def package_has_script(script_name: str) -> bool:
    package = load_json_object("package.json")
    if package is None:
        return False
    scripts = package.get("scripts")
    return isinstance(scripts, dict) and script_name in scripts


def has_any_pattern(text: str, patterns: list[str]) -> bool:
    return any(re.search(pattern, text, flags=re.I) for pattern in patterns)


def collect_keys(value: Any) -> set[str]:
    keys: set[str] = set()
    if isinstance(value, dict):
        for key, child in value.items():
            keys.add(str(key))
            keys.update(collect_keys(child))
    elif isinstance(value, list):
        for item in value:
            keys.update(collect_keys(item))
    return keys


def fixture_has_required_error_codes(fixture: dict[str, Any] | None) -> bool:
    if fixture is None:
        return False
    examples = fixture.get("examples")
    return isinstance(examples, dict) and all(code in examples for code in REQUIRED_ERROR_CODES)


def fixture_examples_have_required_fields(fixture: dict[str, Any] | None) -> bool:
    if fixture is None:
        return False
    examples = fixture.get("examples")
    if not isinstance(examples, dict):
        return False
    for code in REQUIRED_ERROR_CODES:
        example = examples.get(code)
        if not isinstance(example, dict):
            return False
        if not isinstance(example.get("status"), int):
            return False
        if example.get("code") != code:
            return False
        if not isinstance(example.get("message"), str) or not example["message"]:
            return False
    return True


def fixture_has_no_suspicious_keys(fixture: dict[str, Any] | None) -> bool:
    if fixture is None:
        return False
    return not (collect_keys(fixture) & SUSPICIOUS_KEYS)


def server_is_not_wired() -> bool:
    if server_has_no_cdc_recovery_or_approved_m2_8i(ROOT):
        return True
    text = read_text("apps/api/src/server.js")
    forbidden_patterns = [
        r"cdc-recovery",
        r"/api/v1/cdc/failures",
        r"/api/v1/cdc/replay-requests",
        r"createCdcRecoveryHandler",
        r"createCdcRecoveryRepository",
        r"createCdcRecoveryService",
    ]
    return not any(re.search(pattern, text, flags=re.I) for pattern in forbidden_patterns)


def git_diff_is_empty(relative_path: str) -> bool:
    return git_diff_is_empty_or_approved_m2_8i(ROOT, relative_path)


def main() -> int:
    validator = Validator()

    for relative_path in REQUIRED_DOCS:
        validator.check(file_exists(relative_path), f"required doc exists: {relative_path}")

    for relative_path in REQUIRED_CHECKLISTS:
        validator.check(file_exists(relative_path), f"required checklist exists: {relative_path}")

    validator.check(file_exists("fixtures/m2_8c_errors/error_envelope_examples.json"), "error fixture exists")
    fixture = load_json_object("fixtures/m2_8c_errors/error_envelope_examples.json")
    validator.check(fixture is not None, "error fixture is valid JSON object")
    validator.check(fixture_has_required_error_codes(fixture), "fixture includes all required error codes")
    validator.check(fixture_examples_have_required_fields(fixture), "fixture examples include status, code, and message")
    validator.check(fixture_has_no_suspicious_keys(fixture), "fixture has no suspicious raw keys recursively")

    combined_text = combined_required_text()
    for marker_name, patterns in REQUIRED_MARKERS:
        validator.check(has_any_pattern(combined_text, patterns), f"docs/checklists contain marker: {marker_name}")

    mapping_text = read_existing_text("docs/m2_8c_prep_error_envelope_integration_kr.md")
    for route_action in REQUIRED_ROUTE_ACTIONS:
        validator.check(route_action in mapping_text, f"route-to-error mapping mentions: {route_action}")

    validator.check(server_is_not_wired(), "apps/api/src/server.js does not import cdc-recovery")
    validator.check(git_diff_is_empty("apps/api/src/server.js"), "apps/api/src/server.js has no working-tree diff")
    validator.check(git_diff_is_empty("apps/api/src/auth.js"), "apps/api/src/auth.js has no working-tree diff")
    validator.check(git_diff_is_empty("apps/api/src/error-response.js"), "apps/api/src/error-response.js has no working-tree diff")
    validator.check(package_has_script(PACKAGE_SCRIPT), f"package.json has script: {PACKAGE_SCRIPT}")

    return validator.summary()


if __name__ == "__main__":
    sys.exit(main())
