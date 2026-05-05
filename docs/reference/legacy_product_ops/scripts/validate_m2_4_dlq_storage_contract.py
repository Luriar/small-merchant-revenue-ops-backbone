#!/usr/bin/env python3
"""Static validator for the M2-4 DLQ safe metadata storage contract."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]

REQUIRED_DOCS = [
    "docs/m2_4_dlq_safe_metadata_storage_design_kr.md",
    "docs/m2_4_kafka_dlq_topic_contract_kr.md",
]

REQUIRED_SQL = [
    "infra/sql/aurora/m2_4_dlq_replay_metadata.sql",
    "infra/sql/clickhouse/m2_4_dlq_replay_read_model.sql",
]

REQUIRED_FIXTURES = [
    "fixtures/m2_4_dlq_topic/clickhouse_parse_failure.json",
    "fixtures/m2_4_dlq_topic/forbidden_field_leakage.json",
    "fixtures/m2_4_dlq_topic/replay_requested.json",
]

REQUIRED_OPS_FILES = [
    "ops/m2_4_dlq_safe_metadata_storage/README.md",
    "ops/m2_4_dlq_safe_metadata_storage/templates/cdc_failure_record_template.md",
    "ops/m2_4_dlq_safe_metadata_storage/templates/replay_request_record_template.md",
    "ops/m2_4_dlq_safe_metadata_storage/checklists/storage_safety_review_checklist.md",
    "ops/m2_4_dlq_safe_metadata_storage/checklists/replay_state_transition_checklist.md",
]

REQUIRED_SAFE_METADATA_FIELDS = {
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

SUSPICIOUS_KEYS_OR_COLUMNS = {
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
    "metadata-only",
    "Aurora source of truth",
    "Kafka DLQ topic",
    "ClickHouse read model",
    "replay is not raw message replay by default",
    "new run row",
    "idempotency",
    "evidence_report_ref",
    "no raw payloads",
    "no full message bodies",
]

SQL_PROPOSAL_MARKER = "PROPOSAL ONLY - DO NOT APPLY AUTOMATICALLY"


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


def load_json_object(relative_path: str) -> dict[str, Any] | None:
    try:
        value = json.loads(read_text(relative_path))
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


def strip_sql_comments(sql: str) -> str:
    without_block_comments = re.sub(r"/\*.*?\*/", "", sql, flags=re.S)
    lines = []
    for line in without_block_comments.splitlines():
        lines.append(line.split("--", 1)[0])
    return "\n".join(lines)


def find_suspicious_sql_terms(sql: str) -> list[str]:
    uncommented_sql = strip_sql_comments(sql)
    found = []
    for term in sorted(SUSPICIOUS_KEYS_OR_COLUMNS):
        if re.search(rf"\b{re.escape(term)}\b", uncommented_sql, flags=re.I):
            found.append(term)
    return found


def contains_casefold(text: str, marker: str) -> bool:
    return marker.casefold() in text.casefold()


def main() -> int:
    validator = Validator()

    for relative_path in REQUIRED_DOCS:
        validator.check(file_exists(relative_path), f"required doc exists: {relative_path}")

    for relative_path in REQUIRED_SQL:
        validator.check(file_exists(relative_path), f"required SQL proposal exists: {relative_path}")
        if not file_exists(relative_path):
            continue
        sql = read_text(relative_path)
        validator.check(
            SQL_PROPOSAL_MARKER in sql,
            f"SQL proposal marker is present: {relative_path}",
        )
        suspicious_terms = find_suspicious_sql_terms(sql)
        validator.check(
            not suspicious_terms,
            f"SQL proposal avoids suspicious raw-storage columns outside comments: {relative_path}",
        )

    for relative_path in REQUIRED_FIXTURES:
        validator.check(file_exists(relative_path), f"required M2-4 DLQ fixture exists: {relative_path}")
        value = load_json_object(relative_path) if file_exists(relative_path) else None
        validator.check(value is not None, f"M2-4 DLQ fixture is valid JSON object: {relative_path}")
        if value is None:
            continue

        missing = sorted(REQUIRED_SAFE_METADATA_FIELDS - set(value))
        validator.check(
            not missing,
            f"M2-4 DLQ fixture includes required safe metadata fields: {relative_path}",
        )

        suspicious_keys = sorted(collect_keys(value) & SUSPICIOUS_KEYS_OR_COLUMNS)
        validator.check(
            not suspicious_keys,
            f"M2-4 DLQ fixture avoids suspicious raw keys recursively: {relative_path}",
        )

        validator.check(
            isinstance(value.get("observed_field_names"), list),
            f"M2-4 DLQ fixture records observed field-name set as list: {relative_path}",
        )
        validator.check(
            isinstance(value.get("forbidden_field_names_detected"), list),
            f"M2-4 DLQ fixture records forbidden field names as list: {relative_path}",
        )

    for relative_path in REQUIRED_OPS_FILES:
        validator.check(file_exists(relative_path), f"required ops template/checklist exists: {relative_path}")

    docs_text = "\n".join(read_text(path) for path in REQUIRED_DOCS if file_exists(path))
    for marker in DOC_MARKERS:
        validator.check(
            contains_casefold(docs_text, marker),
            f"M2-4 docs contain marker: {marker}",
        )

    ops_text = "\n".join(read_text(path) for path in REQUIRED_OPS_FILES if file_exists(path))
    for marker in [
        "safe metadata only",
        "no raw payloads",
        "no full message bodies",
        "idempotency key",
        "Replay creates a new run row",
        "cleanup/evidence report linkage",
    ]:
        validator.check(
            contains_casefold(ops_text, marker),
            f"M2-4 ops package contains marker: {marker}",
        )

    package_json = load_json_object("package.json") if file_exists("package.json") else None
    validator.check(package_json is not None, "package.json is valid JSON")
    if package_json:
        scripts = package_json.get("scripts", {})
        validator.check(
            scripts.get("validate:m2-4:dlq-storage-contract")
            == "python3 scripts/validate_m2_4_dlq_storage_contract.py",
            "package.json includes validate:m2-4:dlq-storage-contract",
        )

    m2_3_doc = "docs/m2_3_observability_dlq_replay_contract_kr.md"
    validator.check(file_exists(m2_3_doc), "M2-3 contract doc exists")
    if file_exists(m2_3_doc):
        text = read_text(m2_3_doc)
        validator.check(
            contains_casefold(text, "M2-4")
            and contains_casefold(text, "safe metadata storage design"),
            "M2-3 contract references M2-4 safe metadata storage design",
        )

    return validator.summary()


if __name__ == "__main__":
    sys.exit(main())
