#!/usr/bin/env python3
"""Global M2 raw-field safety scanner.

The scanner is intentionally scoped to M2 artifacts and proposals:
docs/m2_*, fixtures/m2_*, M2 SQL proposals, M2 OpenAPI proposal, ops/m2_*,
and the CDC recovery skeleton. Baseline source documents are not treated as
M2 implementation artifacts.
"""

from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]

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
}

TEXT_ALLOW_CONTEXT = [
    "absent",
    "not present",
    "not projected",
    "forbidden",
    "do-not-record",
    "do not",
    "must not",
    "must never",
    "no raw",
    "no full",
    "no issue",
    "no prod_change",
    "no secret",
    "without raw",
    "raw payload dump",
    "raw payload value",
    "raw opaque",
    "raw jsonb",
    "raw failed",
    "redact",
    "redaction",
    "leakage",
    "prevent",
    "strip",
    "stripping",
    "exclude",
    "not returned",
    "not include",
    "not be serialized",
    "not part of",
    "safe metadata",
    "safe subset",
    "request body",
    "response body",
    "credentials",
    "call-site identity",
    "may contain",
    "suspicious",
    "check",
    "review",
    "stop",
    "pass/fail",
    "확인",
    "검토",
    "제외",
    "금지",
    "없",
    "보류",
    "판정",
    "오염",
    "위험",
    "기록하지",
    "출력",
    "실제",
    "중단",
]

OPENAPI_PATCH = Path("sources/openapi_m2_5_dlq_replay_patch.yaml")

TEXT_EXTENSIONS = {".md", ".yaml", ".yml", ".sql", ".js"}

ALLOWED_JSON_KEYS_BY_PATH = {
    "fixtures/m2_1_cdc/prod_change_create.json": {"title"},
    "fixtures/m2_1_cdc/prod_change_delete.json": {"title"},
}

ALLOWED_SQL_COLUMNS_BY_PATH = {
    "infra/sql/aurora/m2_1_traceability_publication.sql": {"title"},
    "infra/sql/clickhouse/m2_1_traceability_cdc.sql": {"title"},
}


@dataclass(frozen=True)
class Finding:
    relative_path: str
    line_number: int
    category: str
    detail: str


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


def discover_files() -> list[Path]:
    files: list[Path] = []
    files.extend(sorted((ROOT / "docs").glob("m2_*.md")))
    files.extend(sorted((ROOT / "fixtures").glob("m2_*/*.json")))
    if (ROOT / OPENAPI_PATCH).is_file():
        files.append(ROOT / OPENAPI_PATCH)
    files.extend(sorted((ROOT / "infra/sql/aurora").glob("m2_*.sql")))
    files.extend(sorted((ROOT / "infra/sql/clickhouse").glob("m2_*.sql")))
    files.extend(path for path in sorted((ROOT / "ops").glob("m2_*/**/*")) if path.is_file())
    cdc_recovery = ROOT / "apps/api/src/cdc-recovery"
    if cdc_recovery.is_dir():
        files.extend(path for path in sorted(cdc_recovery.glob("*")) if path.is_file())
    return [path for path in files if path.suffix in TEXT_EXTENSIONS or path.suffix == ".json"]


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def load_json(path: Path) -> Any | None:
    try:
        return json.loads(read_text(path))
    except json.JSONDecodeError:
        return None


def collect_json_key_findings(path: Path, value: Any, trail: tuple[str, ...] = ()) -> list[Finding]:
    findings: list[Finding] = []
    allowed_keys = ALLOWED_JSON_KEYS_BY_PATH.get(relative(path), set())
    if isinstance(value, dict):
        for key, child in value.items():
            key_text = str(key)
            if key_text in SUSPICIOUS_KEYS and key_text not in allowed_keys:
                findings.append(Finding(
                    relative(path),
                    1,
                    "json object key",
                    ".".join((*trail, key_text)),
                ))
            findings.extend(collect_json_key_findings(path, child, (*trail, key_text)))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            findings.extend(collect_json_key_findings(path, item, (*trail, str(index))))
    return findings


def strip_sql_comments(text: str) -> str:
    without_block = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    lines = []
    for line in without_block.splitlines():
        lines.append(line.split("--", 1)[0])
    return "\n".join(lines)


def sql_column_findings(path: Path, text: str) -> list[Finding]:
    findings: list[Finding] = []
    allowed_columns = ALLOWED_SQL_COLUMNS_BY_PATH.get(relative(path), set())
    uncommented = strip_sql_comments(text)
    for line_number, line in enumerate(uncommented.splitlines(), start=1):
        stripped = line.strip()
        if not stripped:
            continue
        for term in sorted(SUSPICIOUS_KEYS):
            if term in allowed_columns:
                continue
            if re.match(rf"^(?:`|\")?{re.escape(term)}(?:`|\")?\s+", stripped, flags=re.I):
                findings.append(Finding(relative(path), line_number, "SQL column definition", stripped))
    return findings


def openapi_property_findings(path: Path, text: str) -> list[Finding]:
    findings: list[Finding] = []
    properties_indent: int | None = None
    for line_number, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        indent = len(line) - len(line.lstrip(" "))
        if stripped == "properties:":
            properties_indent = indent
            continue
        if properties_indent is not None and indent <= properties_indent:
            properties_indent = None
        if properties_indent is None:
            continue
        for term in sorted(SUSPICIOUS_KEYS):
            if re.match(rf"^{re.escape(term)}\s*:", stripped, flags=re.I):
                findings.append(Finding(relative(path), line_number, "OpenAPI schema property", stripped))
    return findings


