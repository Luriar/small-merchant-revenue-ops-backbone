#!/usr/bin/env python3
"""Static validator for the M2-8B test-only CDC recovery route harness."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

from m2_8i_validator_compat import (
    git_diff_is_empty_or_approved_m2_8i,
    server_has_no_cdc_recovery_or_approved_m2_8i,
)
from m2_8m_validator_compat import git_diff_is_empty_or_approved_m2_8m


ROOT = Path(__file__).resolve().parents[1]

TEST_SUPPORT_FILES = [
    "apps/api/src/cdc-recovery/test-support/cdc-recovery-test-harness.js",
    "apps/api/src/cdc-recovery/test-support/cdc-recovery-stub-repository.js",
    "apps/api/src/cdc-recovery/test-support/cdc-recovery-test-error-adapter.js",
    "apps/api/src/cdc-recovery/test-support/cdc-recovery-test-auth.js",
]

REQUIRED_FILES = [
    *TEST_SUPPORT_FILES,
    "apps/api/src/cdc-recovery/cdc-recovery-route-level.test.js",
    "docs/m2_8b_test_only_harness_implementation_kr.md",
]

NEW_M2_8B_FILES = [
    *REQUIRED_FILES,
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

ROUTE_PATTERNS = [
    r"/api/v1/cdc/failures",
    r"/api/v1/cdc/failures/[^/]+",
    r"/api/v1/cdc/failures/[^/]+/state-log",
    r"/api/v1/cdc/failures/[^/]+/replay-requests",
    r"/api/v1/cdc/replay-requests",
    r"/api/v1/cdc/replay-requests/[^/]+",
    r"/api/v1/cdc/replay-requests/[^/]+/approve",
    r"/api/v1/cdc/replay-requests/[^/]+/cancel",
]

REQUIRED_MARKERS = [
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

RISKY_CODE_PATTERNS = [
    r"require\([\"']pg[\"']\)",
    r"require\([\"']node:http[\"']\)",
    r"require\([\"']node:https[\"']\)",
    r"require\([\"']node:net[\"']\)",
    r"require\([\"']node:child_process[\"']\)",
    r"\bfetch\s*\(",
    r"\bserver\.js\b",
    r"\bpsql\b",
    r"\bkubectl\b",
    r"\bclickhouse\b",
    r"\bdebezium\b",
    r"\bkafka\b",
    r"\baws\b",
    r"\baurora connection\b",
]

PACKAGE_SCRIPTS = [
    "test:m2-8b:cdc-recovery-routes",
    "validate:m2-8b:test-only-harness",
]

OPENAPI_PATCH = "sources/openapi_m2_5_dlq_replay_patch.yaml"
MAIN_OPENAPI = "sources/personal_project_openapi_v0_2.yaml"
PROPOSAL_MARKER = "PROPOSAL ONLY - DO NOT MERGE AUTOMATICALLY"

PROTECTED_FILES = [
    "apps/api/src/server.js",
    "apps/api/src/auth.js",
    "apps/api/src/error-response.js",
    "apps/api/src/cdc-recovery/cdc-recovery-errors.js",
    "apps/api/src/cdc-recovery/cdc-recovery-handler.js",
    "apps/api/src/cdc-recovery/cdc-recovery-service.js",
    "apps/api/src/cdc-recovery/cdc-recovery-dto-mapper.js",
    "apps/api/src/cdc-recovery/cdc-recovery-repository.js",
    "apps/api/src/cdc-recovery/index.js",
    MAIN_OPENAPI,
]


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


def read_existing_text(relative_path: str) -> str:
    path = path_for(relative_path)
    return path.read_text(encoding="utf-8") if path.is_file() else ""


def combined_text(paths: list[str]) -> str:
    return "\n".join(read_existing_text(path) for path in paths)


def package_has_script(script_name: str) -> bool:
    try:
      package = json.loads(read_existing_text("package.json"))
    except json.JSONDecodeError:
      return False
    scripts = package.get("scripts")
    return isinstance(scripts, dict) and script_name in scripts


def git_diff_is_empty(relative_path: str) -> bool:
    return (
        git_diff_is_empty_or_approved_m2_8i(ROOT, relative_path)
        or git_diff_is_empty_or_approved_m2_8m(ROOT, relative_path)
    )


def has_any_pattern(text: str, patterns: list[str]) -> bool:
    return any(re.search(pattern, text, flags=re.I) for pattern in patterns)


def server_does_not_import_cdc_recovery() -> bool:
    return server_has_no_cdc_recovery_or_approved_m2_8i(ROOT)


def has_no_risky_code_usage() -> bool:
    code_text = combined_text([
        *TEST_SUPPORT_FILES,
        "apps/api/src/cdc-recovery/cdc-recovery-route-level.test.js",
    ])
    return not any(re.search(pattern, code_text, flags=re.I) for pattern in RISKY_CODE_PATTERNS)


def has_no_suspicious_object_keys() -> bool:
    code_text = combined_text([
        *TEST_SUPPORT_FILES,
        "apps/api/src/cdc-recovery/cdc-recovery-route-level.test.js",
    ])
    for key in SUSPICIOUS_KEYS:
        object_key_pattern = rf"(?:^|[{{,]\s*){re.escape(key)}\s*:"
        property_set_pattern = rf"\.{re.escape(key)}\s*="
        if re.search(object_key_pattern, code_text, flags=re.M) or re.search(property_set_pattern, code_text):
            return False
    return True


def tests_cover_all_routes(test_text: str) -> bool:
    if all(route in test_text for route in REQUIRED_ROUTES):
        return True
    return all(re.search(pattern, test_text) for pattern in ROUTE_PATTERNS)


def main() -> int:
    validator = Validator()

    for relative_path in TEST_SUPPORT_FILES:
        validator.check(file_exists(relative_path), f"test-only support file exists: {relative_path}")

    validator.check(
        file_exists("apps/api/src/cdc-recovery/cdc-recovery-route-level.test.js"),
        "cdc-recovery-route-level.test.js exists",
    )
    validator.check(
        file_exists("docs/m2_8b_test_only_harness_implementation_kr.md"),
        "M2-8B test-only harness doc exists",
    )

    for script_name in PACKAGE_SCRIPTS:
        validator.check(package_has_script(script_name), f"package.json has script: {script_name}")

    for relative_path in PROTECTED_FILES:
        validator.check(git_diff_is_empty(relative_path), f"{relative_path} has no working-tree diff")

    validator.check(server_does_not_import_cdc_recovery(), "server.js does not import cdc-recovery")
    validator.check(PROPOSAL_MARKER in read_existing_text(OPENAPI_PATCH), "M2-5 OpenAPI patch remains proposal-only")

    required_text = combined_text(NEW_M2_8B_FILES).casefold()
    validator.check("test-only harness" in required_text, "new M2-8B files mention test-only harness")
    validator.check("in-memory/stub repository" in required_text, "new M2-8B files mention in-memory/stub repository")
    validator.check("safe cdc error adapter" in required_text, "new M2-8B files mention safe CDC error adapter")

    test_text = read_existing_text("apps/api/src/cdc-recovery/cdc-recovery-route-level.test.js")
    validator.check(tests_cover_all_routes(test_text), "new M2-8B tests cover all M2-5 route strings")

    for marker_name, patterns in REQUIRED_MARKERS:
        validator.check(has_any_pattern(required_text, patterns), f"new M2-8B files include marker: {marker_name}")

    validator.check(has_no_risky_code_usage(), "new M2-8B code has no real DB/network/infrastructure usage")
    validator.check(has_no_suspicious_object_keys(), "new M2-8B test outputs do not use suspicious raw keys as object keys")

    return validator.summary()


if __name__ == "__main__":
    sys.exit(main())
