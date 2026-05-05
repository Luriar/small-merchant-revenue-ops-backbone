#!/usr/bin/env python3
"""Static validator for the M2-5 DLQ / replay API contract."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]

REQUIRED_DOCS = [
    "docs/m2_5_dlq_replay_api_contract_kr.md",
    "docs/m2_5_idempotent_replay_request_rules_kr.md",
    "docs/m2_5_openapi_patch_proposal_kr.md",
]

OPENAPI_PATCH = "sources/openapi_m2_5_dlq_replay_patch.yaml"
OPENAPI_PROPOSAL_MARKER = "PROPOSAL ONLY - DO NOT MERGE AUTOMATICALLY"

REQUIRED_OPENAPI_SCHEMAS = [
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

REQUIRED_OPENAPI_ENDPOINTS = [
    "/api/v1/cdc/failures:",
    "/api/v1/cdc/failures/{failure_id}:",
    "/api/v1/cdc/failures/{failure_id}/state-log:",
    "/api/v1/cdc/failures/{failure_id}/replay-requests:",
    "/api/v1/cdc/replay-requests:",
    "/api/v1/cdc/replay-requests/{replay_request_id}:",
    "/api/v1/cdc/replay-requests/{replay_request_id}/approve:",
    "/api/v1/cdc/replay-requests/{replay_request_id}/cancel:",
]

REQUIRED_FIXTURES = {
    "fixtures/m2_5_api/cdc_failure_list_response.json": {
        "items",
        "failure_id",
        "status",
        "evidence_report_ref",
    },
    "fixtures/m2_5_api/cdc_failure_detail_response.json": {
        "failure_id",
        "status",
        "evidence_report_ref",
    },
    "fixtures/m2_5_api/create_replay_request_request.json": {
        "failure_id",
        "idempotency_key",
        "status_or_requested_action",
        "evidence_report_ref",
    },
    "fixtures/m2_5_api/create_replay_request_response.json": {
        "failure_id",
        "replay_request_id",
        "idempotency_key",
        "status",
        "evidence_report_ref",
    },
    "fixtures/m2_5_api/approve_replay_request_response.json": {
        "failure_id",
        "replay_request_id",
        "status",
        "evidence_report_ref",
    },
    "fixtures/m2_5_api/cancel_replay_request_response.json": {
        "failure_id",
        "replay_request_id",
        "status",
        "evidence_report_ref",
    },
}

REQUIRED_OPS_FILES = [
    "ops/m2_5_dlq_replay_api/README.md",
    "ops/m2_5_dlq_replay_api/templates/replay_api_request_review_template.md",
    "ops/m2_5_dlq_replay_api/templates/replay_api_response_review_template.md",
    "ops/m2_5_dlq_replay_api/checklists/api_safety_review_checklist.md",
    "ops/m2_5_dlq_replay_api/checklists/idempotency_review_checklist.md",
    "ops/m2_5_dlq_replay_api/checklists/approval_transition_checklist.md",
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
    "proposal only",
    "idempotency_key",
    "new_run_id",
    "new run row",
    "original failure",
    "raw payloads",
    "full message bodies",
    "forbidden field leakage",
    "evidence_report_ref",
    "409",
]

OPS_MARKERS = [
    "safe metadata only",
    "no raw payloads",
    "no full message bodies",
    "idempotency key",
    "new run row",
    "cleanup/evidence report linkage",
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


def contains_casefold(text: str, marker: str) -> bool:
    return marker.casefold() in text.casefold()


def suspicious_openapi_field_definitions(text: str) -> list[str]:
    found: list[str] = []
    properties_indent: int | None = None
    for line_number, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        indent = len(line) - len(line.lstrip(" "))
        if stripped == "properties:":
            properties_indent = indent
            continue
        if properties_indent is not None and indent <= properties_indent:
            properties_indent = None
        if properties_indent is None:
            continue
        if stripped.startswith("description:"):
            lowered = stripped.casefold()
            allowed = (
                "forbidden" in lowered
                or "do not include" in lowered
                or "must not include" in lowered
                or "safe" in lowered
            )
            if allowed:
                continue
        for term in sorted(SUSPICIOUS_KEYS):
            if re.match(rf"^{re.escape(term)}\s*:", stripped, flags=re.I):
                found.append(f"line {line_number}: {stripped}")
    return found


def fixture_required_keys_present(keys: set[str], required_keys: set[str]) -> bool:
    normalized = set(required_keys)
    status_or_action = "status_or_requested_action" in normalized
    normalized.discard("status_or_requested_action")
    if not normalized.issubset(keys):
        return False
    if status_or_action and not ({"status", "requested_action"} & keys):
        return False
    return True


def main() -> int:
    validator = Validator()

    for relative_path in REQUIRED_DOCS:
        validator.check(file_exists(relative_path), f"required doc exists: {relative_path}")

    validator.check(file_exists(OPENAPI_PATCH), f"OpenAPI patch proposal exists: {OPENAPI_PATCH}")
    if file_exists(OPENAPI_PATCH):
        openapi_text = read_text(OPENAPI_PATCH)
        validator.check(
            OPENAPI_PROPOSAL_MARKER in openapi_text,
            "OpenAPI patch contains proposal marker",
        )
        suspicious_defs = suspicious_openapi_field_definitions(openapi_text)
        validator.check(
            not suspicious_defs,
            "OpenAPI patch does not define suspicious raw field names",
        )
        for schema_name in REQUIRED_OPENAPI_SCHEMAS:
            validator.check(
                f"{schema_name}:" in openapi_text,
                f"OpenAPI patch defines schema: {schema_name}",
            )
        for endpoint in REQUIRED_OPENAPI_ENDPOINTS:
            validator.check(
                endpoint in openapi_text,
                f"OpenAPI patch defines endpoint: {endpoint}",
            )
        validator.check("'409':" in openapi_text, "OpenAPI patch includes 409 conflict behavior")
        validator.check(
            "'401':" in openapi_text and "'403':" in openapi_text,
            "OpenAPI patch includes 401/403 responses",
        )

    for relative_path, required_keys in REQUIRED_FIXTURES.items():
        validator.check(file_exists(relative_path), f"required API fixture exists: {relative_path}")
        value = load_json_object(relative_path) if file_exists(relative_path) else None
        validator.check(value is not None, f"API fixture is valid JSON object: {relative_path}")
        if value is None:
            continue

        keys = collect_keys(value)
        suspicious_keys = sorted(keys & SUSPICIOUS_KEYS)
        validator.check(
            not suspicious_keys,
            f"API fixture avoids suspicious raw keys recursively: {relative_path}",
        )
        validator.check(
            fixture_required_keys_present(keys, required_keys),
            f"API fixture includes required safe/idempotency fields: {relative_path}",
        )

    for relative_path in REQUIRED_OPS_FILES:
        validator.check(file_exists(relative_path), f"required ops file exists: {relative_path}")

    docs_text = "\n".join(read_text(path) for path in REQUIRED_DOCS if file_exists(path))
    for marker in DOC_MARKERS:
        validator.check(
            contains_casefold(docs_text, marker),
            f"M2-5 docs contain marker: {marker}",
        )

    ops_text = "\n".join(read_text(path) for path in REQUIRED_OPS_FILES if file_exists(path))
    for marker in OPS_MARKERS:
        validator.check(
            contains_casefold(ops_text, marker),
            f"M2-5 ops files contain marker: {marker}",
        )

    package_json = load_json_object("package.json") if file_exists("package.json") else None
    validator.check(package_json is not None, "package.json is valid JSON")
    if package_json:
        scripts = package_json.get("scripts", {})
        validator.check(
            scripts.get("validate:m2-5:dlq-replay-api-contract")
            == "python3 scripts/validate_m2_5_dlq_replay_api_contract.py",
            "package.json includes validate:m2-5:dlq-replay-api-contract",
        )

    m2_4_doc = "docs/m2_4_dlq_safe_metadata_storage_design_kr.md"
    validator.check(file_exists(m2_4_doc), "M2-4 design doc exists")
    if file_exists(m2_4_doc):
        text = read_text(m2_4_doc)
        validator.check(
            contains_casefold(text, "M2-5")
            and contains_casefold(text, "API contract")
            and contains_casefold(text, "cdc_failure")
            and contains_casefold(text, "cdc_replay_request"),
            "M2-4 design doc references M2-5 API contract",
        )

    return validator.summary()


if __name__ == "__main__":
    sys.exit(main())
