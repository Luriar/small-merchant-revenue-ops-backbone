#!/usr/bin/env python3
"""Static validator for the M2-6 DLQ/replay handler repository contract."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]

REQUIRED_DOCS = [
    "docs/m2_6_dlq_replay_handler_repository_contract_kr.md",
    "docs/m2_6_service_flow_sequence_kr.md",
]

REQUIRED_CONTRACTS = [
    "apps/api/src/cdc-recovery/cdc-recovery-repository.contract.md",
    "apps/api/src/cdc-recovery/cdc-recovery-service.contract.md",
    "apps/api/src/cdc-recovery/cdc-recovery-handler.contract.md",
    "apps/api/src/cdc-recovery/cdc-recovery-dto-mapper.contract.md",
]

REQUIRED_OPS_FILES = [
    "ops/m2_6_dlq_replay_handler_design/README.md",
    "ops/m2_6_dlq_replay_handler_design/checklists/handler_safety_review_checklist.md",
    "ops/m2_6_dlq_replay_handler_design/checklists/repository_contract_review_checklist.md",
    "ops/m2_6_dlq_replay_handler_design/checklists/idempotency_transition_review_checklist.md",
    "ops/m2_6_dlq_replay_handler_design/templates/service_decision_record_template.md",
    "ops/m2_6_dlq_replay_handler_design/templates/error_mapping_review_template.md",
]

REQUIRED_FIXTURES = [
    "fixtures/m2_6_service/create_replay_request_service_result.json",
    "fixtures/m2_6_service/idempotent_duplicate_service_result.json",
    "fixtures/m2_6_service/idempotency_conflict_error.json",
    "fixtures/m2_6_service/approve_replay_request_service_result.json",
    "fixtures/m2_6_service/cancel_replay_request_service_result.json",
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

DOC_MARKERS = [
    "not production rollout",
    "proposal-only",
    "handler responsibilities",
    "service responsibilities",
    "repository responsibilities",
    "DTO mapper",
    "idempotency_key",
    "new_run_id",
    "new run row",
    "original failure",
    "original run",
    "409",
    "no raw payloads",
    "no full message bodies",
    "forbidden field leakage",
    "evidence_report_ref",
]

REPOSITORY_METHODS = [
    "listFailures(filter, page)",
    "getFailureById(failureId)",
    "listFailureStateLog(failureId, page)",
    "listReplayRequests(filter, page)",
    "getReplayRequestById(replayRequestId)",
    "findReplayRequestByIdempotencyKey(idempotencyKey)",
    "createReplayRequest(input)",
    "appendFailureStateLog(input)",
    "updateFailureStatus(failureId, transition)",
    "updateReplayRequestStatus(replayRequestId, transition)",
    "linkNewRunId(replayRequestId, newRunId)",
]

SERVICE_METHODS = [
    "validateCreateReplayRequest(input)",
    "createReplayRequest(failureId, input, actor)",
    "approveReplayRequest(replayRequestId, input, actor)",
    "cancelReplayRequest(replayRequestId, input, actor)",
    "enforceIdempotency(input)",
    "enforceStateTransition(currentStatus, action)",
    "buildSafeFailureDto(record)",
    "buildSafeReplayRequestDto(record)",
]

M2_5_ENDPOINTS = [
    "GET /api/v1/cdc/failures",
    "GET /api/v1/cdc/failures/{failure_id}",
    "GET /api/v1/cdc/failures/{failure_id}/state-log",
    "POST /api/v1/cdc/failures/{failure_id}/replay-requests",
    "GET /api/v1/cdc/replay-requests",
    "GET /api/v1/cdc/replay-requests/{replay_request_id}",
    "POST /api/v1/cdc/replay-requests/{replay_request_id}/approve",
    "POST /api/v1/cdc/replay-requests/{replay_request_id}/cancel",
]

PACKAGE_SCRIPT = "validate:m2-6:handler-repository-contract"

ALLOWED_SUSPICIOUS_CONTEXT = [
    "forbidden",
    "do-not-record",
    "do not",
    "must not",
    "no raw",
    "no full",
    "no issue",
    "no prod_change",
    "no secret",
    "endpoint:",
    "endpoint examples",
    "endpoint to",
    "strip",
    "stripping",
    "exclude",
    "redact",
    "leakage",
    "prevent",
    "not returned",
    "not include",
    "not be serialized",
    "call-site identity",
    "secret-like",
    "suspicious_keys",
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


def contains_casefold(text: str, marker: str) -> bool:
    return marker.casefold() in text.casefold()


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


def load_json_object(relative_path: str) -> dict[str, Any] | None:
    try:
        value = json.loads(read_text(relative_path))
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


def suspicious_fixture_keys(value: Any) -> list[str]:
    return sorted(collect_keys(value) & SUSPICIOUS_KEYS)


def suspicious_unapproved_lines(relative_path: str, text: str) -> list[str]:
    findings: list[str] = []
    for line_number, line in enumerate(text.splitlines(), start=1):
        lowered = line.casefold()
        matching_terms = [
            term
            for term in SUSPICIOUS_KEYS
            if re.search(rf"(?<![A-Za-z0-9_]){re.escape(term)}(?![A-Za-z0-9_])", lowered)
        ]
        if not matching_terms:
            continue
        if any(marker in lowered for marker in ALLOWED_SUSPICIOUS_CONTEXT):
            continue
        stripped = lowered.strip()
        if any(stripped in {f"- `{term}`", f"- {term}", f"`{term}`", term} for term in matching_terms):
            continue
        if re.search(r"\b(actor)\b", lowered) and "call-site identity" in lowered:
            continue
        findings.append(f"{relative_path}:{line_number}: {line.strip()}")
    return findings


def package_has_script() -> bool:
    package = load_json_object("package.json")
    if package is None:
        return False
    scripts = package.get("scripts")
    return isinstance(scripts, dict) and PACKAGE_SCRIPT in scripts


def main() -> int:
    validator = Validator()

    for relative_path in REQUIRED_DOCS:
        validator.check(file_exists(relative_path), f"required doc exists: {relative_path}")

    for relative_path in REQUIRED_CONTRACTS:
        validator.check(file_exists(relative_path), f"contract file exists: {relative_path}")

    for relative_path in REQUIRED_OPS_FILES:
        validator.check(file_exists(relative_path), f"required ops file exists: {relative_path}")

    for relative_path in REQUIRED_FIXTURES:
        exists = file_exists(relative_path)
        validator.check(exists, f"required fixture exists: {relative_path}")
        if not exists:
            continue
        fixture = load_json_object(relative_path)
        validator.check(fixture is not None, f"fixture is valid JSON object: {relative_path}")
        if fixture is None:
            continue
        bad_keys = suspicious_fixture_keys(fixture)
        validator.check(
            not bad_keys,
            f"fixture has no suspicious raw keys recursively: {relative_path}",
        )
        required_keys = {"failure_id", "status", "evidence_report_ref"}
        if "conflict" not in relative_path:
            required_keys.add("replay_request_id")
        if "idempotent" in relative_path or "create" in relative_path or "conflict" in relative_path:
            required_keys.add("idempotency_key")
        validator.check(
            required_keys.issubset(collect_keys(fixture)),
            f"fixture includes required service result keys: {relative_path}",
        )
        if "conflict" in relative_path:
            validator.check(
                fixture.get("http_status") == 409 or fixture.get("code") == 409,
                "conflict fixture includes 409 status or code",
            )

    combined_docs = "\n".join(
        read_text(path)
        for path in [*REQUIRED_DOCS, *REQUIRED_CONTRACTS]
        if file_exists(path)
    )
    for marker in DOC_MARKERS:
        validator.check(
            contains_casefold(combined_docs, marker),
            f"docs/contracts contain marker: {marker}",
        )

    repository_text = read_text("apps/api/src/cdc-recovery/cdc-recovery-repository.contract.md")
    for method in REPOSITORY_METHODS:
        validator.check(method in repository_text, f"repository contract lists method: {method}")

    service_text = read_text("apps/api/src/cdc-recovery/cdc-recovery-service.contract.md")
    for method in SERVICE_METHODS:
        validator.check(method in service_text, f"service contract lists method: {method}")

    handler_text = read_text("apps/api/src/cdc-recovery/cdc-recovery-handler.contract.md")
    for endpoint in M2_5_ENDPOINTS:
        validator.check(endpoint in handler_text, f"handler contract mentions endpoint: {endpoint}")

    dto_text = read_text("apps/api/src/cdc-recovery/cdc-recovery-dto-mapper.contract.md")
    validator.check(
        "Forbidden response fields" in dto_text,
        "DTO mapper contract mentions forbidden response fields",
    )
    for term in SUSPICIOUS_KEYS:
        validator.check(term in dto_text, f"DTO mapper contract lists forbidden field: {term}")

    for relative_path in [*REQUIRED_DOCS, *REQUIRED_CONTRACTS, *REQUIRED_OPS_FILES]:
        if not file_exists(relative_path):
            continue
        findings = suspicious_unapproved_lines(relative_path, read_text(relative_path))
        validator.check(
            not findings,
            f"suspicious terms only appear in explicit prevention context: {relative_path}",
        )
        for finding in findings:
            print(f"  finding: {finding}")

    validator.check(package_has_script(), f"package.json has script: {PACKAGE_SCRIPT}")

    return validator.summary()


if __name__ == "__main__":
    sys.exit(main())
