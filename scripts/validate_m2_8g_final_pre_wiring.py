#!/usr/bin/env python3
"""Static validator for the M2-8G final pre-wiring closure."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

from m2_8i_validator_compat import git_diff_is_empty_or_approved_m2_8i
from m2_8m_validator_compat import git_diff_is_empty_or_approved_m2_8m


ROOT = Path(__file__).resolve().parents[1]

REQUIRED_DOCS = [
    "docs/m2_8g_final_pre_wiring_closure_kr.md",
    "docs/m2_8g_go_no_go_summary_kr.md",
    "docs/m2_8g_next_implementation_prompt_kr.md",
]

REQUIRED_CHECKLISTS = [
    "ops/m2_8g_final_pre_wiring/checklists/final_pre_wiring_checklist.md",
    "ops/m2_8g_final_pre_wiring/checklists/no_go_conditions_checklist.md",
    "ops/m2_8g_final_pre_wiring/checklists/m2_8b_start_readiness_checklist.md",
]

REQUIRED_FILES = [
    *REQUIRED_DOCS,
    *REQUIRED_CHECKLISTS,
]

REQUIRED_MARKERS = [
    ("M2-8A", [r"m2-8a"]),
    ("M2-8B-Prep", [r"m2-8b-prep"]),
    ("M2-8C-Prep", [r"m2-8c-prep"]),
    ("M2-8D-Prep", [r"m2-8d-prep"]),
    ("M2-8E-Prep", [r"m2-8e-prep"]),
    ("M2-8F-Prep", [r"m2-8f-prep"]),
    ("M2-8B", [r"m2-8b"]),
    ("test-only harness", [r"test-only harness"]),
    ("in-memory/stub repository", [r"in-memory/stub repository"]),
    ("safe CDC error adapter", [r"safe cdc error adapter"]),
    ("auth role mapping", [r"auth role mapping"]),
    ("DTO mapper safety", [r"dto mapper safety"]),
    ("OpenAPI proposal parity", [r"openapi proposal parity"]),
    ("global safety scanner", [r"global safety scanner"]),
    ("no live route wiring", [r"no live route wiring"]),
    ("server.js modification", [r"server\.js.+modification", r"no server\.js modification"]),
    ("auth.js modification", [r"auth\.js.+modification", r"no auth\.js modification"]),
    ("error-response.js modification", [r"error-response\.js.+modification", r"no error-response\.js modification"]),
    (
        "cdc-recovery runtime module modification",
        [r"cdc-recovery runtime module modification", r"no cdc-recovery runtime module modification"],
    ),
    ("no OpenAPI main merge", [r"no openapi main merge"]),
    ("SQL apply", [r"sql apply"]),
    ("external infrastructure commands", [r"external infrastructure commands"]),
    ("no raw payloads", [r"no raw payloads"]),
    ("no full message bodies", [r"no full message bodies"]),
    ("no issue raw values", [r"no issue raw values"]),
    ("no prod_change payload/actor values", [r"no prod_change payload/actor values"]),
    ("no stack traces", [r"no stack traces"]),
    ("no SQL details", [r"no sql details"]),
    ("no persistence internals", [r"no persistence internals"]),
]

PACKAGE_SCRIPT = "validate:m2-8g:final-pre-wiring"
OPENAPI_PATCH = "sources/openapi_m2_5_dlq_replay_patch.yaml"
MAIN_OPENAPI = "sources/personal_project_openapi_v0_2.yaml"
PROPOSAL_MARKER = "PROPOSAL ONLY - DO NOT MERGE AUTOMATICALLY"

PROTECTED_RUNTIME_FILES = [
    "apps/api/src/server.js",
    "apps/api/src/auth.js",
    "apps/api/src/error-response.js",
    "apps/api/src/cdc-recovery/cdc-recovery-handler.js",
    "apps/api/src/cdc-recovery/cdc-recovery-service.js",
    "apps/api/src/cdc-recovery/cdc-recovery-dto-mapper.js",
    "apps/api/src/cdc-recovery/cdc-recovery-repository.js",
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


def path_for(relative_path: str) -> Path:
    return ROOT / relative_path


def file_exists(relative_path: str) -> bool:
    return path_for(relative_path).is_file()


def read_existing_text(relative_path: str) -> str:
    path = path_for(relative_path)
    return path.read_text(encoding="utf-8") if path.is_file() else ""


def combined_required_text() -> str:
    return "\n".join(read_existing_text(relative_path) for relative_path in REQUIRED_FILES).casefold()


def package_has_script(script_name: str) -> bool:
    try:
        package = json.loads(read_existing_text("package.json"))
    except json.JSONDecodeError:
        return False
    scripts = package.get("scripts")
    return isinstance(scripts, dict) and script_name in scripts


def has_any_pattern(text: str, patterns: list[str]) -> bool:
    return any(re.search(pattern, text, flags=re.I) for pattern in patterns)


def git_diff_is_empty(relative_path: str) -> bool:
    return (
        git_diff_is_empty_or_approved_m2_8i(ROOT, relative_path)
        or git_diff_is_empty_or_approved_m2_8m(ROOT, relative_path)
    )


def main() -> int:
    validator = Validator()

    for relative_path in REQUIRED_DOCS:
        validator.check(file_exists(relative_path), f"required M2-8G doc exists: {relative_path}")

    for relative_path in REQUIRED_CHECKLISTS:
        validator.check(file_exists(relative_path), f"required M2-8G checklist exists: {relative_path}")

    combined_text = combined_required_text()
    for marker_name, patterns in REQUIRED_MARKERS:
        validator.check(has_any_pattern(combined_text, patterns), f"docs/checklists contain marker: {marker_name}")

    patch_text = read_existing_text(OPENAPI_PATCH)
    validator.check(PROPOSAL_MARKER in patch_text, "M2-5 OpenAPI patch retains proposal-only marker")
    validator.check(git_diff_is_empty(MAIN_OPENAPI), "main OpenAPI file has no working-tree diff")

    for relative_path in PROTECTED_RUNTIME_FILES:
        validator.check(git_diff_is_empty(relative_path), f"{relative_path} has no working-tree diff")

    validator.check(package_has_script(PACKAGE_SCRIPT), f"package.json has script: {PACKAGE_SCRIPT}")

    return validator.summary()


if __name__ == "__main__":
    sys.exit(main())
