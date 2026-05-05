#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${REPO_ROOT}"

npm --prefix apps/web run check
npm --prefix apps/web run build
python3 -m pytest tests/ -q
node --test apps/api/src/**/*.test.js

status="$(git status --short)"
printf "\nM5 engineering validation complete.\n"
printf "git status --short:\n"
if [[ -n "${status}" ]]; then
  printf "%s\n" "${status}"
  if grep -Eq 'apps/api/src/revenue-ops/data/revenue_ops_export\.json|apps/web/tsconfig\.tsbuildinfo' <<<"${status}"; then
    printf "\nWARNING: generated validation artifacts are dirty.\n"
    printf "Likely generated files:\n"
    printf "%s\n" "- apps/api/src/revenue-ops/data/revenue_ops_export.json"
    printf "%s\n" "- apps/web/tsconfig.tsbuildinfo"
  fi
else
  printf "(clean)\n"
fi