def runtime_output_key_findings(path: Path, text: str) -> list[Finding]:
    findings: list[Finding] = []
    if not relative(path).startswith("apps/api/src/cdc-recovery/"):
        return findings

    for line_number, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()
        if not stripped or stripped.startswith("//"):
            continue
        if is_explicit_forbidden_constant_line(stripped):
            continue
        for term in sorted(SUSPICIOUS_KEYS):
            object_key_pattern = rf"(?:^|[{{,]\s*){re.escape(term)}\s*:"
            property_set_pattern = rf"\.{re.escape(term)}\s*="
            if re.search(object_key_pattern, stripped) or re.search(property_set_pattern, stripped):
                findings.append(Finding(relative(path), line_number, "runtime skeleton output key", stripped))
    return findings


def text_context_findings(path: Path, text: str) -> list[Finding]:
    findings: list[Finding] = []
    if path.suffix in {".json", ".sql"} or relative(path) == OPENAPI_PATCH.as_posix():
        return findings

    for line_number, line in enumerate(text.splitlines(), start=1):
        lowered = line.casefold()
        matching_terms = [
            term
            for term in sorted(SUSPICIOUS_KEYS)
            if re.search(rf"(?<![A-Za-z0-9_]){re.escape(term)}(?![A-Za-z0-9_])", lowered)
        ]
        if not matching_terms:
            continue
        if path.suffix == ".md" and not is_doc_leakage_surface_line(lowered):
            continue
        if any(marker in lowered for marker in TEXT_ALLOW_CONTEXT):
            continue
        if is_explicit_forbidden_constant_line(lowered.strip()):
            continue
        if is_route_or_http_label(lowered.strip()):
            continue
        if matching_terms == ["endpoint"]:
            continue
        findings.append(Finding(relative(path), line_number, "suspicious term context", line.strip()))
    return findings


def is_doc_leakage_surface_line(lowered: str) -> bool:
    leakage_surface_markers = [
        "allowed response field",
        "api response field",
        "storage field",
        "fixture data key",
        "dto output",
        "returned field",
        "response field:",
        "schema property",
        "sql column",
    ]
    return any(marker in lowered for marker in leakage_surface_markers)


def is_explicit_forbidden_constant_line(stripped: str) -> bool:
    return any(
        stripped in {
            f'"{term}",',
            f'"{term}"',
            f"'{term}',",
            f"'{term}'",
            f"- `{term}`",
            f"- {term}",
            f"`{term}`",
            term,
        }
        for term in SUSPICIOUS_KEYS
    )


def is_route_or_http_label(stripped: str) -> bool:
    return (
        stripped.startswith("endpoint:")
        or stripped.startswith("endpoint examples")
        or stripped.startswith("planned routes")
        or stripped.startswith("- body:")
        or stripped.startswith("- `get /api/")
        or stripped.startswith("- `post /api/")
        or stripped.startswith("- `patch /api/")
        or stripped.startswith("`get /api/")
        or stripped.startswith("`post /api/")
        or stripped.startswith("`patch /api/")
    )


def group_findings(findings: Iterable[Finding]) -> dict[str, list[Finding]]:
    grouped: dict[str, list[Finding]] = {}
    for finding in findings:
        grouped.setdefault(finding.relative_path, []).append(finding)
    return grouped


def main() -> int:
    validator = Validator()
    files = discover_files()
    validator.check(bool(files), "M2 safety scanner discovered scoped files")

    findings: list[Finding] = []
    scanned_json = 0
    scanned_openapi = 0
    scanned_sql = 0
    scanned_runtime = 0

    for path in files:
        text = read_text(path)
        if path.suffix == ".json":
            scanned_json += 1
            value = load_json(path)
            if value is None:
                findings.append(Finding(relative(path), 1, "invalid JSON", "file is not valid JSON"))
            else:
                findings.extend(collect_json_key_findings(path, value))
            continue

        if relative(path) == OPENAPI_PATCH.as_posix():
            scanned_openapi += 1
            findings.extend(openapi_property_findings(path, text))

        if path.suffix == ".sql":
            scanned_sql += 1
            findings.extend(sql_column_findings(path, text))

        if relative(path).startswith("apps/api/src/cdc-recovery/") and path.suffix == ".js":
            scanned_runtime += 1
            findings.extend(runtime_output_key_findings(path, text))

        findings.extend(text_context_findings(path, text))

    validator.check(scanned_json > 0, "scanner checked M2 JSON fixtures")
    validator.check(scanned_openapi > 0, "scanner checked M2 OpenAPI proposal")
    validator.check(scanned_sql > 0, "scanner checked M2 SQL proposals")
    validator.check(scanned_runtime > 0, "scanner checked CDC recovery skeleton files")

    grouped = group_findings(findings)
    if grouped:
        print("\nFindings:")
        for file_path, file_findings in sorted(grouped.items()):
            print(f"- {file_path}")
            for finding in file_findings:
                print(f"  line {finding.line_number}: {finding.category}: {finding.detail}")

    validator.check(not findings, "no unsafe raw-field leakage findings in scoped M2 artifacts")

    return validator.summary()


if __name__ == "__main__":
    sys.exit(main())
