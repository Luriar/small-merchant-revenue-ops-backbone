#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

section() {
  printf "\n==== %s ====\n" "$1"
}

run_grep() {
  local title="$1"
  shift
  section "${title}"
  "$@" || true
}

COMMON_EXCLUDES=(
  --exclude-dir=node_modules
  --exclude-dir=dist
  --exclude-dir=build
  --exclude-dir=.git
  --exclude-dir=reference
  --exclude='*.tsbuildinfo'
)

TARGETS=(
  apps/api/src/revenue-ops
  apps/api/src/lambda-handler.js
  apps/api/src/server.js
  scripts
  docs/m7_retry_dlq_standard_kr.md
  docs/m7_cloudwatch_observability_standard_kr.md
  docs/m6_route_use_guide_kr.md
  docs/production_lite_public_context_runbook_kr.md
  docs/step3_etl_pipeline_kr.md
  docs/step3_real_service_considerations_kr.md
)

section "M7 Retry / DLQ readiness check"
echo "Repo: ${ROOT_DIR}"
echo "Mode: read-only local inspection"
echo "No AWS calls. No file mutations."
echo "Scope: current Revenue OS code/docs only; legacy reference docs excluded."

run_grep "Revenue upload rejected/reprocess signals" \
  grep -RInE "revenue.*upload|upload.*revenue|rejected_rows|rejected_count|accepted_count|reprocessRevenueUpload|reprocess" \
  "${TARGETS[@]}" \
  "${COMMON_EXCLUDES[@]}"

run_grep "Public context collector status signals" \
  grep -RInE "public_context|context.*collect|collector|collectors|seoul|VwsmTrdar|failed_collector_count|partial|failed|skipped|stale" \
  "${TARGETS[@]}" \
  "${COMMON_EXCLUDES[@]}"

run_grep "Retry/backoff/auth-no-retry signals" \
  grep -RInE "retry|request_timeout|rate_limit|429|5xx|auth error|service key|Do NOT retry|should NOT retry" \
  "${TARGETS[@]}" \
  "${COMMON_EXCLUDES[@]}"

run_grep "Error/safe failure signals" \
  grep -RInE "error_class|reason_code|reason_message|validation|failed safely|sanitize|safe|secret value was not logged" \
  "${TARGETS[@]}" \
  "${COMMON_EXCLUDES[@]}"

section "Static conclusion"
cat <<'TXT'
Expected M7 interpretation:
- Revenue upload already has accepted/rejected row separation.
- Revenue upload already exposes rejected row review and reprocess route signals.
- Public context collectors already track failed/skipped collector counts.
- Public context partial failure should remain degraded state, not whole-service failure.
- Auth/config failures should not be auto-retried.
- User-facing UI should not expose DLQ terminology.
- Store/user identifiers may appear in logs, but should not become high-cardinality CloudWatch metric dimensions.
TXT

section "Done"
echo "Read-only check completed."
