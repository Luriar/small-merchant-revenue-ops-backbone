#!/usr/bin/env python3
"""Validate M2-8O mocked Aurora repository implementation."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

REPOSITORY = "apps/api/src/cdc-recovery/cdc-recovery-aurora-repository.js"
TEST = "apps/api/src/cdc-recovery/cdc-recovery-aurora-repository.test.js"
DOCS = [
    "docs/m2_8o_aurora_repository_implementation_kr.md",
    "docs/m2_8o_repository_test_matrix_kr.md",
    "docs/m2_8o_persistence_boundary_decision_record_kr.md",
]
PACKAGE_SCRIPTS = [
    "test:m2-8o:aurora-repository",
    "validate:m2-8o:aurora-repository",
]

METHODS = [
    "listFailures",
    "getFailureById",
    "listFailureStateLog",
    "listReplayRequests",
    "getReplayRequestById",
    "findReplayRequestByIdempotencyKey",
    "createReplayRequest",
    "appendFailureStateLog",
    "updateFailureStatus",
    "updateReplayRequestStatus",
    "linkNewRunId",
]

DOC_MARKERS = [
    "injected DB client",
    "no DB client creation",
    "parameterized SQL only",
    "transaction-aware writes",
    "safe metadata projections only",
    "redacted persistence errors",
    "no Aurora connection",
    "no real DB queries",
    "no SQL apply",
    "no external infrastructure commands",
]

TEST_MARKERS = [
    "safe failure projections",
    "found and not found",
    "idempotent duplicate",
    "idempotency_conflict",
    "valid and invalid state transitions",
    "appends state log",
    "original failure",
    "original run",
    "linkNewRunId",
    "redacts persistence failures",
    "parameterized filters",
    "injected DB client",
]

FORBIDDEN_CODE_PATTERNS = [
    r"require\([\"']pg[\"']\)",
    r"\bimport\s+pg\b",
    r"AURORA_DATABASE_URL",
    r"DATABASE_URL",
    r"connectionString",
    r"new\s+Pool\b",
    r"child" r"_process",
    r"node:child" r"_process",
]

INFRA_COMMAND_PATTERNS = [
    r"\baws\s+[a-z0-9_-]+",
    r"\bku" r"bectl\s+",
    r"\bp" r"sql\s+",
    r"\bka" r"fka-[a-z0-9_-]+",
    r"\bclick" r"house-[a-z0-9_-]+",
    r"\bdebe" r"zium\s+",
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


def package_has_script(script_name: str) -> bool:
    try:
        package = json.loads(read_text("package.json"))
    except json.JSONDecodeError:
        return False
    return script_name in package.get("scripts", {})


def git_diff_is_empty(relative_path: str) -> bool:
    result = subprocess.run(
        ["git", "diff", "--quiet", "--", relative_path],
        cwd=ROOT,
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return result.returncode == 0


def main() -> int:
    validator = Validator()

    validator.check(file_exists(REPOSITORY), "Aurora CDC recovery repository exists")
    validator.check(file_exists(TEST), "Aurora CDC recovery repository test exists")
    for doc in DOCS:
        validator.check(file_exists(doc), f"M2-8O doc exists: {doc}")
    for script_name in PACKAGE_SCRIPTS:
        validator.check(package_has_script(script_name), f"package.json has script: {script_name}")

    repository_text = read_text(REPOSITORY)
    test_text = read_text(TEST)
    doc_text = "\n".join(read_text(doc) for doc in DOCS)
    combined_code = repository_text + "\n" + test_text

    for method in METHODS:
        validator.check(re.search(rf"\b{method}\s*\(", repository_text) is not None, f"repository implements {method}")

    validator.check("constructor({ db }" in repository_text, "repository requires injected DB client")
    validator.check("withTransaction" in repository_text, "repository uses transaction-aware write path")
    validator.check("CdcRecoveryPersistenceError" in repository_text, "repository defines redacted persistence error")
    validator.check("pickSafeFields" in repository_text, "repository uses safe projection helper")
    validator.check("VALUES ($1, $2, $3" in repository_text, "repository uses parameterized insert placeholders")
    validator.check(not any(re.search(pattern, combined_code) for pattern in FORBIDDEN_CODE_PATTERNS), "repository/test do not create DB clients or process-spawn APIs")
    validator.check(not any(re.search(pattern, combined_code, flags=re.I) for pattern in INFRA_COMMAND_PATTERNS), "repository/test contain no infrastructure command usage")
    validator.check("apps/api/src/server.js" not in repository_text, "repository does not modify or import server.js")
    validator.check(git_diff_is_empty("apps/api/src/auth.js"), "auth.js has no working-tree diff")
    validator.check(git_diff_is_empty("apps/api/src/error-response.js"), "error-response.js has no working-tree diff")

    lowered_docs = doc_text.casefold()
    for marker in DOC_MARKERS:
        validator.check(marker.casefold() in lowered_docs, f"docs mention marker: {marker}")

    lowered_test = test_text.casefold()
    for marker in TEST_MARKERS:
        validator.check(marker.casefold() in lowered_test, f"tests mention marker: {marker}")

    return validator.summary()


if __name__ == "__main__":
    sys.exit(main())
