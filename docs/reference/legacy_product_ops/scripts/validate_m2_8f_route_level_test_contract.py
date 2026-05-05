#!/usr/bin/env python3
"""Static validator for the M2-8F-Prep route-level integration test contract."""

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
from m2_8m_validator_compat import git_diff_is_empty_or_approved_m2_8m


ROOT = Path(__file__).resolve().parents[1]

REQUIRED_DOCS = [
    "docs/m2_8f_prep_route_level_integration_test_contract_kr.md",
    "docs/m2_8f_route_test_decision_record_kr.md",
]

REQUIRED_CHECKLISTS = [
    "ops/m2_8f_route_level_tests/checklists/route_test_scope_checklist.md",
    "ops/m2_8f_route_level_tests/checklists/stub_repository_test_checklist.md",
    "ops/m2_8f_route_level_tests/checklists/auth_error_dto_test_checklist.md",
]

REQUIRED_FILES = [
    *REQUIRED_DOCS,
    *REQUIRED_CHECKLISTS,
    "fixtures/m2_8f_route_tests/route_test_case_catalog.json",
]

REQUIRED_MARKERS = [
    ("not live route wiring", [r"not live route wiring", r"no live route wiring"]),
    ("server.js modification", [r"server\.js.+modification", r"no server\.js modification"]),
    ("auth.js modification", [r"auth\.js.+modification", r"no auth\.js modification"]),
    ("error-response.js modification", [r"error-response\.js.+modification", r"no error-response\.js modification"]),
    (
        "cdc-recovery runtime module modification",
        [r"cdc-recovery runtime module modification", r"no cdc-recovery runtime module modification"],
    ),
    ("no OpenAPI main merge", [r"no openapi main merge"]),
    ("SQL apply", [r"sql apply"]),
    ("external infrastructure commands", [r"external infrastructure commands"]),
    ("test-only harness", [r"test-only harness"]),
    ("in-memory/stub repository", [r"in-memory/stub repository"]),
    ("route-level integration tests", [r"route-level integration tests"]),
    ("auth missing safe 401", [r"auth missing safe 401"]),
    ("readonly_role", [r"readonly_role"]),
    ("operator", [r"operator"]),
    ("maintainer", [r"maintainer"]),
    ("system_worker", [r"system_worker"]),
    ("safe 400", [r"safe 400"]),
    ("safe 403", [r"safe 403"]),
    ("safe 404", [r"safe 404"]),
    ("safe 409", [r"safe 409"]),
    ("safe 500", [r"safe 500"]),
    ("DTO mapper safety", [r"dto mapper safety"]),
    ("schema parity", [r"schema parity"]),
    ("no raw payloads", [r"no raw payloads"]),
    ("no full message bodies", [r"no full message bodies"]),
    ("no issue raw values", [r"no issue raw values"]),
    ("no prod_change payload/actor values", [r"no prod_change payload/actor values"]),
    ("no stack traces", [r"no stack traces"]),
    ("no SQL details", [r"no sql details"]),
    ("no persistence internals", [r"no persistence internals"]),
]

REQUIRED_ROUTES = [
    "GET /api/v1/cdc/failures",
    "GET /api/v1/cdc/failures/{failure_id}",
    "GET /api/v1/cdc/failures/{failure_id}/state-log",
    "POST /api/v1/cdc/failures/{failure_id}/replay-requests",
    "GET /api/v1/cdc/replay-requests",
    "GET /api/v1/cdc/replay-requests/{replay_request_id}",
    "POST /api/v1/cdc/replay-requests/{replay_request_id}/approve",
    "POST /api/v1/cdc/replay-requests/{replay_request_id}/cancel",
]

REQUIRED_EXAMPLES = [
    "auth_missing_401",
    "readonly_read_success",
    "readonly_mutation_403",
    "operator_create_success",
    "operator_approve_forbidden_403",
    "maintainer_approve_success",
    "system_worker_create_forbidden_403",
    "failure_list_success",
    "failure_detail_not_found_404",
    "state_log_success",
    "create_validation_error_400",
    "create_success_201",
    "idempotent_duplicate_200",
    "idempotency_conflict_409",
    "approve_invalid_state_409",
    "cancel_invalid_state_409",
    "internal_error_500",
    "success_no_raw_field_regression",
    "error_no_raw_field_regression",
    "schema_parity_check",
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
    "persistence_error",
    "raw_record",
    "compared_body",
    "compared_payload",
}

