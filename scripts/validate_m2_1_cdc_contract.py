#!/usr/bin/env python3
"""Validate the static M2-1 CDC contract artifacts."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]

CLICKHOUSE_DDL = REPO_ROOT / "infra/sql/clickhouse/m2_1_traceability_cdc.sql"
CONNECTOR_JSON = REPO_ROOT / "infra/connectors/debezium/m2_1_traceability_connector.json"
PUBLICATION_SQL = REPO_ROOT / "infra/sql/aurora/m2_1_traceability_publication.sql"
RUNTIME_DRY_VALIDATION_DOC = REPO_ROOT / "docs/m2_1_cdc_runtime_dry_validation_kr.md"
CONTROLLED_RUNTIME_RUNBOOK = REPO_ROOT / "docs/m2_1_controlled_runtime_dry_run_kr.md"
EVIDENCE_REPORT_TEMPLATE = REPO_ROOT / "docs/m2_1_runtime_dry_run_evidence_report_template_kr.md"
FIXTURE_DIR = REPO_ROOT / "fixtures/m2_1_cdc"
LEGACY_CDC_ARTIFACTS = [
    REPO_ROOT / "sources/aurora_logical_replication.sql",
    REPO_ROOT / "sources/strimzi_connectors.yaml",
]

M2_1_TABLES = {"public.prod_change", "public.trace", "public.issue"}
M2_1_TOPIC_BY_TABLE = {
    "public.prod_change": "cdc.aurora.prod_change",
    "public.trace": "cdc.aurora.trace",
    "public.issue": "cdc.aurora.issue",
}
FORBIDDEN_PROD_CHANGE_COLUMNS = {
    "public.prod_change.payload",
    "public.prod_change.actor",
}
FORBIDDEN_ISSUE_COLUMNS = {
    "public.issue.title",
    "public.issue.body",
    "public.issue.payload",
    "public.issue.reporter",
}
FORBIDDEN_PROD_CHANGE_COLUMN_NAMES = {"payload", "actor"}
FORBIDDEN_ISSUE_COLUMN_NAMES = {"title", "body", "payload", "reporter"}
M2_1_CDC_TABLES = {
    "prod_change_cdc",
    "prod_change_cdc_kafka",
    "trace_cdc",
    "trace_cdc_kafka",
    "issue_cdc",
    "issue_cdc_kafka",
}
M2_1_MV_NAMES = {
    "mv_prod_change_cdc_to_target",
    "mv_trace_cdc_to_target",
    "mv_issue_cdc_to_target",
}
FIXTURE_CONTRACTS = {
    "prod_change_create.json": ("prod_change_cdc_kafka", "c", FORBIDDEN_PROD_CHANGE_COLUMN_NAMES),
    "prod_change_delete.json": ("prod_change_cdc_kafka", "d", FORBIDDEN_PROD_CHANGE_COLUMN_NAMES),
    "trace_create.json": ("trace_cdc_kafka", "c", set()),
    "trace_delete.json": ("trace_cdc_kafka", "d", set()),
    "issue_create.json": ("issue_cdc_kafka", "c", FORBIDDEN_ISSUE_COLUMN_NAMES),
    "issue_delete.json": ("issue_cdc_kafka", "d", FORBIDDEN_ISSUE_COLUMN_NAMES),
}
TARGET_ONLY_COLUMNS = {"_op", "_ts_ms", "_deleted", "_ingested_at"}
LEGACY_WARNING_MARKERS = [
    "not m2-1 contract source",
    "do not apply this file for m2-1",
    "infra/sql/aurora/m2_1_traceability_publication.sql",
    "infra/connectors/debezium/m2_1_traceability_connector.json",
]
DELETE_RUNTIME_CAVEAT_MARKERS = [
    "delete fixtures are parsing target-shape fixtures",
    "not proof that runtime debezium delete messages include all non-key columns",
    "replica identity default",
]
CONTROLLED_RUNTIME_RUNBOOK_MARKERS = [
    "not production rollout",
    "bounded kafka sample inspection",
    "forbidden field leakage check",
    "clickhouse jsoneachrow parsing",
    "delete rewrite verification",
    "replica identity default verification",
    "rollback and cleanup checklist",
    "do not record raw payloads",
    "stop immediately if publication contains for all tables",
    "stop immediately if prod_change.payload or prod_change.actor appears",
    "stop immediately if issue.title/body/payload/reporter appears",
    "stop immediately if anyone proposes replica identity full as a quick fix without review",
]
EVIDENCE_REPORT_TEMPLATE_MARKERS = [
    "report metadata",
    "validation command results",
    "forbidden field leakage result",
    "post-smt field shape result",
    "delete rewrite verification result",
    "replica identity default runtime observation",
    "cleanup completion result",
    "final pass/fail decision",
    "do not record raw payloads",
    "do not record full message bodies",
    "do not record secrets",
    "field-name sets",
    "sampled message counts",
    "yes/no leakage result",
]


def split_csv(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def strip_sql_comments(sql: str) -> str:
    sql = re.sub(r"/\*.*?\*/", "", sql, flags=re.DOTALL)
    return re.sub(r"--.*?$", "", sql, flags=re.MULTILINE)


def find_matching_paren(text: str, open_index: int) -> int:
    depth = 0
    in_single_quote = False
    i = open_index
    while i < len(text):
        char = text[i]
        if char == "'" and (i == 0 or text[i - 1] != "\\"):
            in_single_quote = not in_single_quote
        elif not in_single_quote:
            if char == "(":
                depth += 1
            elif char == ")":
                depth -= 1
                if depth == 0:
                    return i
        i += 1
    raise ValueError("unbalanced parentheses")


def extract_create_table_columns(sql: str, table_name: str) -> set[str]:
    pattern = re.compile(
        rf"CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+{re.escape(table_name)}\s*\(",
        re.IGNORECASE,
    )
    match = pattern.search(sql)
    if not match:
        raise ValueError(f"CREATE TABLE block not found for {table_name}")

    open_index = sql.find("(", match.start())
    close_index = find_matching_paren(sql, open_index)
    block = sql[open_index + 1 : close_index]

    columns: set[str] = set()
    ignored_prefixes = {
        "INDEX",
        "CONSTRAINT",
        "PRIMARY",
        "UNIQUE",
        "KEY",
        "FOREIGN",
        "CHECK",
    }
    for raw_line in block.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("--"):
            continue
        token = line.split(None, 1)[0].rstrip(",").strip('"`')
        if token.upper() in ignored_prefixes:
            continue
        columns.add(token.lower())
    return columns


def extract_kafka_topics(sql: str) -> set[str]:
    return set(re.findall(r"kafka_topic_list\s*=\s*'([^']+)'", sql, flags=re.IGNORECASE))


def extract_mv_block(sql: str, mv_name: str) -> str:
    pattern = re.compile(
        rf"CREATE\s+MATERIALIZED\s+VIEW\s+IF\s+NOT\s+EXISTS\s+{re.escape(mv_name)}\b",
        re.IGNORECASE,
    )
    match = pattern.search(sql)
    if not match:
        raise ValueError(f"CREATE MATERIALIZED VIEW block not found for {mv_name}")

    semicolon = sql.find(";", match.end())
    if semicolon == -1:
        raise ValueError(f"CREATE MATERIALIZED VIEW block has no terminator for {mv_name}")
    return sql[match.start() : semicolon + 1]


def extract_publication_table_columns(sql: str, table_name: str) -> set[str] | None:
    cleaned = strip_sql_comments(sql)
    pattern = re.compile(
        rf"\b{re.escape(table_name)}\s*\(",
        re.IGNORECASE,
    )
    match = pattern.search(cleaned)
    if not match:
        return None

    open_index = cleaned.find("(", match.start())
    close_index = find_matching_paren(cleaned, open_index)
    block = cleaned[open_index + 1 : close_index]
    return {
        column.strip().strip('"').lower()
        for column in block.split(",")
        if column.strip()
    }


def record(results: list[tuple[bool, str]], passed: bool, message: str) -> None:
    results.append((passed, message))
    status = "PASS" if passed else "FAIL"
    print(f"[{status}] {message}")


def load_connector_config() -> dict[str, str]:
    connector = json.loads(CONNECTOR_JSON.read_text(encoding="utf-8"))
    return connector.get("config", connector)


def route_topic(config: dict[str, str], table_name: str) -> str:
    prefix = config.get("topic.prefix", "")
    route_regex = config.get("transforms.route.regex", "")
    route_replacement = config.get("transforms.route.replacement", "")
    source_topic = f"{prefix}.{table_name}"
    match = re.fullmatch(route_regex, source_topic)
    if not match:
        return source_topic

    routed = route_replacement
    for index, value in enumerate(match.groups(), start=1):
        routed = routed.replace(f"${index}", value)
    return routed


def validate_connector_routing_and_smt(
    results: list[tuple[bool, str]],
    config: dict[str, str],
) -> set[str]:
    included_tables = set(split_csv(config.get("table.include.list")))
    produced_topics = {
        route_topic(config, table_name)
        for table_name in sorted(included_tables)
    }
    expected_topics = set(M2_1_TOPIC_BY_TABLE.values())

    record(
        results,
        config.get("transforms.route.type") == "org.apache.kafka.connect.transforms.RegexRouter",
        "connector uses RegexRouter for topic normalization",
    )
    record(
        results,
        config.get("transforms.route.replacement") == "cdc.aurora.$1",
        "connector route replacement uses cdc.aurora.* topic convention",
    )
    record(
        results,
        produced_topics == expected_topics,
        "connector routing produces the expected M2-1 ClickHouse topics",
    )
    record(
        results,
        config.get("transforms.unwrap.type")
        == "io.debezium.transforms.ExtractNewRecordState",
        "connector uses ExtractNewRecordState unwrap",
    )
    add_fields = set(split_csv(config.get("transforms.unwrap.add.fields")))
    record(
        results,
        {"op", "ts_ms"} <= add_fields,
        "connector unwrap add.fields includes op and ts_ms",
    )
    record(
        results,
        config.get("transforms.unwrap.add.fields.prefix", None) == "",
        "connector unwrap add.fields.prefix is empty",
    )
    record(
        results,
        config.get("transforms.unwrap.delete.handling.mode") == "rewrite",
        "connector uses delete.handling.mode=rewrite",
    )
    return produced_topics


def validate_clickhouse(results: list[tuple[bool, str]]) -> None:
    ddl = CLICKHOUSE_DDL.read_text(encoding="utf-8")
    for table_name in ("prod_change_cdc", "prod_change_cdc_kafka"):
        columns = extract_create_table_columns(ddl, table_name)
        forbidden = sorted(columns & FORBIDDEN_PROD_CHANGE_COLUMN_NAMES)
        record(
            results,
            not forbidden,
            f"{table_name} does not define prod_change payload/actor columns",
        )

    for table_name in ("issue_cdc", "issue_cdc_kafka"):
        columns = extract_create_table_columns(ddl, table_name)
        forbidden = sorted(columns & FORBIDDEN_ISSUE_COLUMN_NAMES)
        record(
            results,
            not forbidden,
            f"{table_name} does not define issue raw PII columns",
        )

    cleaned = strip_sql_comments(ddl)
    record(
        results,
        "__op" not in cleaned and "__ts_ms" not in cleaned,
        "ClickHouse DDL uses op/ts_ms, not __op/__ts_ms",
    )

    for table_name in ("prod_change_cdc_kafka", "trace_cdc_kafka", "issue_cdc_kafka"):
        columns = extract_create_table_columns(ddl, table_name)
        record(
            results,
            {"op", "ts_ms"} <= columns,
            f"{table_name} expects op and ts_ms Kafka value fields",
        )

    record(
        results,
        not re.search(r"\bSELECT\s+\*", cleaned, flags=re.IGNORECASE),
        "ClickHouse materialized views do not use SELECT *",
    )

    for mv_name in sorted(M2_1_MV_NAMES):
        mv_block = extract_mv_block(cleaned, mv_name)
        record(
            results,
            re.search(r"\bop\s+AS\s+_op\b", mv_block, flags=re.IGNORECASE) is not None,
            f"{mv_name} maps op to _op",
        )
        record(
            results,
            re.search(r"\bts_ms\s+AS\s+_ts_ms\b", mv_block, flags=re.IGNORECASE) is not None,
            f"{mv_name} maps ts_ms to _ts_ms",
        )
        record(
            results,
            re.search(
                r"if\s*\(\s*op\s*=\s*'d'\s*,\s*1\s*,\s*0\s*\)\s+AS\s+_deleted\b",
                mv_block,
                flags=re.IGNORECASE,
            )
            is not None,
            f"{mv_name} maps delete rewrite events to _deleted",
        )


def validate_clickhouse_topics(
    results: list[tuple[bool, str]],
    connector_topics: set[str],
) -> None:
    ddl = CLICKHOUSE_DDL.read_text(encoding="utf-8")
    clickhouse_topics = extract_kafka_topics(ddl)
    expected_topics = set(M2_1_TOPIC_BY_TABLE.values())
    record(
        results,
        expected_topics <= clickhouse_topics,
        "ClickHouse DDL includes the expected M2-1 Kafka topic names",
    )
    record(
        results,
        clickhouse_topics == expected_topics,
        "ClickHouse M2-1 DDL consumes only the expected M2-1 Kafka topics",
    )
    record(
        results,
        connector_topics == clickhouse_topics,
        "connector routed topics match ClickHouse Kafka engine topics",
    )


def validate_fixtures(results: list[tuple[bool, str]]) -> None:
    ddl = CLICKHOUSE_DDL.read_text(encoding="utf-8")
    for filename, (kafka_table, expected_op, forbidden_columns) in FIXTURE_CONTRACTS.items():
        fixture_path = FIXTURE_DIR / filename
        record(
            results,
            fixture_path.exists(),
            f"{fixture_path.relative_to(REPO_ROOT)} exists",
        )
        if not fixture_path.exists():
            continue

        try:
            fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            record(
                results,
                False,
                f"{fixture_path.relative_to(REPO_ROOT)} is valid JSON",
            )
            continue

        record(
            results,
            isinstance(fixture, dict),
            f"{fixture_path.relative_to(REPO_ROOT)} is a JSON object",
        )
        if not isinstance(fixture, dict):
            continue

        keys = set(fixture)
        kafka_columns = extract_create_table_columns(ddl, kafka_table)
        unknown_keys = keys - kafka_columns
        missing_keys = kafka_columns - keys

        record(
            results,
            {"op", "ts_ms"} <= keys,
            f"{filename} includes op and ts_ms",
        )
        record(
            results,
            "__op" not in keys and "__ts_ms" not in keys,
            f"{filename} does not include __op or __ts_ms",
        )
        record(
            results,
            not (keys & forbidden_columns),
            f"{filename} excludes forbidden raw fields",
        )
        record(
            results,
            not (keys & TARGET_ONLY_COLUMNS),
            f"{filename} does not include ClickHouse target-only columns",
        )
        record(
            results,
            not unknown_keys,
            f"{filename} keys are accepted by {kafka_table}",
        )
        record(
            results,
            not missing_keys,
            f"{filename} includes every {kafka_table} column",
        )
        record(
            results,
            fixture.get("op") == expected_op,
            f"{filename} uses op={expected_op}",
        )


def validate_connector(results: list[tuple[bool, str]], config: dict[str, str]) -> set[str]:
    autocreate_mode = config.get("publication.autocreate.mode", "")
    record(
        results,
        autocreate_mode != "all_tables",
        "connector does not use publication.autocreate.mode=all_tables",
    )
    record(
        results,
        autocreate_mode == "disabled",
        "connector uses pre-created publication mode",
    )

    included_tables = set(split_csv(config.get("table.include.list")))
    record(
        results,
        included_tables == M2_1_TABLES,
        "connector table.include.list contains only the M2-1 vertical slice tables",
    )

    include_columns = set(split_csv(config.get("column.include.list")))
    exclude_columns = set(split_csv(config.get("column.exclude.list")))
    has_column_filter = bool(include_columns or exclude_columns)
    record(
        results,
        has_column_filter,
        "connector has column.include.list or column.exclude.list",
    )

    if include_columns:
        forbidden_in_include = include_columns & FORBIDDEN_PROD_CHANGE_COLUMNS
        record(
            results,
            not forbidden_in_include,
            "connector column.include.list excludes prod_change.payload and prod_change.actor",
        )
        include_tables = {
            ".".join(column.split(".")[:2])
            for column in include_columns
            if len(column.split(".")) >= 3
        }
        record(
            results,
            include_tables <= M2_1_TABLES,
            "connector column.include.list references only M2-1 tables",
        )
        forbidden_issue_in_include = include_columns & FORBIDDEN_ISSUE_COLUMNS
        record(
            results,
            not forbidden_issue_in_include,
            "connector column.include.list excludes issue raw PII columns",
        )

    if exclude_columns:
        record(
            results,
            FORBIDDEN_PROD_CHANGE_COLUMNS <= exclude_columns,
            "connector column.exclude.list blocks prod_change.payload and prod_change.actor",
        )
        record(
            results,
            FORBIDDEN_ISSUE_COLUMNS <= exclude_columns,
            "connector column.exclude.list blocks issue raw PII columns",
        )

    return validate_connector_routing_and_smt(results, config)


def validate_publication_sql(results: list[tuple[bool, str]]) -> None:
    publication_sql = PUBLICATION_SQL.read_text(encoding="utf-8")
    publication_clean = strip_sql_comments(publication_sql)
    publication_upper = publication_clean.upper()

    record(
        results,
        "FOR ALL TABLES" not in publication_upper,
        "publication SQL does not contain FOR ALL TABLES",
    )
    record(
        results,
        "FOR TABLES IN SCHEMA" not in publication_upper,
        "publication SQL does not contain FOR TABLES IN SCHEMA",
    )

    prod_change_columns = extract_publication_table_columns(
        publication_sql,
        "public.prod_change",
    )
    record(
        results,
        prod_change_columns is not None,
        "publication SQL has an explicit public.prod_change column list",
    )
    if prod_change_columns is not None:
        forbidden = prod_change_columns & FORBIDDEN_PROD_CHANGE_COLUMN_NAMES
        record(
            results,
            not forbidden,
            "publication prod_change column list excludes payload and actor",
        )


def validate_legacy_artifact_warnings(results: list[tuple[bool, str]]) -> None:
    for artifact in LEGACY_CDC_ARTIFACTS:
        if not artifact.exists():
            continue
        content = artifact.read_text(encoding="utf-8").lower()
        missing = [
            marker
            for marker in LEGACY_WARNING_MARKERS
            if marker not in content
        ]
        record(
            results,
            not missing,
            f"{artifact.relative_to(REPO_ROOT)} has a clear legacy warning",
        )


def validate_delete_runtime_caveat(results: list[tuple[bool, str]]) -> None:
    if not RUNTIME_DRY_VALIDATION_DOC.exists():
        record(
            results,
            False,
            f"{RUNTIME_DRY_VALIDATION_DOC.relative_to(REPO_ROOT)} exists",
        )
        return

    content = RUNTIME_DRY_VALIDATION_DOC.read_text(encoding="utf-8").lower()
    missing = [
        marker
        for marker in DELETE_RUNTIME_CAVEAT_MARKERS
        if marker not in content
    ]
    record(
        results,
        not missing,
        "runtime dry-validation doc has DELETE runtime caveat markers",
    )


def validate_controlled_runtime_runbook(results: list[tuple[bool, str]]) -> None:
    if not CONTROLLED_RUNTIME_RUNBOOK.exists():
        record(
            results,
            False,
            f"{CONTROLLED_RUNTIME_RUNBOOK.relative_to(REPO_ROOT)} exists",
        )
        return

    content = CONTROLLED_RUNTIME_RUNBOOK.read_text(encoding="utf-8").lower()
    missing = [
        marker
        for marker in CONTROLLED_RUNTIME_RUNBOOK_MARKERS
        if marker not in content
    ]
    record(
        results,
        not missing,
        "controlled runtime dry-run runbook has required guardrail markers",
    )


def validate_evidence_report_template(results: list[tuple[bool, str]]) -> None:
    if not EVIDENCE_REPORT_TEMPLATE.exists():
        record(
            results,
            False,
            f"{EVIDENCE_REPORT_TEMPLATE.relative_to(REPO_ROOT)} exists",
        )
        return

    content = EVIDENCE_REPORT_TEMPLATE.read_text(encoding="utf-8").lower()
    missing = [
        marker
        for marker in EVIDENCE_REPORT_TEMPLATE_MARKERS
        if marker not in content
    ]
    record(
        results,
        not missing,
        "runtime dry-run evidence report template has required safe-evidence markers",
    )


def main() -> int:
    results: list[tuple[bool, str]] = []
    config = load_connector_config()

    print("M2-1 CDC contract validation")
    print("=============================")
    validate_clickhouse(results)
    connector_topics = validate_connector(results, config)
    validate_clickhouse_topics(results, connector_topics)
    validate_fixtures(results)
    validate_publication_sql(results)
    validate_legacy_artifact_warnings(results)
    validate_delete_runtime_caveat(results)
    validate_controlled_runtime_runbook(results)
    validate_evidence_report_template(results)

    failed = [message for passed, message in results if not passed]
    print("=============================")
    print(f"Summary: {len(results) - len(failed)} PASS, {len(failed)} FAIL")
    if failed:
        print("Failed checks:")
        for message in failed:
            print(f"- {message}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
