#!/usr/bin/env python3
"""Validate the v0.2 OpenAPI source and regenerate its report.

This script is intentionally small and deterministic. It performs the local
contract checks this repo currently relies on and writes the generated evidence
artifact without timestamps or environment-specific fields.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError as exc:  # pragma: no cover - environment guard
    raise SystemExit("PyYAML is required to validate the OpenAPI YAML") from exc


ROOT = Path(__file__).resolve().parents[1]
OPENAPI_PATH = ROOT / "sources" / "personal_project_openapi_v0_2.yaml"
REPORT_PATH = ROOT / "sources" / "personal_project_openapi_v0_2_validation_report.json"
GENERATED_BY = "scripts/validate_openapi.py"
OPERATION_METHODS = {"get", "put", "post", "delete", "patch", "head", "options", "trace"}


def load_openapi() -> dict[str, Any]:
    with OPENAPI_PATH.open("r", encoding="utf-8") as file:
        document = yaml.safe_load(file)

    if not isinstance(document, dict):
        raise ValueError("OpenAPI document must parse to an object")

    return document


def json_pointer_parts(ref: str) -> list[str]:
    return [part.replace("~1", "/").replace("~0", "~") for part in ref[2:].split("/")]


def resolve_ref(document: dict[str, Any], ref: str) -> bool:
    if not ref.startswith("#/"):
        return True

    current: Any = document
    for part in json_pointer_parts(ref):
        if not isinstance(current, dict) or part not in current:
            return False
        current = current[part]

    return True


def collect_refs(value: Any) -> list[str]:
    refs: list[str] = []

    if isinstance(value, dict):
        ref = value.get("$ref")
        if isinstance(ref, str):
            refs.append(ref)
        for child in value.values():
            refs.extend(collect_refs(child))
    elif isinstance(value, list):
        for child in value:
            refs.extend(collect_refs(child))

    return refs


def count_operations(paths: dict[str, Any]) -> int:
    operation_count = 0

    for path_item in paths.values():
        if not isinstance(path_item, dict):
            continue
        operation_count += sum(1 for method in path_item if method in OPERATION_METHODS)

    return operation_count


def validate_error_schemas(schemas: dict[str, Any], errors: list[str]) -> tuple[bool, bool]:
    error_body = schemas.get("ErrorBody")
    error_response = schemas.get("ErrorResponse")

    error_body_required = False
    error_response_wrapped = False

    if not isinstance(error_body, dict):
        errors.append("components.schemas.ErrorBody is missing or not an object")
    else:
        required = error_body.get("required")
        error_body_required = isinstance(required, list) and {"code", "message"}.issubset(set(required))
        if not error_body_required:
            errors.append("components.schemas.ErrorBody.required must include code and message")

    if not isinstance(error_response, dict):
        errors.append("components.schemas.ErrorResponse is missing or not an object")
    else:
        required = error_response.get("required")
        properties = error_response.get("properties")
        error_property = properties.get("error") if isinstance(properties, dict) else None
        error_response_wrapped = (
            isinstance(required, list)
            and "error" in required
            and isinstance(error_property, dict)
            and error_property.get("$ref") == "#/components/schemas/ErrorBody"
        )
        if not error_response_wrapped:
            errors.append(
                "components.schemas.ErrorResponse must require error and reference "
                "#/components/schemas/ErrorBody"
            )

    return error_response_wrapped, error_body_required


def build_report(document: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []

    paths = document.get("paths")
    if not isinstance(paths, dict):
        errors.append("OpenAPI paths must be an object")
        paths = {}

    components = document.get("components")
    schemas = components.get("schemas") if isinstance(components, dict) else None
    if not isinstance(schemas, dict):
        errors.append("OpenAPI components.schemas must be an object")
        schemas = {}

    info = document.get("info") if isinstance(document.get("info"), dict) else {}
    refs = collect_refs(document)
    internal_refs = sorted(ref for ref in refs if ref.startswith("#/"))
    missing_refs = sorted({ref for ref in internal_refs if not resolve_ref(document, ref)})
    for ref in missing_refs:
        errors.append(f"missing internal $ref: {ref}")

    error_response_wrapped, error_body_required = validate_error_schemas(schemas, errors)

    validation_passed = len(errors) == 0

    return {
        "generated_by": GENERATED_BY,
        "validation_passed": validation_passed,
        "yaml_parse_ok": True,
        "custom_ref_and_path_validation_ok": validation_passed,
        "openapi_version": document.get("openapi"),
        "info_title": info.get("title"),
        "info_version": info.get("version"),
        "paths_count": len(paths),
        "schemas_count": len(schemas),
        "operation_count": count_operations(paths),
        "internal_ref_count": len(internal_refs),
        "missing_internal_ref_count": len(missing_refs),
        "missing_internal_refs": missing_refs,
        "has_error_body": "ErrorBody" in schemas,
        "has_error_response": "ErrorResponse" in schemas,
        "error_response_wrapped": error_response_wrapped,
        "error_body_required_code_message": error_body_required,
        "error_count": len(errors),
        "errors": errors,
    }


def write_report(report: dict[str, Any]) -> None:
    with REPORT_PATH.open("w", encoding="utf-8") as file:
        json.dump(report, file, ensure_ascii=False, indent=2)
        file.write("\n")


def main() -> int:
    try:
        document = load_openapi()
        report = build_report(document)
    except Exception as exc:  # pragma: no cover - command-line failure path
        report = {
            "generated_by": GENERATED_BY,
            "validation_passed": False,
            "yaml_parse_ok": False,
            "custom_ref_and_path_validation_ok": False,
            "openapi_version": None,
            "info_title": None,
            "info_version": None,
            "paths_count": 0,
            "schemas_count": 0,
            "operation_count": 0,
            "internal_ref_count": 0,
            "missing_internal_ref_count": 0,
            "missing_internal_refs": [],
            "has_error_body": False,
            "has_error_response": False,
            "error_response_wrapped": False,
            "error_body_required_code_message": False,
            "error_count": 1,
            "errors": [str(exc)],
        }

    write_report(report)

    if report["validation_passed"]:
        print(
            "openapi validation ok "
            f"paths={report['paths_count']} "
            f"schemas={report['schemas_count']} "
            f"operations={report['operation_count']}"
        )
        return 0

    print("openapi validation failed", file=sys.stderr)
    for error in report["errors"]:
        print(f"- {error}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
