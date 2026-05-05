#!/usr/bin/env python3
"""Static validator for the M2-7 non-wired CDC recovery skeleton."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

from m2_8i_validator_compat import server_has_no_cdc_recovery_or_approved_m2_8i


ROOT = Path(__file__).resolve().parents[1]

SKELETON_FILES = [
    "apps/api/src/cdc-recovery/cdc-recovery-errors.js",
    "apps/api/src/cdc-recovery/cdc-recovery-dto-mapper.js",
    "apps/api/src/cdc-recovery/cdc-recovery-service.js",
    "apps/api/src/cdc-recovery/cdc-recovery-repository.js",
    "apps/api/src/cdc-recovery/cdc-recovery-handler.js",
    "apps/api/src/cdc-recovery/index.js",
]

TEST_FILES = [
    "apps/api/src/cdc-recovery/cdc-recovery-dto-mapper.test.js",
    "apps/api/src/cdc-recovery/cdc-recovery-service.test.js",
]

REQUIRED_DOCS = [
    "docs/m2_7_non_wired_skeleton_implementation_kr.md",
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

EXTERNAL_INFRA_PATTERNS = [
    r"require\([\"']pg[\"']\)",
    r"require\([\"']node:fs[\"']\)",
    r"require\([\"']fs[\"']\)",
    r"aws",
    r"kafka",
    r"clickhouse",
    r"debezium",
    r"psql",
    r"kubectl",
    r"clickhouse-client",
    r"kafka-console-consumer",
    r"createConnection",
    r"fetch\(",
]

PACKAGE_SCRIPTS = [
    "validate:m2-7:skeleton-contract",
    "test:m2-7:cdc-recovery",
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


def read_text(relative_path: str) -> str:
    return path_for(relative_path).read_text(encoding="utf-8")


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


def has_external_infra_reference(text: str) -> list[str]:
    findings: list[str] = []
    for pattern in EXTERNAL_INFRA_PATTERNS:
      if re.search(pattern, text, flags=re.I):
          findings.append(pattern)
    return findings


def server_is_not_wired() -> bool:
    if server_has_no_cdc_recovery_or_approved_m2_8i(ROOT):
        return True
    text = read_text("apps/api/src/server.js")
    return "cdc-recovery" not in text and "/api/v1/cdc/failures" not in text


def fixture_has_no_suspicious_keys(relative_path: str) -> bool:
    fixture = load_json_object(relative_path)
    if fixture is None:
        return False
    return not (collect_keys(fixture) & SUSPICIOUS_KEYS)


def expected_outputs_do_not_assert_suspicious_keys(text: str) -> bool:
    for line in text.splitlines():
        lowered = line.casefold()
        if "assert" not in lowered:
            continue
        if any(re.search(rf"(?<![A-Za-z0-9_]){re.escape(term)}(?![A-Za-z0-9_])", lowered) for term in SUSPICIOUS_KEYS):
            return False
    return True


def main() -> int:
    validator = Validator()

    for relative_path in SKELETON_FILES:
        validator.check(file_exists(relative_path), f"skeleton file exists: {relative_path}")

    for relative_path in TEST_FILES:
        validator.check(file_exists(relative_path), f"targeted test file exists: {relative_path}")

    for relative_path in REQUIRED_DOCS:
        validator.check(file_exists(relative_path), f"required doc exists: {relative_path}")

    validator.check(server_is_not_wired(), "server.js does not import or register cdc-recovery routes")

    for relative_path in SKELETON_FILES:
        if not file_exists(relative_path):
            continue
        findings = has_external_infra_reference(read_text(relative_path))
        validator.check(
            not findings,
            f"skeleton has no external infra clients or commands: {relative_path}",
        )
        for finding in findings:
            print(f"  finding: {relative_path}: {finding}")

    mapper_text = read_text("apps/api/src/cdc-recovery/cdc-recovery-dto-mapper.js")
    validator.check("FORBIDDEN_RESPONSE_FIELDS" in mapper_text, "mapper defines forbidden-key constants")
    validator.check("stripForbiddenFields" in mapper_text, "mapper defines forbidden-key stripping")
    validator.check("containsForbiddenKeys" in mapper_text, "mapper defines recursive forbidden-key detection")

    service_text = read_text("apps/api/src/cdc-recovery/cdc-recovery-service.js")
    validator.check("enforceIdempotency" in service_text, "service defines idempotency helper")
    validator.check("enforceStateTransition" in service_text, "service defines state-transition helper")
    validator.check("validateCreateReplayRequest" in service_text, "service defines validation helper")

    handler_text = read_text("apps/api/src/cdc-recovery/cdc-recovery-handler.js")
    validator.check("createCdcRecoveryHandler" in handler_text, "handler defines factory")
    validator.check("listen(" not in handler_text, "handler is non-wired and does not listen")
    validator.check("createServer" not in handler_text, "handler does not create server")

    for script_name in PACKAGE_SCRIPTS:
        validator.check(package_has_script(script_name), f"package.json has script: {script_name}")

    for fixture_path in [
        "fixtures/m2_6_service/create_replay_request_service_result.json",
        "fixtures/m2_6_service/idempotent_duplicate_service_result.json",
        "fixtures/m2_6_service/idempotency_conflict_error.json",
        "fixtures/m2_6_service/approve_replay_request_service_result.json",
        "fixtures/m2_6_service/cancel_replay_request_service_result.json",
    ]:
        validator.check(
            fixture_has_no_suspicious_keys(fixture_path),
            f"fixture does not emit suspicious raw keys: {fixture_path}",
        )

    for test_path in TEST_FILES:
        validator.check(
            expected_outputs_do_not_assert_suspicious_keys(read_text(test_path)),
            f"test expected outputs do not assert suspicious raw keys: {test_path}",
        )

    return validator.summary()


if __name__ == "__main__":
    sys.exit(main())
