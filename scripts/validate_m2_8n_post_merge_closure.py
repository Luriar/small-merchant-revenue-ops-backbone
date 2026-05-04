#!/usr/bin/env python3
"""Validate M2-8N post-merge contract closure artifacts."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

DOCS = [
    "docs/m2_8n_post_merge_contract_closure_kr.md",
    "docs/m2_8n_aurora_repository_readiness_gate_kr.md",
    "docs/m2_8n_route_openapi_parity_regression_kr.md",
    "docs/m2_8n_safe_persistence_boundary_decision_record_kr.md",
]

PACKAGE_SCRIPT = "validate:m2-8n:post-merge-closure"
MAIN_OPENAPI = "sources/personal_project_openapi_v0_2.yaml"
OPENAPI_PATCH = "sources/openapi_m2_5_dlq_replay_patch.yaml"
PROPOSAL_MARKER = "PROPOSAL ONLY - DO NOT MERGE AUTOMATICALLY"

MARKERS = [
    "M2-8M OpenAPI merge completed",
    "proposal patch preserved",
    "route/OpenAPI parity reviewed",
    "DTO safety reviewed",
    "redacted error envelope reviewed",
    "auth role documentation reviewed",
    "Aurora repository is not live",
    "SQL apply is not performed",
    "runtime dry-run is not executed",
    "migration review",
    "rollback plan",
    "controlled runtime gate",
    "bounded sample-count",
    "bounded time-window",
    "evidence_report_ref",
    "cleanup owner",
]

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


def read_text(relative_path: str) -> str:
    path = ROOT / relative_path
    return path.read_text(encoding="utf-8") if path.is_file() else ""


def file_exists(relative_path: str) -> bool:
    return (ROOT / relative_path).is_file()


def package_has_script() -> bool:
    try:
        package = json.loads(read_text("package.json"))
    except json.JSONDecodeError:
        return False
    return PACKAGE_SCRIPT in package.get("scripts", {})


def main() -> int:
    validator = Validator()

    for doc in DOCS:
        validator.check(file_exists(doc), f"M2-8N doc exists: {doc}")

    combined = "\n".join(read_text(doc) for doc in DOCS).casefold()
    for marker in MARKERS:
        validator.check(marker.casefold() in combined, f"M2-8N docs contain marker: {marker}")

    openapi_text = read_text(MAIN_OPENAPI)
    for route in ROUTES:
        validator.check(route in openapi_text, f"main OpenAPI contains route: {route}")

    validator.check(PROPOSAL_MARKER in read_text(OPENAPI_PATCH), "proposal patch remains proposal-only")
    validator.check(package_has_script(), f"package.json has script: {PACKAGE_SCRIPT}")
    validator.check(re.search(r"CdcErrorResponse", openapi_text) is not None, "main OpenAPI has CDC redacted error envelope")

    return validator.summary()


if __name__ == "__main__":
    sys.exit(main())
