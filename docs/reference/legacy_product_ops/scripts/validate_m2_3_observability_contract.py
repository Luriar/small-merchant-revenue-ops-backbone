#!/usr/bin/env python3
"""Static validator for the M2-3 observability / DLQ / replay contract."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]

REQUIRED_DOCS = [
    "docs/m2_3_observability_dlq_replay_contract_kr.md",
    "docs/m2_3_observability_signal_catalog_kr.md",
    "docs/m2_3_dlq_message_contract_kr.md",
    "docs/m2_3_replay_reprocess_contract_kr.md",
]

REQUIRED_OPS_FILES = [
    "ops/m2_3_observability_dlq_replay/README.md",
    "ops/m2_3_observability_dlq_replay/checklists/failure_triage_checklist.md",
    "ops/m2_3_observability_dlq_replay/checklists/replay_approval_checklist.md",
    "ops/m2_3_observability_dlq_replay/checklists/dlq_evidence_review_checklist.md",
    "ops/m2_3_observability_dlq_replay/templates/replay_request_template.md",
    "ops/m2_3_observability_dlq_replay/templates/dlq_record_review_template.md",
    "ops/m2_3_observability_dlq_replay/templates/observability_incident_note_template.md",
]

REQUIRED_DLQ_FIXTURES = [
    "fixtures/m2_3_dlq/clickhouse_parse_failure.json",
    "fixtures/m2_3_dlq/forbidden_field_leakage.json",
    "fixtures/m2_3_dlq/delete_shape_mismatch.json",
]

REQUIRED_DLQ_FIELDS = {
    "failure_id",
    "failure_type",
    "source_topic",
    "source_table",
    "primary_key",
    "op",
    "ts_ms",
    "observed_field_names",
    "missing_required_fields",
    "unexpected_fields",
    "forbidden_field_names_detected",
    "parser_error_class",
    "parser_error_summary",
    "first_seen_at",
    "last_seen_at",
    "attempt_count",
    "status",
    "owner",
    "evidence_report_ref",
}

SUSPICIOUS_RAW_KEYS = {
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
    "evidence-safe",
    "forbidden field leakage",
    "replay is not raw message replay by default",
    "new run row",
    "REPLICA IDENTITY FULL",
    "quick fix",
    "raw payloads",
    "full message bodies",
    "slot lag / WAL pressure",
    "cleanup evidence",
]

CHECKLIST_MARKERS = [
    "forbidden field leakage",
    "REPLICA IDENTITY FULL",
    "quick fix",
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


def read_text(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def file_exists(path: str) -> bool:
    return (ROOT / path).is_file()


def load_json_object(path: str) -> dict[str, Any] | None:
    try:
        value = json.loads(read_text(path))
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


def main() -> int:
    validator = Validator()

    for path in REQUIRED_DOCS:
        validator.check(file_exists(path), f"required doc exists: {path}")

    for path in REQUIRED_OPS_FILES:
        validator.check(file_exists(path), f"required ops package file exists: {path}")

    for path in REQUIRED_DLQ_FIXTURES:
        validator.check(file_exists(path), f"required DLQ fixture exists: {path}")

    for path in REQUIRED_DLQ_FIXTURES:
        value = load_json_object(path)
        validator.check(value is not None, f"DLQ fixture is a valid JSON object: {path}")
        if value is None:
            continue

        missing_fields = sorted(REQUIRED_DLQ_FIELDS - set(value))
        validator.check(
            not missing_fields,
            f"DLQ fixture includes required safe metadata fields: {path}",
        )

        suspicious_keys = sorted(collect_keys(value) & SUSPICIOUS_RAW_KEYS)
        validator.check(
            not suspicious_keys,
            f"DLQ fixture avoids forbidden raw/suspicious keys: {path}",
        )

        validator.check(
            isinstance(value.get("observed_field_names"), list),
            f"DLQ fixture records observed field-name set as a list: {path}",
        )
        validator.check(
            isinstance(value.get("forbidden_field_names_detected"), list),
            f"DLQ fixture records forbidden field names as a list: {path}",
        )

    docs_text = "\n".join(read_text(path) for path in REQUIRED_DOCS if file_exists(path))
    for marker in DOC_MARKERS:
        validator.check(
            contains_casefold(docs_text, marker),
            f"M2-3 docs contain marker: {marker}",
        )

    checklist_paths = [
        path for path in REQUIRED_OPS_FILES if "/checklists/" in path and file_exists(path)
    ]
    checklist_text = "\n".join(read_text(path) for path in checklist_paths)
    for marker in CHECKLIST_MARKERS:
        validator.check(
            contains_casefold(checklist_text, marker),
            f"M2-3 checklists contain stop-condition marker: {marker}",
        )

    package_json_path = ROOT / "package.json"
    package_json = load_json_object("package.json") if package_json_path.is_file() else None
    validator.check(package_json is not None, "package.json is valid JSON")
    if package_json:
        scripts = package_json.get("scripts", {})
        validator.check(
            scripts.get("validate:m2-3:observability-contract")
            == "python3 scripts/validate_m2_3_observability_contract.py",
            "package.json includes validate:m2-3:observability-contract",
        )

    closure_path = "docs/m2_2_closure_summary_kr.md"
    validator.check(file_exists(closure_path), "M2-2 closure summary exists")
    if file_exists(closure_path):
        closure_text = read_text(closure_path)
        validator.check(
            contains_casefold(closure_text, "m2-3")
            and contains_casefold(closure_text, "observability / dlq / replay"),
            "M2-2 closure summary references M2-3 observability / DLQ / replay",
        )

    return validator.summary()


if __name__ == "__main__":
    sys.exit(main())
