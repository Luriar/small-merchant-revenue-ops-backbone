#!/usr/bin/env python3
"""Validate M2-9A live DB preflight GO evidence.

This validator only checks documentation structure. It does not connect to any
database, does not run SQL, and does not run runtime dry-runs. It enforces that
the GO evidence set is structurally complete, that forbidden values are absent,
and that the existing NO-GO records have not been deleted.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

GO_DOCS = [
    "docs/m2_9a_live_db_preflight_go_evidence_kr.md",
    "docs/m2_9a_live_db_target_evidence_kr.md",
    "docs/m2_9a_schema_inspection_report_kr.md",
    "docs/m2_9a_sql_apply_go_no_go_decision_kr.md",
    "docs/m2_9a_runtime_dry_run_bounds_kr.md",
]

NO_GO_DOCS = [
    "docs/m2_9a_live_db_preflight_gate_kr.md",
    "docs/m2_9a_live_db_no_go_decision_record_kr.md",
    "docs/m2_9a_rollback_plan_kr.md",
]

PACKAGE_SCRIPT = "validate:m2-9a:live-db-go"
SQL_FILE = "infra/sql/aurora/m2_4_dlq_replay_metadata.sql"

EXPECTED_TABLES = [
    "public.cdc_failure",
    "public.cdc_replay_request",
    "public.cdc_failure_state_log",
]

REQUIRED_MARKERS = [
    ("dev/staging/non-production classification", "non-production"),
    ("source of classification cites infra/terraform/envs/dev", "infra/terraform/envs/dev"),
    ("cleanup owner recorded", "Cleanup owner: Yoon Joonho"),
    ("rollback owner recorded", "Rollback owner: Yoon Joonho"),
    (
        "evidence_report_ref recorded",
        "evidence_report_ref: docs/runtime_evidence/m2_9_dev_dry_run_20260504.md",
    ),
    ("bounded time-window recorded", "10 minutes"),
    ("read-only inspection marker", "inspection was read-only: yes"),
    ("operator-run inspection marker", "inspection command run by human operator: yes"),
    ("safe DB label recorded", "product-ops-dev-aurora"),
    ("safe migration role label recorded", "app_migration_dev_role"),
    ("server version safe summary", "PostgreSQL 15.17"),
    ("current_database safe label", "current_database safe label: productops"),
    ("current_user safe label", "current_user safe label: postgres"),
    ("current_schema safe label", "current_schema safe label: public"),
    ("explicit no-production confirmation", "Confirmed non-production and not shared with production"),
    ("no raw payload confirmation", "No raw payload exposure: confirmed"),
    ("no full message body confirmation", "No full message body exposure: confirmed"),
    ("no issue raw values confirmation", "No issue raw values exposure: confirmed"),
    ("no prod_change exposure confirmation", "No prod_change payload/actor exposure: confirmed"),
    (
        "no secrets/tokens/DB URL confirmation",
        "No secrets / tokens / DB URL / connection string in docs: confirmed",
    ),
    ("reviewed rollback procedure marker", "rollback procedure"),
    ("rollback procedure path cited", "docs/m2_9a_rollback_plan_kr.md"),
    ("verification query set marker", "verification query"),
    ("SQL apply not performed", "SQL apply has not been performed"),
    ("runtime dry-run not executed", "Runtime dry-run has not been executed"),
    ("0 of 10 expected indexes present", "0 of 10 expected indexes present"),
    ("0 of 15 expected constraints present", "0 of 15 expected constraints present"),
]

# Patterns that must NOT appear in GO docs. Each entry is (label, compiled regex).
FORBIDDEN_VALUE_PATTERNS = [
    ("DB URL with postgres scheme", re.compile(r"postgres(?:ql)?://", re.IGNORECASE)),
    ("JDBC postgres URL", re.compile(r"jdbc:postgresql://", re.IGNORECASE)),
    (
        "URL with embedded userinfo credential",
        re.compile(r"://[A-Za-z0-9_.\-]+:[^/\s@]+@"),
    ),
    (
        "password assignment",
        re.compile(r"\bpassword\s*[:=]\s*[\"']?[A-Za-z0-9]", re.IGNORECASE),
    ),
    (
        "aws_access_key_id assignment",
        re.compile(r"\baws_access_key_id\s*[:=]\s*[\"']?[A-Za-z0-9]", re.IGNORECASE),
    ),
    (
        "aws_secret_access_key assignment",
        re.compile(r"\baws_secret_access_key\s*[:=]\s*[\"']?[A-Za-z0-9]", re.IGNORECASE),
    ),
    ("AWS access key id (AKIA)", re.compile(r"\bAKIA[A-Z0-9]{12,}")),
    ("AWS STS key id (ASIA)", re.compile(r"\bASIA[A-Z0-9]{12,}")),
    ("JWT-like token", re.compile(r"\beyJ[A-Za-z0-9_\-]{8,}\.eyJ[A-Za-z0-9_\-]{8,}")),
    ("Bearer token header", re.compile(r"\bBearer\s+ey[A-Za-z0-9_\-]+", re.IGNORECASE)),
    (
        "Postgres host:port pattern",
        re.compile(r"@[A-Za-z0-9_.\-]+:5432\b"),
    ),
    (
        "RDS endpoint hostname",
        re.compile(r"\b[a-z0-9\-]+\.[a-z0-9\-]+\.rds\.amazonaws\.com\b", re.IGNORECASE),
    ),
    (
        "Aurora cluster endpoint hostname",
        re.compile(r"\b[a-z0-9\-]+\.cluster-[a-z0-9]+\.[a-z0-9\-]+\.rds\.amazonaws\.com\b", re.IGNORECASE),
    ),
    (
        "raw payload JSON value",
        re.compile(r"\"raw_payload\"\s*:\s*[\{\[\"]"),
    ),
    (
        "prod_change_payload JSON value",
        re.compile(r"\"prod_change_payload\"\s*:\s*[\{\[\"]"),
    ),
    (
        "prod_change_actor value",
        re.compile(r"\"prod_change_actor\"\s*:\s*\""),
    ),
    (
        "issue_raw JSON value",
        re.compile(r"\"issue_raw\"\s*:\s*[\{\[\"]"),
    ),
    (
        "message_body string value",
        re.compile(r"\"message_body\"\s*:\s*\""),
    ),
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


def parse_bounded_sample_count(text: str) -> int | None:
    """Extract the bounded sample-count integer from the GO docs.

    Accepts forms like 'Bounded sample-count: **1**' or 'bounded sample-count: 1'.
    Returns the integer if found, else None.
    """
    match = re.search(
        r"bounded sample-count[^0-9\n]*\**\s*(\d+)\s*\**",
        text,
        re.IGNORECASE,
    )
    if not match:
        return None
    try:
        return int(match.group(1))
    except ValueError:
        return None


def main() -> int:
    validator = Validator()

    for doc in GO_DOCS:
        validator.check(file_exists(doc), f"M2-9A GO doc exists: {doc}")

    for doc in NO_GO_DOCS:
        validator.check(file_exists(doc), f"M2-9A NO-GO record preserved: {doc}")

    validator.check(file_exists(SQL_FILE), "M2-4 CDC replay metadata SQL exists")
    validator.check(sql_is_proposal_only(), "M2-4 SQL remains proposal-only before apply")
    validator.check(package_has_script(), f"package.json has script: {PACKAGE_SCRIPT}")

    go_text = "\n".join(read_text(doc) for doc in GO_DOCS)
    # Normalize markdown decorations so markers match whether values are written
    # plain, in backticks, or bolded. Forbidden-value scans below run on the raw
    # text since DB URLs, tokens, and embedded credentials would not be wrapped
    # in markdown.
    go_text_normalized = go_text.replace("**", "").replace("`", "")
    go_text_cf = go_text_normalized.casefold()

    for label, marker in REQUIRED_MARKERS:
        validator.check(marker.casefold() in go_text_cf, f"GO docs contain marker: {label}")

    for table in EXPECTED_TABLES:
        validator.check(table in go_text, f"GO docs mention expected table: {table}")
        missing_marker = f"{table} existence: **missing**"
        validator.check(
            missing_marker in go_text,
            f"GO docs record table as missing before apply: {table}",
        )

    sample_count = parse_bounded_sample_count(go_text)
    validator.check(
        sample_count is not None,
        "GO docs contain a bounded sample-count integer",
    )
    if sample_count is not None:
        validator.check(
            1 <= sample_count <= 10,
            f"bounded sample-count is finite and small (got {sample_count}, expected 1..10)",
        )

    for label, pattern in FORBIDDEN_VALUE_PATTERNS:
        match = pattern.search(go_text)
        validator.check(match is None, f"GO docs do not contain forbidden pattern: {label}")

    return validator.summary()


if __name__ == "__main__":
    sys.exit(main())
