#!/usr/bin/env python3
"""Static validator for the M2-8A route wiring readiness audit package."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

from m2_8i_validator_compat import server_has_no_cdc_recovery_or_approved_m2_8i


ROOT = Path(__file__).resolve().parents[1]

REQUIRED_FILES = [
    "docs/m2_8a_route_wiring_readiness_audit_kr.md",
    "ops/m2_8a_route_wiring_readiness/checklists/route_wiring_readiness_checklist.md",
    "ops/m2_8a_route_wiring_readiness/checklists/openapi_merge_readiness_checklist.md",
    "ops/m2_8a_route_wiring_readiness/checklists/auth_role_mapping_checklist.md",
    "ops/m2_8a_route_wiring_readiness/checklists/dto_error_safety_checklist.md",
]

REQUIRED_AUDIT_SECTIONS = [
    "Purpose and Non-Goals",
    "Current M2-7 Skeleton Status",
    "Existing API Server Style Summary",
    "Proposed Route-to-Handler Mapping",
    "Auth/Role Enforcement Readiness",
    "Error Envelope Readiness",
    "DTO Mapper Safety Readiness",
    "OpenAPI Patch Merge Readiness",
    "Repository Implementation Readiness",
    "Integration Test Readiness",
    "Stop Conditions",
    "Decision: Ready / Not Ready for M2-8B Route Wiring",
    "Remaining Blockers",
]

REQUIRED_ENDPOINTS = [
    ("GET", "/api/v1/cdc/failures"),
    ("GET", "/api/v1/cdc/failures/{failure_id}"),
    ("GET", "/api/v1/cdc/failures/{failure_id}/state-log"),
    ("POST", "/api/v1/cdc/failures/{failure_id}/replay-requests"),
    ("GET", "/api/v1/cdc/replay-requests"),
    ("GET", "/api/v1/cdc/replay-requests/{replay_request_id}"),
    ("POST", "/api/v1/cdc/replay-requests/{replay_request_id}/approve"),
    ("POST", "/api/v1/cdc/replay-requests/{replay_request_id}/cancel"),
]

REQUIRED_MARKERS = [
    ("not live route wiring", [r"not live route wiring", r"no live route wiring"]),
    ("server.js must not be modified in M2-8A", [r"`?server\.js`? must not be modified in m2-8a"]),
    ("OpenAPI patch must not be merged yet", [r"openapi patch must not be merged yet"]),
    ("safe DTO mapper", [r"safe dto mapper"]),
    ("auth/role enforcement", [r"auth/role enforcement", r"role mapping review"]),
    ("error envelope", [r"error envelope"]),
    ("409 idempotency conflict", [r"idempotency conflict 409", r"409 idempotency conflict"]),
    ("409 invalid state transition", [r"invalid state transition 409", r"409 invalid state transition"]),
    ("no raw payloads", [r"no raw payloads"]),
    ("no full message bodies", [r"no full message bodies"]),
    ("no issue raw values", [r"no issue raw values"]),
    ("no prod_change payload/actor values", [r"no prod_change payload/actor values"]),
    ("401/403/404/409/500 error mapping review", [r"401/403/404/409/500 error mapping review"]),
    ("maintainer-only approve/cancel review", [r"maintainer-only approve/cancel review"]),
    (
        "readonly/operator/maintainer/system_worker role mapping review",
        [r"readonly/operator/maintainer/system_worker role mapping review"],
    ),
]

PACKAGE_SCRIPT = "validate:m2-8a:route-readiness"


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


def has_any_pattern(text: str, patterns: list[str]) -> bool:
    return any(re.search(pattern, text, flags=re.I) for pattern in patterns)


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


def audit_maps_endpoint(audit_text: str, method: str, path: str) -> bool:
    path_present = path in audit_text
    method_pattern = rf"(?:^|\|\s*){re.escape(method)}(?:\s*\||\s)"
    return path_present and re.search(method_pattern, audit_text, flags=re.M) is not None


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


def main() -> int:
    validator = Validator()

    for relative_path in REQUIRED_FILES:
        validator.check(file_exists(relative_path), f"required M2-8A file exists: {relative_path}")

    audit_text = read_existing_text("docs/m2_8a_route_wiring_readiness_audit_kr.md")
    for section in REQUIRED_AUDIT_SECTIONS:
        validator.check(section in audit_text, f"audit doc includes section: {section}")

    for method, path in REQUIRED_ENDPOINTS:
        validator.check(audit_maps_endpoint(audit_text, method, path), f"audit doc maps endpoint: {method} {path}")

    combined_text = combined_required_text()
    for marker_name, patterns in REQUIRED_MARKERS:
        validator.check(has_any_pattern(combined_text, patterns), f"docs/checklists mention {marker_name}")

    validator.check(server_is_not_wired(), "server.js does not import or register cdc-recovery routes")
    validator.check(package_has_script(PACKAGE_SCRIPT), f"package.json has script: {PACKAGE_SCRIPT}")

    return validator.summary()


if __name__ == "__main__":
    sys.exit(main())
