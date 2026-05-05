#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
DATABASE_URL="${AURORA_DATABASE_URL:-${DATABASE_URL:-}}"

if [[ -z "${DATABASE_URL}" ]]; then
  echo "AURORA_DATABASE_URL or DATABASE_URL is required" >&2
  exit 1
fi

PSQL=(psql "${DATABASE_URL}" -v ON_ERROR_STOP=1)

if [[ "${APPLY_BASELINE:-0}" == "1" ]]; then
  echo "[aurora-apply] applying baseline sources/aurora_ddl_v2.sql"
  "${PSQL[@]}" -f "${REPO_ROOT}/sources/aurora_ddl_v2.sql"
fi

FILES=(
  "${SCRIPT_DIR}/001_change_intake_idempotency.sql"
  "${SCRIPT_DIR}/002_event_intake.sql"
  "${SCRIPT_DIR}/003_issue_intake_idempotency.sql"
  "${SCRIPT_DIR}/004_repository_query_indexes.sql"
  "${SCRIPT_DIR}/005_run_state_log_insert_bootstrap.sql"
  "${SCRIPT_DIR}/permissions/001_roles_and_grants.sql"
)

for file in "${FILES[@]}"; do
  echo "[aurora-apply] applying ${file#${REPO_ROOT}/}"
  "${PSQL[@]}" -f "${file}"
done

echo "[aurora-apply] completed"
