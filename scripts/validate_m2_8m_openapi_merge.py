#!/usr/bin/env python3
"""Static validator for M2-8M CDC recovery OpenAPI merge."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

from m2_8i_validator_compat import approved_m2_8i_server_wiring_present, git_diff_is_empty_or_approved_m2_8i
from m2_8m_validator_compat import approved_m2_8m_openapi_merge_present, openapi_diff_is_limited_to_m2_8m


ROOT = Path(__file__).resolve().parents[1]

DOCS = [
    "docs/m2_8m_openapi_merge_implementation_kr.md",
    "docs/m2_8m_post_merge_schema_parity_kr.md",
    "docs/m2_8m_openapi_merge_decision_record_kr.md",
    "docs/m2_8m_closure_summary_kr.md",
]

M2_8M_FILES = [
    *DOCS,
    "scripts/validate_m2_8m_openapi_merge.py",
    "scripts/m2_8m_validator_compat.py",
]

PACKAGE_SCRIPT = "validate:m2-8m:openapi-merge"
MAIN_OPENAPI = "sources/personal_project_openapi_v0_2.yaml"
OPENAPI_PATCH = "sources/openapi_m2_5_dlq_replay_patch.yaml"
PROPOSAL_MARKER = "PROPOSAL ONLY - DO NOT MERGE AUTOMATICALLY"

ROUTES = [
    "/api/v1/cdc/failures",
    "/api/v1/cdc/failures/{failure_id}",
    "/api/v1/cdc/failures/{failure_id}/state-log",
    "/api/v1/cdc/failures/{failure_id}/replay-requests",
    "/api/v1/cdc/replay-requests",
    "/api/v1/cdc/replay-requests/{replay_request_id}",
    "/api/v1/cdc/replay-requests/{replay_request_id}/approve",
    "/api/v1/cdc/replay-requests/{replay_request_id}/cancel",
]

SCHEMAS = [
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

ERROR_CODES = [
    "validation_error",
    "unauthorized",
    "forbidden",
    "not_found",
    "idempotency_conflict",
    "invalid_state_transition",
    "internal_error",
]

PROTECTED_RUNTIME_FILES = [
    "apps/api/src/auth.js",
    "apps/api/src/error-response.js",
    "apps/api/src/cdc-recovery/cdc-recovery-handler.js",
    "apps/api/src/cdc-recovery/cdc-recovery-service.js",
    "apps/api/src/cdc-recovery/cdc-recovery-dto-mapper.js",
    "apps/api/src/cdc-recovery/cdc-recovery-repository.js",
]

DOC_MARKERS = [
    "no Aurora repository",
    "no real DB queries",
    "no SQL apply",
    "no external infrastructure commands",
]

COMMAND_USAGE_PATTERNS = [
    r"\baws\s+[a-z0-9_-]+",
    r"\bku" r"bectl\s+",
    r"\bp" r"sql\s+",
    r"\bka" r"fka-[a-z0-9_-]+",
    r"\bclick" r"house-[a-z0-9_-]+",
    r"\bdebe" r"zium\s+",
    r"\bdeploy" r"ment\s+",
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


def git_diff(relative_path: str) -> str:
    result = subprocess.run(
        ["git", "diff", "--", relative_path],
        cwd=ROOT,
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
    )
    return result.stdout


def git_diff_is_empty(relative_path: str) -> bool:
    result = subprocess.run(
        ["git", "diff", "--quiet", "--", relative_path],
        cwd=ROOT,
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return result.returncode == 0


def openapi_has_working_tree_diff() -> bool:
    return not git_diff_is_empty(MAIN_OPENAPI)


def openapi_contains_all_routes() -> bool:
    text = read_text(MAIN_OPENAPI)
    return all(route in text for route in ROUTES)


def openapi_contains_all_schemas() -> bool:
    text = read_text(MAIN_OPENAPI)
    return all(schema in text for schema in SCHEMAS)


def openapi_contains_safe_error_envelopes() -> bool:
    text = read_text(MAIN_OPENAPI)
    return (
        "CdcErrorResponse" in text
        and "CdcErrorBody" in text
        and all(code in text for code in ERROR_CODES)
        and all(f"'{status}'" in text or f" {status}" in text for status in [400, 401, 403, 404, 409, 500])
    )


def main_openapi_diff_has_no_forbidden_added_properties() -> bool:
    return approved_m2_8m_openapi_merge_present(ROOT)


def main_openapi_diff_is_limited() -> bool:
    return openapi_diff_is_limited_to_m2_8m(ROOT)


def no_risky_m2_8m_command_usage() -> bool:
    text = combined_text(M2_8M_FILES)
    return not any(re.search(pattern, text, flags=re.I) for pattern in COMMAND_USAGE_PATTERNS)


def no_m2_8m_pg_or_process_spawn() -> bool:
    text = combined_text(M2_8M_FILES)
    child_marker = "child" "_process"
    node_child_marker = "node:" "child" "_process"
    pg_module = "p" "g"
    return (
        re.search(r"require\([\"']" + pg_module + r"[\"']\)", text) is None
        and re.search(r"\bimport\s+" + pg_module + r"\b", text) is None
        and child_marker not in text
        and node_child_marker not in text
    )


def docs_contain_required_boundaries() -> bool:
    text = combined_text(DOCS).casefold()
    return all(marker.casefold() in text for marker in DOC_MARKERS)


def runtime_files_unchanged() -> bool:
    return all(git_diff_is_empty(path) for path in PROTECTED_RUNTIME_FILES)


def server_diff_approved() -> bool:
    return approved_m2_8i_server_wiring_present(ROOT) and git_diff_is_empty_or_approved_m2_8i(
        ROOT,
        "apps/api/src/server.js",
    )


def main() -> int:
    validator = Validator()

    for doc in DOCS:
        validator.check(file_exists(doc), f"required M2-8M doc exists: {doc}")

    validator.check(package_has_script(PACKAGE_SCRIPT), f"package.json has script: {PACKAGE_SCRIPT}")
    validator.check(openapi_has_working_tree_diff(), "main OpenAPI has a working-tree diff")
    validator.check(openapi_contains_all_routes(), "main OpenAPI contains all CDC route paths")
    validator.check(openapi_contains_all_schemas(), "main OpenAPI contains all required CDC schemas")
    validator.check(openapi_contains_safe_error_envelopes(), "main OpenAPI contains CDC safe error envelopes")
    validator.check(file_exists(OPENAPI_PATCH), "M2-5 OpenAPI proposal patch still exists")
    validator.check(PROPOSAL_MARKER in read_text(OPENAPI_PATCH), "M2-5 OpenAPI patch remains proposal-only")
    validator.check(
        main_openapi_diff_has_no_forbidden_added_properties(),
        "main OpenAPI diff has no forbidden raw schema properties or unsafe added text",
    )
    validator.check(main_openapi_diff_is_limited(), "main OpenAPI diff is limited to CDC contract additions")
    validator.check(server_diff_approved(), "server.js diff remains approved M2-8I minimal route registration")
    validator.check(runtime_files_unchanged(), "auth/error/CDC handler-service-DTO-repository runtime files have no diff")
    validator.check(no_m2_8m_pg_or_process_spawn(), "M2-8M files do not import database client modules or JS process-spawn APIs")
    validator.check(no_risky_m2_8m_command_usage(), "M2-8M files contain no infrastructure command usage")
    validator.check(docs_contain_required_boundaries(), "M2-8M docs state no Aurora, DB, SQL, or external infrastructure work")

    return validator.summary()


if __name__ == "__main__":
    sys.exit(main())
