"""Compatibility helpers for validators after approved M2-8I route wiring."""

from __future__ import annotations

import re
import subprocess
from pathlib import Path


SERVER = "apps/api/src/server.js"
M2_8I_DOC = "docs/m2_8i_production_route_wiring_implementation_kr.md"
M2_8I_ROUTE_MODULE = "apps/api/src/cdc-recovery/cdc-recovery-routes.js"


def approved_m2_8i_server_wiring_present(root: Path) -> bool:
    server_text = read_text(root, SERVER)
    if not read_text(root, M2_8I_DOC) or not read_text(root, M2_8I_ROUTE_MODULE):
        return False

    required_markers = [
        'require("./cdc-recovery/cdc-recovery-routes")',
        "createCdcRecoveryRouteDispatcher",
        "cdcRecoveryRoutes?.matches(request)",
        "cdcRecoveryRoutes.handle(request, response)",
    ]
    return all(marker in server_text for marker in required_markers) and server_diff_is_minimal(root)


def git_diff_is_empty_or_approved_m2_8i(root: Path, relative_path: str) -> bool:
    if git_diff_is_empty(root, relative_path):
        return True
    if relative_path == SERVER:
        return approved_m2_8i_server_wiring_present(root)
    return False


def server_has_no_cdc_recovery_or_approved_m2_8i(root: Path) -> bool:
    server_text = read_text(root, SERVER)
    return "cdc-recovery" not in server_text or approved_m2_8i_server_wiring_present(root)


def git_diff_is_empty(root: Path, relative_path: str) -> bool:
    result = subprocess.run(
        ["git", "diff", "--quiet", "--", relative_path],
        cwd=root,
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return result.returncode == 0


def server_diff_is_minimal(root: Path) -> bool:
    result = subprocess.run(
        ["git", "diff", "--", SERVER],
        cwd=root,
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
    )
    diff_text = result.stdout
    if not diff_text:
        return False

    changed_lines = [
        line for line in diff_text.splitlines()
        if (line.startswith("+") or line.startswith("-"))
        and not line.startswith("+++")
        and not line.startswith("---")
    ]
    removed_lines = [line for line in changed_lines if line.startswith("-") and line[1:].strip()]
    added_lines = [line for line in changed_lines if line.startswith("+") and line[1:].strip()]

    if removed_lines:
        return False
    if len(added_lines) > 14:
        return False

    allowed_added_patterns = [
        r"createCdcRecoveryRouteDispatcher",
        r"cdcRecoveryRoutes",
        r"authConfig: startupConfig\.authConfig",
        r"env,",
        r"\}\);",
        r"\{",
        r"\}",
    ]

    for line in added_lines:
        content = line[1:].strip()
        if not any(re.search(pattern, content) for pattern in allowed_added_patterns):
            return False

    return True


def read_text(root: Path, relative_path: str) -> str:
    path = root / relative_path
    return path.read_text(encoding="utf-8") if path.is_file() else ""
