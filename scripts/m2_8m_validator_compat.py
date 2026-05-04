"""Compatibility helpers for validators after approved M2-8M OpenAPI merge."""

from __future__ import annotations

import re
import subprocess
from pathlib import Path


MAIN_OPENAPI = "sources/personal_project_openapi_v0_2.yaml"
OPENAPI_PATCH = "sources/openapi_m2_5_dlq_replay_patch.yaml"
PROPOSAL_MARKER = "PROPOSAL ONLY - DO NOT MERGE AUTOMATICALLY"

REQUIRED_ROUTES = [
    "/api/v1/cdc/failures:",
    "/api/v1/cdc/failures/{failure_id}:",
    "/api/v1/cdc/failures/{failure_id}/state-log:",
    "/api/v1/cdc/failures/{failure_id}/replay-requests:",
    "/api/v1/cdc/replay-requests:",
    "/api/v1/cdc/replay-requests/{replay_request_id}:",
    "/api/v1/cdc/replay-requests/{replay_request_id}/approve:",
    "/api/v1/cdc/replay-requests/{replay_request_id}/cancel:",
]

REQUIRED_SCHEMAS = [
    "CdcFailureSummary:",
    "CdcFailureDetail:",
    "CdcFailureStateLogEntry:",
    "CdcReplayRequestSummary:",
    "CdcReplayRequestDetail:",
    "CreateCdcReplayRequestRequest:",
    "CreateCdcReplayRequestResponse:",
    "ApproveCdcReplayRequestRequest:",
    "ApproveCdcReplayRequestResponse:",
    "CancelCdcReplayRequestRequest:",
    "CancelCdcReplayRequestResponse:",
    "CdcErrorResponse:",
]

REQUIRED_ERROR_CODES = [
    "validation_error",
    "unauthorized",
    "forbidden",
    "not_found",
    "idempotency_conflict",
    "invalid_state_transition",
    "internal_error",
]

FORBIDDEN_ADDED_PROPERTIES = {
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

RISKY_ADDED_TEXT = [
    "stack trace",
    "sql detail",
    "db url",
    "connection string",
    "persistence internal",
    "raw payload",
    "full message",
    "issue raw",
    "prod_change payload",
    "prod_change actor",
]


def git_diff_is_empty_or_approved_m2_8m(root: Path, relative_path: str) -> bool:
    if git_diff_is_empty(root, relative_path):
        return True
    if relative_path == MAIN_OPENAPI:
        return approved_m2_8m_openapi_merge_present(root)
    return False


def approved_m2_8m_openapi_merge_present(root: Path) -> bool:
    main_text = read_text(root, MAIN_OPENAPI)
    patch_text = read_text(root, OPENAPI_PATCH)
    if PROPOSAL_MARKER not in patch_text:
        return False
    if not all(route in main_text for route in REQUIRED_ROUTES):
        return False
    if not all(schema in main_text for schema in REQUIRED_SCHEMAS):
        return False
    if not all(code in main_text for code in REQUIRED_ERROR_CODES):
        return False
    return openapi_diff_is_limited_to_m2_8m(root)


def openapi_diff_is_limited_to_m2_8m(root: Path) -> bool:
    diff_text = git_diff(root, MAIN_OPENAPI)
    if not diff_text:
        return False

    for line in diff_text.splitlines():
        if line.startswith("---") or line.startswith("+++") or line.startswith("@@"):
            continue
        if line.startswith("-") and line[1:].strip():
            return False

    added_lines = [
        line[1:].rstrip()
        for line in diff_text.splitlines()
        if line.startswith("+") and not line.startswith("+++") and line[1:].strip()
    ]
    if not added_lines:
        return False

    for line in added_lines:
        stripped = line.strip()
        lowered = stripped.casefold()
        if re.match(r"/api/v1/(?!cdc/)", stripped):
            return False
        if is_forbidden_property_line(stripped):
            return False
        if any(phrase in lowered for phrase in RISKY_ADDED_TEXT):
            return False

    return True


def is_forbidden_property_line(line: str) -> bool:
    match = re.match(r"([A-Za-z0-9_]+):(?:\s|$)", line)
    if not match:
        return False
    key = match.group(1).casefold()
    if key not in FORBIDDEN_ADDED_PROPERTIES:
        return False
    return key != "query"


def git_diff(root: Path, relative_path: str) -> str:
    result = subprocess.run(
        ["git", "diff", "--", relative_path],
        cwd=root,
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
    )
    return result.stdout


def git_diff_is_empty(root: Path, relative_path: str) -> bool:
    result = subprocess.run(
        ["git", "diff", "--quiet", "--", relative_path],
        cwd=root,
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return result.returncode == 0


def read_text(root: Path, relative_path: str) -> str:
    path = root / relative_path
    return path.read_text(encoding="utf-8") if path.is_file() else ""