PACKAGE_SCRIPT = "validate:m2-8f-prep:route-tests"
OPENAPI_PATCH = "sources/openapi_m2_5_dlq_replay_patch.yaml"
MAIN_OPENAPI = "sources/personal_project_openapi_v0_2.yaml"
PROPOSAL_MARKER = "PROPOSAL ONLY - DO NOT MERGE AUTOMATICALLY"


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


def fixture_has_required_examples(fixture: dict[str, Any] | None) -> bool:
    if fixture is None:
        return False
    examples = fixture.get("examples")
    return isinstance(examples, dict) and all(example in examples for example in REQUIRED_EXAMPLES)


def fixture_has_no_suspicious_keys(fixture: dict[str, Any] | None) -> bool:
    if fixture is None:
        return False
    normalized_keys = {key.casefold() for key in collect_keys(fixture)}
    return not (normalized_keys & SUSPICIOUS_KEYS)


def git_diff_is_empty(relative_path: str) -> bool:
    return (
        git_diff_is_empty_or_approved_m2_8i(ROOT, relative_path)
        or git_diff_is_empty_or_approved_m2_8m(ROOT, relative_path)
    )


def no_untracked_openapi_merge_artifact() -> bool:
    result = subprocess.run(
        ["git", "ls-files", "--others", "--exclude-standard"],
        cwd=ROOT,
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
    )
    if result.returncode != 0:
        return False
    allowed_prefixes = (
        "docs/",
        "fixtures/",
        "ops/",
        "scripts/",
    )
    for line in result.stdout.splitlines():
        if not line:
            continue
        if line == OPENAPI_PATCH:
            continue
        if line.startswith(allowed_prefixes):
            continue
        if re.search(r"openapi.*\.(ya?ml|json)$", line, flags=re.I):
            return False
    return True


def server_does_not_import_cdc_recovery() -> bool:
    return server_has_no_cdc_recovery_or_approved_m2_8i(ROOT)


def main() -> int:
    validator = Validator()

    for relative_path in REQUIRED_DOCS:
        validator.check(file_exists(relative_path), f"required doc exists: {relative_path}")

    for relative_path in REQUIRED_CHECKLISTS:
        validator.check(file_exists(relative_path), f"required checklist exists: {relative_path}")

    validator.check(file_exists("fixtures/m2_8f_route_tests/route_test_case_catalog.json"), "route test fixture exists")
    fixture = load_json_object("fixtures/m2_8f_route_tests/route_test_case_catalog.json")
    validator.check(fixture is not None, "route test fixture is valid JSON object")
    validator.check(fixture_has_required_examples(fixture), "fixture includes all required test case names")
    validator.check(fixture_has_no_suspicious_keys(fixture), "fixture has no suspicious raw keys recursively")

    combined_text = combined_required_text()
    for marker_name, patterns in REQUIRED_MARKERS:
        validator.check(has_any_pattern(combined_text, patterns), f"docs/checklists contain marker: {marker_name}")

    contract_text = read_existing_text("docs/m2_8f_prep_route_level_integration_test_contract_kr.md")
    for route in REQUIRED_ROUTES:
        validator.check(route in contract_text, f"route-level test case matrix mentions: {route}")

    patch_text = read_existing_text(OPENAPI_PATCH)
    validator.check(PROPOSAL_MARKER in patch_text, "M2-5 OpenAPI patch retains proposal-only marker")
    validator.check(git_diff_is_empty(MAIN_OPENAPI), "main OpenAPI file has no working-tree diff")
    validator.check(git_diff_is_empty(OPENAPI_PATCH), "M2-5 OpenAPI patch file has no working-tree diff")
    validator.check(no_untracked_openapi_merge_artifact(), "no new merged OpenAPI artifact is untracked")
    validator.check(server_does_not_import_cdc_recovery(), "apps/api/src/server.js does not import cdc-recovery")

    for runtime_path in [
        "apps/api/src/server.js",
        "apps/api/src/auth.js",
        "apps/api/src/error-response.js",
        "apps/api/src/cdc-recovery/cdc-recovery-handler.js",
        "apps/api/src/cdc-recovery/cdc-recovery-service.js",
        "apps/api/src/cdc-recovery/cdc-recovery-dto-mapper.js",
        "apps/api/src/cdc-recovery/cdc-recovery-repository.js",
    ]:
        validator.check(git_diff_is_empty(runtime_path), f"{runtime_path} has no working-tree diff")

    validator.check(package_has_script(PACKAGE_SCRIPT), f"package.json has script: {PACKAGE_SCRIPT}")

    return validator.summary()


if __name__ == "__main__":
    sys.exit(main())
