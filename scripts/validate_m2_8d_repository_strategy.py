#!/usr/bin/env python3
"""Static validator for the M2-8D-Prep CDC recovery repository strategy."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

from m2_8i_validator_compat import (
    git_diff_is_empty_or_approved_m2_8i,
    server_has_no_cdc_recovery_or_approved_m2_8i,
)


ROOT = Path(__file__).resolve().parents[1]

REQUIRED_DOCS = [
    "docs/m2_8d_prep_repository_strategy_kr.md",
    "docs/m2_8d_repository_strategy_decision_record_kr.md",
]

REQUIRED_CHECKLISTS = [
    "ops/m2_8d_repository_strategy/checklists/repository_strategy_checklist.md",
    "ops/m2_8d_repository_strategy/checklists/persistence_boundary_checklist.md",
    "ops/m2_8d_repository_strategy/checklists/transaction_state_log_checklist.md",
]

REQUIRED_FILES = [
    *REQUIRED_DOCS,
    *REQUIRED_CHECKLISTS,
    "fixtures/m2_8d_repository/repository_contract_examples.json",
]

REQUIRED_MARKERS = [
    ("not live route wiring", [r"not live route wiring", r"no live route wiring"]),
    ("server.js modification", [r"server\.js.+modification", r"no server\.js modification"]),
    ("auth.js modification", [r"auth\.js.+modification", r"no auth\.js modification"]),
    ("error-response.js modification", [r"error-response\.js.+modification", r"no error-response\.js modification"]),
    ("no real DB queries", [r"no real db queries"]),
    ("no Aurora connection", [r"no aurora connection"]),
    ("OpenAPI main merge", [r"openapi main merge"]),
    ("SQL apply", [r"sql apply"]),
    ("external infrastructure commands", [r"external infrastructure commands"]),
    ("in-memory/stub repository", [r"in-memory/stub repository"]),
    ("direct Aurora repository deferred", [r"direct aurora repository deferred"]),
    ("repository output safe metadata only", [r"repository output safe metadata only"]),
    ("state log append-only", [r"state log append-only"]),
    ("original failure immutable", [r"original failure immutable"]),
    ("original run immutable", [r"original run immutable"]),
    ("idempotency conflict", [r"idempotency conflict"]),
    ("invalid state transition", [r"invalid state transition"]),
    ("linkNewRunId", [r"linknewrunid"]),
    ("future worker-only", [r"future worker-only"]),
    ("no raw payloads", [r"no raw payloads"]),
    ("no full message bodies", [r"no full message bodies"]),
    ("no issue raw values", [r"no issue raw values"]),
    ("no prod_change payload/actor values", [r"no prod_change payload/actor values"]),
    ("no stack traces", [r"no stack traces"]),
    ("no SQL details", [r"no sql details"]),
    ("no persistence internals", [r"no persistence internals"]),
]

REQUIRED_METHODS = [
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

REQUIRED_EXAMPLES = [
    "list_failures_result",
    "get_failure_result",
    "replay_request_created",
    "idempotent_duplicate_result",
    "idempotency_conflict_result",
    "invalid_state_transition_result",
    "replay_request_approved",
    "replay_request_cancelled",
    "link_new_run_id_future_worker_result",
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
}

PACKAGE_SCRIPT = "validate:m2-8d-prep:repository-strategy"


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


def has_any_pattern(text: str, patterns: list[str]) -> bool:
    return any(re.search(pattern, text, flags=re.I) for pattern in patterns)


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
    return not (collect_keys(fixture) & SUSPICIOUS_KEYS)


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


def git_diff_is_empty(relative_path: str) -> bool:
    return git_diff_is_empty_or_approved_m2_8i(ROOT, relative_path)


def main() -> int:
    validator = Validator()

    for relative_path in REQUIRED_DOCS:
        validator.check(file_exists(relative_path), f"required doc exists: {relative_path}")

    for relative_path in REQUIRED_CHECKLISTS:
        validator.check(file_exists(relative_path), f"required checklist exists: {relative_path}")

    validator.check(file_exists("fixtures/m2_8d_repository/repository_contract_examples.json"), "repository fixture exists")
    fixture = load_json_object("fixtures/m2_8d_repository/repository_contract_examples.json")
    validator.check(fixture is not None, "repository fixture is valid JSON object")
    validator.check(fixture_has_required_examples(fixture), "fixture includes all required example names")
    validator.check(fixture_has_no_suspicious_keys(fixture), "fixture has no suspicious raw keys recursively")

    combined_text = combined_required_text()
    for marker_name, patterns in REQUIRED_MARKERS:
        validator.check(has_any_pattern(combined_text, patterns), f"docs/checklists contain marker: {marker_name}")

    strategy_text = read_existing_text("docs/m2_8d_prep_repository_strategy_kr.md")
    for method in REQUIRED_METHODS:
        validator.check(method in strategy_text, f"method-to-table mapping mentions: {method}")

    validator.check(server_is_not_wired(), "apps/api/src/server.js does not import cdc-recovery")
    validator.check(git_diff_is_empty("apps/api/src/server.js"), "apps/api/src/server.js has no working-tree diff")
    validator.check(git_diff_is_empty("apps/api/src/auth.js"), "apps/api/src/auth.js has no working-tree diff")
    validator.check(git_diff_is_empty("apps/api/src/error-response.js"), "apps/api/src/error-response.js has no working-tree diff")
    validator.check(
        git_diff_is_empty("apps/api/src/cdc-recovery/cdc-recovery-repository.js"),
        "apps/api/src/cdc-recovery/cdc-recovery-repository.js has no working-tree diff",
    )
    validator.check(package_has_script(PACKAGE_SCRIPT), f"package.json has script: {PACKAGE_SCRIPT}")

    return validator.summary()


if __name__ == "__main__":
    sys.exit(main())
