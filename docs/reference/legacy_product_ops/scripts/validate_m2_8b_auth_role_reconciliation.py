#!/usr/bin/env python3
"""Static validator for the M2-8B-Prep auth role reconciliation contract."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

from m2_8i_validator_compat import server_has_no_cdc_recovery_or_approved_m2_8i


ROOT = Path(__file__).resolve().parents[1]

REQUIRED_DOCS = [
    "docs/m2_8b_prep_auth_role_reconciliation_kr.md",
    "docs/m2_8b_auth_role_mapping_decision_record_kr.md",
]

REQUIRED_CHECKLISTS = [
    "ops/m2_8b_auth_role_reconciliation/checklists/auth_role_reconciliation_checklist.md",
    "ops/m2_8b_auth_role_reconciliation/checklists/route_permission_gate_checklist.md",
    "ops/m2_8b_auth_role_reconciliation/checklists/worker_role_boundary_checklist.md",
]

REQUIRED_FILES = [
    *REQUIRED_DOCS,
    *REQUIRED_CHECKLISTS,
    "fixtures/m2_8b_auth/role_mapping_examples.json",
]

REQUIRED_MARKERS = [
    ("not live route wiring", [r"not live route wiring", r"no live route wiring"]),
    ("server.js must not be modified", [r"`?server\.js`? must not be modified", r"no server\.js modification"]),
    ("auth.js must not be modified", [r"`?auth\.js`? must not be modified", r"no auth\.js modification"]),
    ("OpenAPI main merge", [r"openapi main merge"]),
    ("readonly_role", [r"readonly_role"]),
    ("operator", [r"operator"]),
    ("maintainer", [r"maintainer"]),
    ("system_worker", [r"system_worker"]),
    ("maintainer-only", [r"maintainer-only"]),
    ("role checks before service mutation", [r"role checks before service mutation"]),
    ("authorization failures do not reveal raw values", [r"authorization failures do not reveal raw values"]),
    ("no raw payloads", [r"no raw payloads"]),
    ("no full message bodies", [r"no full message bodies"]),
    ("no issue raw values", [r"no issue raw values"]),
    ("no prod_change payload/actor values", [r"no prod_change payload/actor values"]),
    ("401", [r"401"]),
    ("403", [r"403"]),
    ("409", [r"409"]),
]

REQUIRED_ENDPOINTS = [
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

REQUIRED_ROLES = [
    "readonly_role",
    "operator",
    "maintainer",
    "system_worker",
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
}

PACKAGE_SCRIPT = "validate:m2-8b-prep:auth-roles"


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


def fixture_has_required_roles(fixture: dict[str, Any] | None) -> bool:
    if fixture is None:
        return False
    roles = fixture.get("roles")
    return isinstance(roles, dict) and all(role in roles for role in REQUIRED_ROLES)


def fixture_has_role_action_arrays(fixture: dict[str, Any] | None) -> bool:
    if fixture is None:
        return False
    roles = fixture.get("roles")
    if not isinstance(roles, dict):
        return False
    for role in REQUIRED_ROLES:
        role_value = roles.get(role)
        if not isinstance(role_value, dict):
            return False
        if not isinstance(role_value.get("allowed_actions"), list):
            return False
        if not isinstance(role_value.get("forbidden_actions"), list):
            return False
    return True


def fixture_has_safe_error_examples(fixture: dict[str, Any] | None) -> bool:
    if fixture is None:
        return False
    examples = fixture.get("safe_error_examples")
    return isinstance(examples, dict) and "401" in examples and "403" in examples


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
    result = subprocess.run(
        ["git", "diff", "--quiet", "--", relative_path],
        cwd=ROOT,
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return result.returncode == 0


def main() -> int:
    validator = Validator()

    for relative_path in REQUIRED_DOCS:
        validator.check(file_exists(relative_path), f"required doc exists: {relative_path}")

    for relative_path in REQUIRED_CHECKLISTS:
        validator.check(file_exists(relative_path), f"required checklist exists: {relative_path}")

    validator.check(file_exists("fixtures/m2_8b_auth/role_mapping_examples.json"), "role mapping fixture exists")
    fixture = load_json_object("fixtures/m2_8b_auth/role_mapping_examples.json")
    validator.check(fixture is not None, "role mapping fixture is valid JSON object")
    validator.check(fixture_has_required_roles(fixture), "fixture contains all four M2 roles")
    validator.check(fixture_has_role_action_arrays(fixture), "fixture includes allowed_actions and forbidden_actions arrays")
    validator.check(fixture_has_safe_error_examples(fixture), "fixture includes safe_error_examples for 401 and 403")
    validator.check(fixture_has_no_suspicious_keys(fixture), "fixture has no suspicious raw keys recursively")

    combined_text = combined_required_text()
    for marker_name, patterns in REQUIRED_MARKERS:
        validator.check(has_any_pattern(combined_text, patterns), f"docs/checklists contain marker: {marker_name}")

    matrix_text = read_existing_text("docs/m2_8b_prep_auth_role_reconciliation_kr.md")
    for endpoint in REQUIRED_ENDPOINTS:
        validator.check(endpoint in matrix_text, f"endpoint permission matrix mentions: {endpoint}")

    validator.check(server_is_not_wired(), "apps/api/src/server.js does not import cdc-recovery")
    validator.check(git_diff_is_empty("apps/api/src/auth.js"), "apps/api/src/auth.js has no working-tree diff")
    validator.check(package_has_script(PACKAGE_SCRIPT), f"package.json has script: {PACKAGE_SCRIPT}")

    return validator.summary()


if __name__ == "__main__":
    sys.exit(main())
