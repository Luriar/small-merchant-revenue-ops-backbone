#!/usr/bin/env python3
"""Validate M2-9B SQL apply evidence.

This validator only checks documentation structure. It does not connect to any
database, does not run SQL, and does not run runtime dry-runs. It enforces that
the M2-9B evidence set is structurally complete, that forbidden values are
absent, that the M2-9A GO state has not been broken, and that the OpenAPI
remains in M2-8M merged state with the M2-5 patch still proposal-only.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

M2_9B_DOCS = [
    "docs/m2_9b_rollback_sql_review_kr.md",
    "docs/m2_9b_sql_apply_evidence_kr.md",
    "docs/m2_9b_sql_apply_decision_record_kr.md",
    "docs/m2_9b_schema_verification_report_kr.md",
]

M2_9B_ROLLBACK_SQL = "infra/sql/aurora/m2_4_dlq_replay_metadata_rollback.sql"
M2_4_FORWARD_SQL = "infra/sql/aurora/m2_4_dlq_replay_metadata.sql"

M2_9A_GO_DOCS = [
    "docs/m2_9a_live_db_preflight_go_evidence_kr.md",
    "docs/m2_9a_live_db_target_evidence_kr.md",
    "docs/m2_9a_schema_inspection_report_kr.md",
    "docs/m2_9a_sql_apply_go_no_go_decision_kr.md",
    "docs/m2_9a_runtime_dry_run_bounds_kr.md",
]
M2_9A_NO_GO_DOCS = [
    "docs/m2_9a_live_db_preflight_gate_kr.md",
    "docs/m2_9a_live_db_no_go_decision_record_kr.md",
    "docs/m2_9a_rollback_plan_kr.md",
]

MAIN_OPENAPI = "sources/personal_project_openapi_v0_2.yaml"
M2_5_PROPOSAL_PATCH = "sources/openapi_m2_5_dlq_replay_patch.yaml"

PACKAGE_SCRIPT = "validate:m2-9b:sql-apply-evidence"

EXPECTED_TABLES = [
    "public.cdc_failure",
    "public.cdc_replay_request",
    "public.cdc_failure_state_log",
]

EXPECTED_INDEXES = [
    "idx_cdc_failure_status",
    "idx_cdc_failure_type",
    "idx_cdc_failure_source_topic",
    "idx_cdc_failure_owner",
    "idx_cdc_failure_first_seen_at",
    "idx_cdc_replay_failure",
    "idx_cdc_replay_status",
    "idx_cdc_replay_owner",
    "idx_cdc_replay_idempotency_key",
    "idx_cdc_failure_state_log_failure",
]

EXPECTED_NAMED_CONSTRAINTS = [
    "chk_cdc_failure_op",
    "chk_cdc_failure_attempt_count",
    "chk_cdc_failure_status",
    "chk_cdc_failure_primary_key_object",
    "chk_cdc_failure_observed_fields_array",
    "chk_cdc_failure_missing_fields_array",
    "chk_cdc_failure_unexpected_fields_array",
    "chk_cdc_failure_forbidden_fields_array",
    "chk_cdc_replay_action",
    "chk_cdc_replay_attempt_count",
    "chk_cdc_replay_status",
    "chk_cdc_replay_cleanup_status",
    "chk_cdc_replay_bounded_scope_object",
    "uq_cdc_replay_idempotency_key",
    "chk_cdc_failure_state_safe_metadata_object",
]

REQUIRED_MARKERS = [
    ("target classified as dev", "Target environment: dev"),
    ("safe DB label recorded", "product-ops-dev-aurora"),
    ("apply file path recorded", "infra/sql/aurora/m2_4_dlq_replay_metadata.sql"),
    ("apply outcome succeeded", "Apply outcome: succeeded"),
    ("SQL apply has been performed", "SQL apply has been performed"),
    ("runtime dry-run not executed", "Runtime dry-run has not been executed"),
    ("rollback prepared before apply", "Rollback prepared before apply: yes"),
    ("rollback executed status recorded", "Rollback executed: no"),
    ("rollback was not needed", "Rollback was not needed"),
    ("rollback SQL file path", "infra/sql/aurora/m2_4_dlq_replay_metadata_rollback.sql"),
    ("rollback owner recorded", "Rollback owner: Yoon Joonho"),
    ("cleanup owner recorded", "Cleanup owner: Yoon Joonho"),
    ("verification was read-only", "Verification was read-only: yes"),
    ("no production DB used", "No production DB was used"),
    ("schema verification decision passed", "Schema verification decision: **passed**"),
    ("table existence summary 3 of 3", "Expected: 3. Observed: 3. Missing: 0"),
    ("index existence summary 10 of 10", "Expected: 10. Observed: 10. Missing: 0"),
    (
        "named constraint summary 15 of 15",
        "Expected named constraints: 15. Observed named constraints: 15. Missing: 0",
    ),
    ("total constraints observed 24", "24 total constraints"),
    ("verification query correction documented", "Verification Query Correction"),
    (
        "no raw payload exposure confirmation",
        "No raw payload",
    ),
    (
        "no DB URL/credential exposure confirmation",
        "No DB URL",
    ),
    (
        "forward SQL not modified",
        "infra/sql/aurora/m2_4_dlq_replay_metadata.sql` was not modified",
    ),
    ("OpenAPI remains M2-8M merged", "main OpenAPI remains in M2-8M merged state"),
    (
        "M2-5 proposal patch retains proposal-only marker",
        "proposal-only patch `sources/openapi_m2_5_dlq_replay_patch.yaml` retains its proposal-only marker",
    ),
]

# Forbidden value patterns (same shape as the M2-9A GO validator).
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
    ("Postgres host:port pattern", re.compile(r"@[A-Za-z0-9_.\-]+:5432\b")),
    (
        "RDS endpoint hostname",
        re.compile(r"\b[a-z0-9\-]+\.[a-z0-9\-]+\.rds\.amazonaws\.com\b", re.IGNORECASE),
    ),
    (
        "Aurora cluster endpoint hostname",
        re.compile(
            r"\b[a-z0-9\-]+\.cluster-[a-z0-9]+\.[a-z0-9\-]+\.rds\.amazonaws\.com\b",
            re.IGNORECASE,
        ),
    ),
    ("raw payload JSON value", re.compile(r"\"raw_payload\"\s*:\s*[\{\[\"]")),
    ("prod_change_payload JSON value", re.compile(r"\"prod_change_payload\"\s*:\s*[\{\[\"]")),
    ("prod_change_actor value", re.compile(r"\"prod_change_actor\"\s*:\s*\"")),
    ("issue_raw JSON value", re.compile(r"\"issue_raw\"\s*:\s*[\{\[\"]")),
    ("message_body string value", re.compile(r"\"message_body\"\s*:\s*\"")),
    (
        "12-digit AWS account number",
        re.compile(r"\b(?:account[_\s\-]*id|aws_account)[^0-9]{0,8}\d{12}\b", re.IGNORECASE),
    ),
    (
        "IAM role ARN",
        re.compile(r"\barn:aws:iam::\d{12}:role/", re.IGNORECASE),
    ),
    (
        "SQLSTATE leaked",
        re.compile(r"\bSQLSTATE\s*[:=]\s*[0-9A-Z]{5}\b"),
    ),
]

# Markers that prove the main OpenAPI remains M2-8M merged. These are the
# additions the M2-8M closure introduced; they must remain present.
OPENAPI_M2_8M_MARKERS = [
    "CDC Recovery",
    "/api/v1/cdc/failures",
    "/api/v1/cdc/replay-requests",
    "CdcErrorResponse",
]

M2_5_PROPOSAL_MARKER = "PROPOSAL"


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


def forward_sql_is_proposal_only() -> bool:
    text = read_text(M2_4_FORWARD_SQL)
    return "PROPOSAL ONLY - DO NOT APPLY AUTOMATICALLY" in text


def main() -> int:
    validator = Validator()

    # Phase artifact existence.
    for doc in M2_9B_DOCS:
        validator.check(file_exists(doc), f"M2-9B doc exists: {doc}")
    validator.check(file_exists(M2_9B_ROLLBACK_SQL), f"M2-9B rollback SQL exists: {M2_9B_ROLLBACK_SQL}")
    validator.check(file_exists(M2_4_FORWARD_SQL), f"M2-4 forward SQL exists: {M2_4_FORWARD_SQL}")
    validator.check(forward_sql_is_proposal_only(), "M2-4 forward SQL retains PROPOSAL ONLY marker")
    validator.check(package_has_script(), f"package.json has script: {PACKAGE_SCRIPT}")

    # M2-9A GO state preserved.
    for doc in M2_9A_GO_DOCS:
        validator.check(file_exists(doc), f"M2-9A GO doc preserved: {doc}")
    for doc in M2_9A_NO_GO_DOCS:
        validator.check(file_exists(doc), f"M2-9A NO-GO record preserved: {doc}")

    # OpenAPI remains M2-8M merged state.
    main_openapi_text = read_text(MAIN_OPENAPI)
    validator.check(file_exists(MAIN_OPENAPI), f"main OpenAPI exists: {MAIN_OPENAPI}")
    for marker in OPENAPI_M2_8M_MARKERS:
        validator.check(
            marker in main_openapi_text,
            f"main OpenAPI retains M2-8M marker: {marker}",
        )

    # M2-5 proposal patch retains proposal-only marker.
    validator.check(file_exists(M2_5_PROPOSAL_PATCH), f"M2-5 proposal patch exists: {M2_5_PROPOSAL_PATCH}")
    validator.check(
        M2_5_PROPOSAL_MARKER in read_text(M2_5_PROPOSAL_PATCH),
        f"M2-5 proposal patch retains PROPOSAL marker",
    )

    # M2-9B doc content.
    m2_9b_text = "\n".join(read_text(doc) for doc in M2_9B_DOCS)
    # Markdown-decoration normalization for marker scans only (forbidden-value
    # scans run on raw text, since DB URLs and tokens would not be wrapped in
    # markdown decorations).
    m2_9b_text_normalized = m2_9b_text.replace("**", "").replace("`", "")
    m2_9b_text_cf = m2_9b_text_normalized.casefold()

    for label, marker in REQUIRED_MARKERS:
        marker_normalized = marker.replace("**", "").replace("`", "")
        validator.check(
            marker_normalized.casefold() in m2_9b_text_cf,
            f"M2-9B docs contain marker: {label}",
        )

    for table in EXPECTED_TABLES:
        validator.check(table in m2_9b_text, f"M2-9B docs mention expected table: {table}")
    for index in EXPECTED_INDEXES:
        validator.check(index in m2_9b_text, f"M2-9B docs mention expected index: {index}")
    for constraint in EXPECTED_NAMED_CONSTRAINTS:
        validator.check(
            constraint in m2_9b_text,
            f"M2-9B docs mention expected constraint: {constraint}",
        )

    # Forbidden values must not appear in M2-9B docs.
    for label, pattern in FORBIDDEN_VALUE_PATTERNS:
        match = pattern.search(m2_9b_text)
        validator.check(match is None, f"M2-9B docs do not contain forbidden pattern: {label}")

    return validator.summary()


if __name__ == "__main__":
    sys.exit(main())
