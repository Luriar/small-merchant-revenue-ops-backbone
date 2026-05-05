#!/usr/bin/env python3
"""Validate the static M2-2 runtime dry-run package."""

from __future__ import annotations

import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
PACKAGE_DIR = REPO_ROOT / "ops/m2_2_runtime_dry_run"
COMMANDS_DIR = PACKAGE_DIR / "commands"
EVIDENCE_DIR = PACKAGE_DIR / "evidence"
CHECKLISTS_DIR = PACKAGE_DIR / "checklists"
DOC_PATH = REPO_ROOT / "docs/m2_2_controlled_runtime_dry_run_execution_package_kr.md"

REQUIRED_DIRS = [
    PACKAGE_DIR,
    COMMANDS_DIR,
    EVIDENCE_DIR,
    CHECKLISTS_DIR,
]

REQUIRED_COMMAND_TEMPLATES = [
    COMMANDS_DIR / "01_aurora_prereq_check.sh.template",
    COMMANDS_DIR / "02_publication_review_apply.sh.template",
    COMMANDS_DIR / "03_debezium_connector_bounded_start.sh.template",
    COMMANDS_DIR / "04_kafka_bounded_sample_inspection.sh.template",
    COMMANDS_DIR / "05_clickhouse_fixture_parse_check.sh.template",
    COMMANDS_DIR / "06_delete_rewrite_check.sh.template",
    COMMANDS_DIR / "07_cleanup_and_slot_check.sh.template",
]

REQUIRED_EVIDENCE_TEMPLATES = [
    EVIDENCE_DIR / "message_field_set_capture_template.md",
    EVIDENCE_DIR / "runtime_observation_template.md",
    EVIDENCE_DIR / "delete_behavior_observation_template.md",
    EVIDENCE_DIR / "cleanup_completion_template.md",
]

REQUIRED_CHECKLISTS = [
    CHECKLISTS_DIR / "preflight_checklist.md",
    CHECKLISTS_DIR / "stop_conditions_checklist.md",
    CHECKLISTS_DIR / "cleanup_checklist.md",
    CHECKLISTS_DIR / "evidence_review_checklist.md",
]

COMMAND_TEMPLATE_MARKERS = [
    "TEMPLATE ONLY - DO NOT RUN DIRECTLY",
    "do not print raw values",
    "do not record raw payloads or full message bodies",
]

BOUNDED_MARKERS = [
    "bounded sample",
    "max duration",
    "MAX_DURATION_SECONDS",
    "BOUNDED_SAMPLE_COUNT",
]

DO_NOT_RECORD_MARKERS = [
    "do not record raw payloads",
    "do not record full message bodies",
    "do not record secrets",
    "DB URLs",
    "endpoints",
    "account IDs",
    "SecretString",
    "tokens",
    "passwords",
    "raw connection strings",
    "issue title/body/payload/reporter values",
    "prod_change payload/actor values",
    "screenshots or logs exposing raw values",
]

STOP_CONDITION_MARKERS = [
    "publication contains FOR ALL TABLES",
    "publication contains FOR TABLES IN SCHEMA",
    "forbidden fields appear in publication/connector/message keys",
    "connector uses publication.autocreate.mode=all_tables",
    "connector emits __op or __ts_ms instead of op and ts_ms",
    "Debezium envelope fields appear as ClickHouse data columns",
    "unbounded connector execution is required",
    "replication slot lag or WAL pressure grows unexpectedly",
    "anyone proposes REPLICA IDENTITY FULL as a quick fix without review",
]

DOC_MARKERS = [
    "not production rollout",
    "M2-1 closure",
    "bounded runtime dry run",
    "safe evidence",
    "cleanup",
]

FORBIDDEN_ACTIVE_COMMAND_PREFIXES = (
    "aws ",
    "kubectl ",
    "psql ",
    "kafka-console-consumer ",
    "clickhouse-client ",
)


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def record(results: list[tuple[bool, str]], passed: bool, message: str) -> None:
    results.append((passed, message))
    status = "PASS" if passed else "FAIL"
    print(f"[{status}] {message}")


def contains_all(content: str, markers: list[str]) -> bool:
    lowered = content.lower()
    return all(marker.lower() in lowered for marker in markers)


def has_any(content: str, markers: list[str]) -> bool:
    lowered = content.lower()
    return any(marker.lower() in lowered for marker in markers)


def has_no_active_infra_commands(content: str) -> bool:
    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or line.startswith("echo "):
            continue
        if line.startswith(FORBIDDEN_ACTIVE_COMMAND_PREFIXES):
            return False
    return True


def validate_paths(results: list[tuple[bool, str]]) -> None:
    for directory in REQUIRED_DIRS:
        record(results, directory.is_dir(), f"{directory.relative_to(REPO_ROOT)} exists")
    for path in REQUIRED_COMMAND_TEMPLATES:
        record(results, path.is_file(), f"{path.relative_to(REPO_ROOT)} exists")
    for path in REQUIRED_EVIDENCE_TEMPLATES:
        record(results, path.is_file(), f"{path.relative_to(REPO_ROOT)} exists")
    for path in REQUIRED_CHECKLISTS:
        record(results, path.is_file(), f"{path.relative_to(REPO_ROOT)} exists")
    record(results, DOC_PATH.is_file(), f"{DOC_PATH.relative_to(REPO_ROOT)} exists")


def validate_command_templates(results: list[tuple[bool, str]]) -> None:
    for path in REQUIRED_COMMAND_TEMPLATES:
        if not path.exists():
            continue
        content = read_text(path)
        record(
            results,
            contains_all(content, COMMAND_TEMPLATE_MARKERS),
            f"{path.relative_to(REPO_ROOT)} has template safety markers",
        )
        record(
            results,
            has_any(content, BOUNDED_MARKERS),
            f"{path.relative_to(REPO_ROOT)} has bounded sample or max duration language",
        )
        record(
            results,
            has_no_active_infra_commands(content),
            f"{path.relative_to(REPO_ROOT)} has no active infra commands",
        )


def validate_evidence_templates(results: list[tuple[bool, str]]) -> None:
    for path in REQUIRED_EVIDENCE_TEMPLATES:
        if not path.exists():
            continue
        content = read_text(path)
        record(
            results,
            contains_all(content, DO_NOT_RECORD_MARKERS),
            f"{path.relative_to(REPO_ROOT)} has do-not-record markers",
        )


def validate_checklists(results: list[tuple[bool, str]]) -> None:
    stop_path = CHECKLISTS_DIR / "stop_conditions_checklist.md"
    if stop_path.exists():
        content = read_text(stop_path)
        record(
            results,
            contains_all(content, STOP_CONDITION_MARKERS),
            "stop conditions checklist has all required stop conditions",
        )


def validate_doc(results: list[tuple[bool, str]]) -> None:
    if not DOC_PATH.exists():
        return
    content = read_text(DOC_PATH)
    record(
        results,
        contains_all(content, DOC_MARKERS),
        "M2-2 documentation has required markers",
    )


def main() -> int:
    results: list[tuple[bool, str]] = []
    print("M2-2 runtime dry-run package validation")
    print("=======================================")
    validate_paths(results)
    validate_command_templates(results)
    validate_evidence_templates(results)
    validate_checklists(results)
    validate_doc(results)

    failed = [message for passed, message in results if not passed]
    print("=======================================")
    print(f"Summary: {len(results) - len(failed)} PASS, {len(failed)} FAIL")
    if failed:
        print("Failed checks:")
        for message in failed:
            print(f"- {message}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
