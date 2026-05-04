#!/usr/bin/env python3
"""Static validator for M2-8J OpenAPI merge readiness evidence."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

from m2_8i_validator_compat import approved_m2_8i_server_wiring_present, git_diff_is_empty_or_approved_m2_8i
from m2_8m_validator_compat import git_diff_is_empty_or_approved_m2_8m


ROOT = Path(__file__).resolve().parents[1]

REQUIRED_DOCS = [
    "docs/m2_8j_openapi_merge_readiness_review_kr.md",
    "docs/m2_8j_schema_parity_evidence_kr.md",
    "docs/m2_8j_openapi_merge_decision_record_kr.md",
    "docs/m2_8j_next_merge_prompt_kr.md",
]

REQUIRED_CHECKLISTS = [
    "ops/m2_8j_openapi_merge_readiness/checklists/schema_parity_review_checklist.md",
    "ops/m2_8j_openapi_merge_readiness/checklists/error_auth_parity_checklist.md",
    "ops/m2_8j_openapi_merge_readiness/checklists/openapi_merge_gate_checklist.md",
]

FIXTURE = "fixtures/m2_8j_openapi/schema_parity_evidence_examples.json"
PACKAGE_SCRIPT = "validate:m2-8j:openapi-readiness"
OPENAPI_PATCH = "sources/openapi_m2_5_dlq_replay_patch.yaml"
MAIN_OPENAPI = "sources/personal_project_openapi_v0_2.yaml"
PROPOSAL_MARKER = "PROPOSAL ONLY - DO NOT MERGE AUTOMATICALLY"

M2_8J_FILES = [
    *REQUIRED_DOCS,
    *REQUIRED_CHECKLISTS,
    FIXTURE,
]

REQUIRED_MARKERS = [
    ("M2-8I", r"m2-8i"),
    ("OpenAPI merge readiness", r"openapi merge readiness"),
    ("no main OpenAPI merge", r"no main openapi merge"),
    ("proposal-only", r"proposal-only|proposal only"),
    ("schema parity", r"schema parity"),
    ("DTO mapper parity", r"dto mapper parity"),
    ("error envelope parity", r"error envelope parity"),
    ("auth/role documentation parity", r"auth/role documentation parity"),
    ("versioning/changelog", r"versioning/changelog"),
    ("API contract owner", r"api contract owner"),
    ("safety reviewer", r"safety reviewer"),
    ("final merge approver", r"final merge approver"),
    ("mutation route stricter review", r"mutation route stricter review"),
    ("future OpenAPI merge", r"future openapi merge"),
    ("no Aurora repository", r"no aurora repository"),
    ("no real DB queries", r"no real db queries"),
    ("no SQL apply", r"no sql apply"),
    ("no external infrastructure commands", r"no external infrastructure commands"),
    ("no raw payloads", r"no raw payloads"),
    ("no full message bodies", r"no full message bodies"),
    ("no issue raw values", r"no issue raw values"),
    ("no prod_change payload/actor values", r"no prod_change payload/actor values"),
    ("no stack traces", r"no stack traces"),
    ("no SQL details", r"no sql details"),
    ("no persistence internals", r"no persistence internals"),
]

REQUIRED_SCHEMAS = [
    "CdcFailureSummary",
    "CdcFailureDetail",
    "CdcFailureStateLogEntry",
    "CdcReplayRequestSummary",
    "CdcReplayRequestDetail",
    "CreateCdcReplayRequestRequest",
    "CreateCdcReplayRequestResponse",
    "ApproveCdcReplayRequestRequest",
    "ApproveCdcReplayRequestResponse",
    "CancelCdcReplayRequestRequest",
    "CancelCdcReplayRequestResponse",
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
    "route_to_proposal_coverage",
    "schema_to_dto_parity",
    "request_schema_parity",
    "response_schema_parity",
    "error_schema_parity",
    "auth_role_documentation_parity",
    "merge_gate_status",
    "future_merge_decision",
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
    r"\bimport\s+pg\b",
    r"require\([\"']node:child_process[\"']\)",
    r"\bchild_process\b",
    r"\bexec\s*\(",
    r"\bspawn\s*\(",
]

PROTECTED_FILES = [
    MAIN_OPENAPI,
    "apps/api/src/auth.js",
    "apps/api/src/error-response.js",
    "apps/api/src/cdc-recovery/cdc-recovery-handler.js",
    "apps/api/src/cdc-recovery/cdc-recovery-service.js",
    "apps/api/src/cdc-recovery/cdc-recovery-dto-mapper.js",
    "apps/api/src/cdc-recovery/cdc-recovery-repository.js",
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
    path = path_for(relative_path)
    return path.read_text(encoding="utf-8") if path.is_file() else ""


def combined_text(paths: list[str]) -> str:
    return "\n".join(read_text(path) for path in paths)


def package_has_script(script_name: str) -> bool:
    try:
        package = json.loads(read_text("package.json"))
    except json.JSONDecodeError:
        return False
    scripts = package.get("scripts")
    return isinstance(scripts, dict) and script_name in scripts


def load_json_object(relative_path: str) -> dict[str, Any] | None:
    try:
        value = json.loads(read_text(relative_path))
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


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


def has_marker(text: str, pattern: str) -> bool:
    return re.search(pattern, text, flags=re.I) is not None


def has_no_risky_usage() -> bool:
    text = combined_text(M2_8J_FILES)
    if any(re.search(pattern, text, flags=re.I) for pattern in RISKY_CODE_PATTERNS):
        return False
    command_phrases = [
        "aws ",
        "kubectl ",
        "psql ",
        "clickhouse-client",
        "kafka-console",
        "debezium command",
        "sql apply command",
        "aurora connection command",
    ]
    lowered = text.casefold()
    return not any(phrase in lowered for phrase in command_phrases)


def git_diff_is_empty(relative_path: str) -> bool:
    return (
        git_diff_is_empty_or_approved_m2_8i(ROOT, relative_path)
        or git_diff_is_empty_or_approved_m2_8m(ROOT, relative_path)
    )


def main() -> int:
    validator = Validator()

    for relative_path in REQUIRED_DOCS:
        validator.check(file_exists(relative_path), f"required M2-8J doc exists: {relative_path}")

    for relative_path in REQUIRED_CHECKLISTS:
        validator.check(file_exists(relative_path), f"required M2-8J checklist exists: {relative_path}")

    validator.check(file_exists(FIXTURE), "schema parity fixture exists")
    fixture = load_json_object(FIXTURE)
    validator.check(fixture is not None, "schema parity fixture is valid JSON object")
    validator.check(fixture_has_required_examples(fixture), "fixture includes all required safe example entries")
    validator.check(fixture_has_no_suspicious_keys(fixture), "fixture has no suspicious raw keys recursively")

    validator.check(package_has_script(PACKAGE_SCRIPT), f"package.json has script: {PACKAGE_SCRIPT}")

    text = combined_text([*REQUIRED_DOCS, *REQUIRED_CHECKLISTS]).casefold()
    for marker_name, pattern in REQUIRED_MARKERS:
        validator.check(has_marker(text, pattern), f"docs/checklists contain marker: {marker_name}")

    parity_text = read_text("docs/m2_8j_schema_parity_evidence_kr.md")
    for schema_name in REQUIRED_SCHEMAS:
        validator.check(schema_name in parity_text, f"schema parity doc mentions: {schema_name}")

    review_text = read_text("docs/m2_8j_openapi_merge_readiness_review_kr.md")
    for route in REQUIRED_ROUTES:
        validator.check(route in review_text, f"readiness review mentions route: {route}")

    validator.check(PROPOSAL_MARKER in read_text(OPENAPI_PATCH), "M2-5 OpenAPI patch remains proposal-only")
    validator.check(git_diff_is_empty(MAIN_OPENAPI), "main OpenAPI file has no working-tree diff")
    validator.check(has_no_risky_usage(), "M2-8J files have no DB/infrastructure command usage")
    validator.check("require(\"pg\")" not in combined_text(M2_8J_FILES), "M2-8J files do not import pg")
    validator.check("child_process" not in combined_text(M2_8J_FILES), "M2-8J files do not use child_process")
    validator.check(approved_m2_8i_server_wiring_present(ROOT), "server.js diff remains approved M2-8I route factory registration")

    for relative_path in PROTECTED_FILES:
        validator.check(
            git_diff_is_empty(relative_path),
            f"{relative_path} has no working-tree diff",
        )

    return validator.summary()


if __name__ == "__main__":
    sys.exit(main())
