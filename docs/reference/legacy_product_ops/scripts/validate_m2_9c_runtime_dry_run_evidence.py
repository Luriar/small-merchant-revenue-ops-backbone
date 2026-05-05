#!/usr/bin/env python3
"""Validate M2-9C controlled runtime dry-run evidence.

This validator only checks documentation structure. It does not connect to any
database, does not run SQL, and does not execute the dry-run. It enforces that
the M2-9C evidence set is structurally complete, that forbidden values are
absent, and that the M2-9A GO state and M2-9B SQL apply state are preserved.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

M2_9C_DOCS = [
    "docs/m2_9c_runtime_feasibility_check_kr.md",
    "docs/m2_9c_synthetic_input_plan_kr.md",
    "docs/m2_9c_controlled_runtime_dry_run_evidence_kr.md",
    "docs/m2_9c_runtime_decision_record_kr.md",
    "docs/m2_9c_runtime_cleanup_report_kr.md",
]

RUNTIME_EVIDENCE_REPORT = "docs/runtime_evidence/m2_9_dev_dry_run_20260504.md"
M2_9C_DRY_RUN_SCRIPT = "scripts/m2_9c_dry_run.js"

M2_9B_DOCS = [
    "docs/m2_9b_rollback_sql_review_kr.md",
    "docs/m2_9b_sql_apply_evidence_kr.md",
    "docs/m2_9b_sql_apply_decision_record_kr.md",
    "docs/m2_9b_schema_verification_report_kr.md",
]
M2_9B_ROLLBACK_SQL = "infra/sql/aurora/m2_4_dlq_replay_metadata_rollback.sql"

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

M2_4_FORWARD_SQL = "infra/sql/aurora/m2_4_dlq_replay_metadata.sql"
MAIN_OPENAPI = "sources/personal_project_openapi_v0_2.yaml"
M2_5_PROPOSAL_PATCH = "sources/openapi_m2_5_dlq_replay_patch.yaml"

PACKAGE_SCRIPT = "validate:m2-9c:runtime-dry-run-evidence"

REQUIRED_MARKERS = [
    ("target safe label recorded", "product-ops-dev-aurora"),
    ("target classified as dev", "Target environment: dev"),
    ("sample-count is 1", "Sample-count: 1"),
    ("time-window is 10 minutes", "Time-window: 10 minutes"),
    (
        "evidence_report_ref recorded",
        "evidence_report_ref: docs/runtime_evidence/m2_9_dev_dry_run_20260504.md",
    ),
    ("runtime dry-run was executed in M2-9C", "Runtime dry-run was executed in M2-9C"),
    ("execution path repository-level", "Repository-level controlled dry-run"),
    ("M2-8O Aurora repository", "M2-8O Aurora repository"),
    ("synthetic failure id pattern", "m2_9c_dryrun_<ts>_failure"),
    ("synthetic idempotency key pattern", "m2_9c_dryrun_<ts>_idem"),
    ("identity safe summary db", "current_database: productops"),
    ("identity safe summary user", "current_user: postgres"),
    ("identity safe summary schema", "current_schema: public"),
    ("replay request creation passed", "Replay request creation"),
    ("idempotency duplicate lookup passed", "Idempotency duplicate lookup"),
    ("idempotency conflict rejected", "Idempotency conflict rejected"),
    ("state log append passed", "State log append"),
    ("valid failure transition passed", "Valid failure transition"),
    ("invalid failure transition rejected", "Invalid failure transition rejected"),
    ("valid replay request transition passed", "Valid replay request transition"),
    (
        "invalid replay request transition rejected",
        "Invalid replay request transition rejected",
    ),
    ("repository-level vs route-level note", "Repository-Level Rejection vs Route-Level 409"),
    ("cleanup is complete", "Cleanup complete: yes"),
    (
        "post-cleanup counts 0/0/0",
        "Post-cleanup row counts for the synthetic",
    ),
    ("post-cleanup f=0", "cdc_failure: 0"),
    ("post-cleanup rr=0", "cdc_replay_request: 0"),
    ("post-cleanup sl=0", "cdc_failure_state_log: 0"),
    ("elapsed within bound", "Elapsed: 671 ms"),
    ("within 10-minute bound", "Within 10-minute time-window: yes"),
    ("rollback was not needed", "Rollback was not needed"),
    ("rollback was not executed", "Rollback executed: no"),
    ("no production DB used", "No production DB was used"),
    ("no Kafka", "No Kafka"),
    ("no Debezium", "No Debezium"),
    ("no ClickHouse", "No ClickHouse"),
    ("no full pipeline", "no full pipeline"),
    (
        "production guard false-positive repair documented",
        "Production Guard False-Positive Repair",
    ),
    ("explicit allowlist via M2_9C_ALLOWED_DATABASE", "M2_9C_ALLOWED_DATABASE"),
    (
        "dev-only SSL verification bypass documented",
        "Dev-Only SSL Verification Bypass",
    ),
    ("M2-9B schema verification passed", "M2-9B schema verification passed"),
    ("M2-9B 3 of 3 tables", "3/3 M2-4 tables present"),
    ("M2-9B 10 of 10 indexes", "10/10 named indexes present"),
    ("M2-9B 15 of 15 named constraints", "15/15 named check/unique constraints present"),
    ("cleanup owner Yoon Joonho", "Cleanup owner: Yoon Joonho"),
    ("rollback owner Yoon Joonho", "Rollback owner: Yoon Joonho"),
    ("forward SQL not modified", "infra/sql/aurora/m2_4_dlq_replay_metadata.sql"),
    ("forward SQL retains PROPOSAL ONLY", "PROPOSAL ONLY - DO NOT APPLY AUTOMATICALLY"),
]

# Forbidden value patterns. Includes the M2-9B set plus M2-9C-specific
# additions for connection env vars, loopback IPs, and explicit port-forward
# patterns. Tightened so docs cannot accidentally leak the operator's
# transport configuration.
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
    ("IAM role ARN", re.compile(r"\barn:aws:iam::\d{12}:role/", re.IGNORECASE)),
    ("SQLSTATE leaked", re.compile(r"\bSQLSTATE\s*[:=]\s*[0-9A-Z]{5}\b")),
    # M2-9C additions: connection-env-var assignments, loopback, host:port pairs.
    (
        "PG connection env var assignment",
        re.compile(
            r"\bPG(?:HOST|PORT|USER|PASSWORD|DATABASE|SSLMODE|SSLROOTCERT|CONNECTION)\s*=",
            re.IGNORECASE,
        ),
    ),
    (
        "DATABASE_URL assignment",
        re.compile(r"\bDATABASE_URL\s*=", re.IGNORECASE),
    ),
    (
        "NODE_TLS_REJECT_UNAUTHORIZED literal",
        re.compile(r"\bNODE_TLS_REJECT_UNAUTHORIZED\s*=", re.IGNORECASE),
    ),
    (
        "loopback IP",
        re.compile(r"\b127\.0\.0\.1\b"),
    ),
    (
        "literal 5432 port",
        re.compile(r"\b:5432\b"),
    ),
    (
        "literal 15432 port",
        re.compile(r"\b:15432\b"),
    ),
    (
        "any IPv4 address",
        re.compile(r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b"),
    ),
]

OPENAPI_M2_8M_MARKERS = [
    "CDC Recovery",
    "/api/v1/cdc/failures",
    "/api/v1/cdc/replay-requests",
    "CdcErrorResponse",
]

# Markers that prove M2-9B and M2-9A state preserved. Reused from those
# validators' required structural surface so a regression in M2-9B / M2-9A
# would also fail M2-9C.
M2_9B_PRESERVATION_MARKERS = [
    "Schema verification decision: **passed**",
    "Expected: 3. Observed: 3. Missing: 0",
    "Expected: 10. Observed: 10. Missing: 0",
    "Expected named constraints: 15. Observed named constraints: 15. Missing: 0",
    "24 total constraints",
    "Apply outcome: succeeded",
    "Rollback executed: no",
]
M2_9A_GO_PRESERVATION_MARKERS = [
    "Decision: GO for proceeding to **M2-9B SQL apply readiness**",
    "Confirmed non-production and not shared with production",
    "infra/terraform/envs/dev",
    "Cleanup owner: Yoon Joonho",
    "Rollback owner: Yoon Joonho",
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


def main() -> int:
    validator = Validator()

    for doc in M2_9C_DOCS:
        validator.check(file_exists(doc), f"M2-9C doc exists: {doc}")
    validator.check(
        file_exists(RUNTIME_EVIDENCE_REPORT),
        f"runtime evidence report exists: {RUNTIME_EVIDENCE_REPORT}",
    )
    validator.check(
        file_exists(M2_9C_DRY_RUN_SCRIPT),
        f"M2-9C dry-run script exists: {M2_9C_DRY_RUN_SCRIPT}",
    )
    validator.check(package_has_script(), f"package.json has script: {PACKAGE_SCRIPT}")

    # M2-9B preservation
    for doc in M2_9B_DOCS:
        validator.check(file_exists(doc), f"M2-9B doc preserved: {doc}")
    validator.check(
        file_exists(M2_9B_ROLLBACK_SQL),
        f"M2-9B rollback SQL preserved: {M2_9B_ROLLBACK_SQL}",
    )
    m2_9b_text = "\n".join(read_text(doc) for doc in M2_9B_DOCS)
    m2_9b_text_normalized = m2_9b_text.replace("**", "").replace("`", "")
    for marker in M2_9B_PRESERVATION_MARKERS:
        marker_normalized = marker.replace("**", "").replace("`", "")
        validator.check(
            marker_normalized in m2_9b_text_normalized,
            f"M2-9B preservation marker present: {marker}",
        )

    # M2-9A GO and NO-GO preservation
    for doc in M2_9A_GO_DOCS:
        validator.check(file_exists(doc), f"M2-9A GO doc preserved: {doc}")
    for doc in M2_9A_NO_GO_DOCS:
        validator.check(file_exists(doc), f"M2-9A NO-GO record preserved: {doc}")
    m2_9a_go_text = "\n".join(read_text(doc) for doc in M2_9A_GO_DOCS)
    m2_9a_go_text_normalized = m2_9a_go_text.replace("**", "").replace("`", "")
    for marker in M2_9A_GO_PRESERVATION_MARKERS:
        marker_normalized = marker.replace("**", "").replace("`", "")
        validator.check(
            marker_normalized in m2_9a_go_text_normalized,
            f"M2-9A GO preservation marker present: {marker}",
        )

    # Forward SQL preserved
    forward_sql_text = read_text(M2_4_FORWARD_SQL)
    validator.check(
        "PROPOSAL ONLY - DO NOT APPLY AUTOMATICALLY" in forward_sql_text,
        "M2-4 forward SQL retains PROPOSAL ONLY marker",
    )

    # OpenAPI M2-8M state preserved
    main_openapi_text = read_text(MAIN_OPENAPI)
    for marker in OPENAPI_M2_8M_MARKERS:
        validator.check(
            marker in main_openapi_text,
            f"main OpenAPI retains M2-8M marker: {marker}",
        )
    validator.check(
        "PROPOSAL" in read_text(M2_5_PROPOSAL_PATCH),
        "M2-5 proposal patch retains PROPOSAL marker",
    )

    # M2-9C content scan: required markers and forbidden patterns.
    m2_9c_text = "\n".join(read_text(doc) for doc in M2_9C_DOCS) + "\n" + read_text(
        RUNTIME_EVIDENCE_REPORT
    )
    m2_9c_text_normalized = m2_9c_text.replace("**", "").replace("`", "")
    m2_9c_text_cf = m2_9c_text_normalized.casefold()

    for label, marker in REQUIRED_MARKERS:
        marker_normalized = marker.replace("**", "").replace("`", "")
        validator.check(
            marker_normalized.casefold() in m2_9c_text_cf,
            f"M2-9C docs contain marker: {label}",
        )

    for label, pattern in FORBIDDEN_VALUE_PATTERNS:
        match = pattern.search(m2_9c_text)
        validator.check(match is None, f"M2-9C docs do not contain forbidden pattern: {label}")

    return validator.summary()


if __name__ == "__main__":
    sys.exit(main())
