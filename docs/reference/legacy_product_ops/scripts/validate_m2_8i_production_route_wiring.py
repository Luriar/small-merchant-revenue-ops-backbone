#!/usr/bin/env python3
"""Static validator for M2-8I production CDC recovery route wiring."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

from m2_8m_validator_compat import git_diff_is_empty_or_approved_m2_8m


ROOT = Path(__file__).resolve().parents[1]

DOC = "docs/m2_8i_production_route_wiring_implementation_kr.md"
ROUTE_MODULE = "apps/api/src/cdc-recovery/cdc-recovery-routes.js"
PRODUCTION_TEST = "apps/api/src/cdc-recovery/cdc-recovery-production-routes.test.js"
SERVER = "apps/api/src/server.js"
AUTH = "apps/api/src/auth.js"
ERROR_RESPONSE = "apps/api/src/error-response.js"
MAIN_OPENAPI = "sources/personal_project_openapi_v0_2.yaml"
OPENAPI_PATCH = "sources/openapi_m2_5_dlq_replay_patch.yaml"
PROPOSAL_MARKER = "PROPOSAL ONLY - DO NOT MERGE AUTOMATICALLY"

PACKAGE_SCRIPTS = [
    "test:m2-8i:production-routes",
    "validate:m2-8i:production-route-wiring",
]

M2_8I_FILES = [
    DOC,
    ROUTE_MODULE,
    PRODUCTION_TEST,
]

REQUIRED_ROUTES = [
    "/api/v1/cdc/failures",
    "/api/v1/cdc/failures/cdc_fail_1",
    "/api/v1/cdc/failures/cdc_fail_1/state-log",
    "/api/v1/cdc/failures/cdc_fail_1/replay-requests",
    "/api/v1/cdc/replay-requests",
    "/api/v1/cdc/replay-requests/cdc_replay_req_existing",
    "/api/v1/cdc/replay-requests/cdc_replay_req_existing/approve",
    "/api/v1/cdc/replay-requests/cdc_replay_req_existing/cancel",
]

REQUIRED_TEST_MARKERS = [
    ("auth missing safe 401", r"auth missing safe 401"),
    ("readonly_role", r"readonly_role"),
    ("operator", r"operator"),
    ("maintainer", r"maintainer"),
    ("system_worker", r"system_worker"),
    ("safe 400", r"safe 400"),
    ("safe 403", r"safe 403"),
    ("safe 404", r"safe 404"),
    ("safe 409", r"safe 409"),
    ("safe 500", r"safe 500"),
    ("DTO safety", r"dto safety"),
    ("OpenAPI proposal-only", r"openapi proposal-only"),
    ("no raw payloads", r"no raw payloads"),
    ("no full message bodies", r"no full message bodies"),
    ("no issue raw values", r"no issue raw values"),
    ("no prod_change payload/actor values", r"no prod_change payload/actor values"),
    ("no stack traces", r"no stack traces"),
    ("no SQL details", r"no sql details"),
    ("no persistence internals", r"no persistence internals"),
]

RISKY_CODE_PATTERNS = [
    r"require\([\"']pg[\"']\)",
    r"require\([\"']node:child_process[\"']\)",
    r"\bchild_process\b",
    r"\bexec\s*\(",
    r"\bspawn\s*\(",
    r"\bpsql\b",
    r"\bkubectl\b",
    r"\bclickhouse\b",
    r"\bdebezium\b",
    r"\bkafka\b",
    r"\baws\s+",
    r"\bterraform\b",
    r"\baurora\s+connection\b",
    r"\bsql\s+apply\b",
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
    if git_diff_is_empty_or_approved_m2_8m(ROOT, relative_path):
        return True
    result = subprocess.run(
        ["git", "diff", "--quiet", "--", relative_path],
        cwd=ROOT,
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return result.returncode == 0


def server_has_minimal_cdc_registration() -> bool:
    text = read_text(SERVER)
    required = [
        'require("./cdc-recovery/cdc-recovery-routes")',
        "createCdcRecoveryRouteDispatcher",
        "cdcRecoveryRoutes?.matches(request)",
        "cdcRecoveryRoutes.handle(request, response)",
    ]
    return all(marker in text for marker in required)


def server_diff_is_minimal() -> bool:
    diff_text = git_diff(SERVER)
    if not diff_text:
        return False

    changed_lines = [
        line for line in diff_text.splitlines()
        if (line.startswith("+") or line.startswith("-"))
        and not line.startswith("+++")
        and not line.startswith("---")
    ]
    removed_lines = [line for line in changed_lines if line.startswith("-") and line[1:].strip()]
    added_lines = [line for line in changed_lines if line.startswith("+") and line[1:].strip()]

    if removed_lines:
        return False
    if len(added_lines) > 14:
        return False

    allowed_added_patterns = [
        r"createCdcRecoveryRouteDispatcher",
        r"cdcRecoveryRoutes",
        r"authConfig: startupConfig\.authConfig",
        r"env,",
        r"\}\);",
        r"\{",
        r"\}",
    ]

    for line in added_lines:
        content = line[1:].strip()
        if not any(re.search(pattern, content) for pattern in allowed_added_patterns):
            return False

    return True


def no_risky_code_usage() -> bool:
    code_text = combined_text([ROUTE_MODULE, PRODUCTION_TEST])
    return not any(re.search(pattern, code_text, flags=re.I) for pattern in RISKY_CODE_PATTERNS)


def no_suspicious_object_keys() -> bool:
    code_text = combined_text([ROUTE_MODULE, PRODUCTION_TEST])
    for key in SUSPICIOUS_KEYS:
        object_key_pattern = rf"(?:^|[{{,]\s*){re.escape(key)}\s*:"
        property_set_pattern = rf"\.{re.escape(key)}\s*="
        if re.search(object_key_pattern, code_text, flags=re.M) or re.search(property_set_pattern, code_text):
            return False
    return True


def tests_cover_required_routes() -> bool:
    test_text = read_text(PRODUCTION_TEST)
    return all(route in test_text for route in REQUIRED_ROUTES)


def doc_explicitly_allows_auth_or_error_change(file_name: str) -> bool:
    doc_text = read_text(DOC).casefold()
    return f"{file_name} minimally changed" in doc_text and "tests cover" in doc_text


def main() -> int:
    validator = Validator()

    validator.check(file_exists(DOC), f"required M2-8I doc exists: {DOC}")
    validator.check(file_exists(ROUTE_MODULE), f"production CDC route module exists: {ROUTE_MODULE}")
    validator.check(file_exists(PRODUCTION_TEST), f"production route registration test exists: {PRODUCTION_TEST}")

    for script_name in PACKAGE_SCRIPTS:
        validator.check(package_has_script(script_name), f"package.json has script: {script_name}")

    validator.check(server_has_minimal_cdc_registration(), "server.js has CDC route registration markers")
    validator.check(server_diff_is_minimal(), "server.js has a minimal CDC registration diff only")

    auth_ok = git_diff_is_empty(AUTH) or doc_explicitly_allows_auth_or_error_change("auth.js")
    error_ok = git_diff_is_empty(ERROR_RESPONSE) or doc_explicitly_allows_auth_or_error_change("error-response.js")
    validator.check(auth_ok, "auth.js has no diff or documented minimal tested change")
    validator.check(error_ok, "error-response.js has no diff or documented minimal tested change")

    validator.check(git_diff_is_empty(MAIN_OPENAPI), "main OpenAPI file has no working-tree diff")
    validator.check(PROPOSAL_MARKER in read_text(OPENAPI_PATCH), "M2-5 OpenAPI patch remains proposal-only")

    validator.check(no_risky_code_usage(), "new M2-8I code/test files have no DB/infrastructure command usage")
    validator.check("require(\"pg\")" not in combined_text([ROUTE_MODULE, PRODUCTION_TEST]), "new M2-8I files do not import pg")
    validator.check("child_process" not in combined_text([ROUTE_MODULE, PRODUCTION_TEST]), "new M2-8I files do not use child_process")
    validator.check(no_suspicious_object_keys(), "new M2-8I files do not use suspicious raw keys as object keys")

    validator.check(tests_cover_required_routes(), "production route tests mention all M2-5 CDC route strings")

    test_text = read_text(PRODUCTION_TEST).casefold()
    for marker_name, pattern in REQUIRED_TEST_MARKERS:
        validator.check(
            re.search(pattern, test_text, flags=re.I) is not None,
            f"production route tests mention marker: {marker_name}",
        )

    doc_text = read_text(DOC).casefold()
    validator.check("test-only harness" in doc_text, "doc mentions preserved test-only harness")
    validator.check("in-memory/stub repository" in doc_text, "doc mentions in-memory/stub repository")
    validator.check("safe error" in doc_text, "doc mentions safe error adapter behavior")
    validator.check("main openapi was not merged" in doc_text, "doc states main OpenAPI was not merged")
    validator.check("real db queries" in doc_text, "doc states real DB queries were not used")
    validator.check("aurora connection" in doc_text, "doc states Aurora connection was not used")
    validator.check("sql apply" in doc_text, "doc states SQL apply was not used")
    validator.check("external infrastructure commands" in doc_text, "doc states external infrastructure commands were not used")

    return validator.summary()


if __name__ == "__main__":
    sys.exit(main())
