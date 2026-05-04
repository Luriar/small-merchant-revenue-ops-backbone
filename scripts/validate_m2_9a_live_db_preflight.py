#!/usr/bin/env python3
"""Validate M2-9A live DB preflight gate documentation."""

from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

DOCS = [
    "docs/m2_9a_live_db_preflight_gate_kr.md",
    "docs/m2_9a_rollback_plan_kr.md",
    "docs/m2_9a_live_db_no_go_decision_record_kr.md",
]

PACKAGE_SCRIPT = "validate:m2-9a:live-db-preflight"
SQL_FILE = "infra/sql/aurora/m2_4_dlq_replay_metadata.sql"

MARKERS = [
    "Decision: NO-GO",
    "dev/staging/non-production",
    "current schema state",
    "migration target tables",
    "migration idempotency",
    "rollback strategy",
    "verification queries",
    "expected table list",
    "expected indexes/constraints",
    "user/role permission boundary",
    "no production markers",
    "bounded runtime sample plan",
    "evidence_report_ref",
    "cleanup owner",
    "no SQL apply",
    "no Aurora connection",
    "no real DB queries",
    "no runtime dry-run",
    "no external infrastructure commands",
]

EXPECTED_TABLES = [
    "public.cdc_failure",
    "public.cdc_replay_request",
    "public.cdc_failure_state_log",
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


def sql_is_proposal_only() -> bool:
    text = read_text(SQL_FILE)
    return "PROPOSAL ONLY - DO NOT APPLY AUTOMATICALLY" in text


def main() -> int:
    validator = Validator()

    for doc in DOCS:
        validator.check(file_exists(doc), f"M2-9A doc exists: {doc}")

    text = "\n".join(read_text(doc) for doc in DOCS).casefold()
    for marker in MARKERS:
        validator.check(marker.casefold() in text, f"M2-9A docs contain marker: {marker}")

    for table in EXPECTED_TABLES:
        validator.check(table in text, f"M2-9A docs mention expected table: {table}")

    validator.check(file_exists(SQL_FILE), "M2-4 CDC replay metadata SQL exists")
    validator.check(sql_is_proposal_only(), "M2-4 SQL remains proposal-only before apply")
    validator.check(package_has_script(), f"package.json has script: {PACKAGE_SCRIPT}")
    validator.check("NO-GO".casefold() in text, "preflight records NO-GO state")

    return validator.summary()


if __name__ == "__main__":
    sys.exit(main())
