#!/usr/bin/env bash
set -Eeuo pipefail

log() {
  printf '[m1-mvp-seed] %s\n' "$*"
}

fail() {
  printf '[m1-mvp-seed] ERROR: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

require_cmd curl
require_cmd jq
require_cmd psql
require_cmd grep
require_cmd date

DB_URL="${AURORA_DATABASE_URL:-${DATABASE_URL:-}}"
[[ -n "$DB_URL" ]] || fail "AURORA_DATABASE_URL or DATABASE_URL must be set"

API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:3000}"
API_BASE_URL="${API_BASE_URL%/}"
WEB_BASE_URL="${WEB_BASE_URL:-http://127.0.0.1:5173}"
WEB_BASE_URL="${WEB_BASE_URL%/}"

DEMO_SUFFIX="${DEMO_SUFFIX:-m1-demo-$(date -u +%Y%m%dT%H%M%SZ)-$$}"
TMP_DIR="${TMPDIR:-/tmp}/product-ops-demo-${DEMO_SUFFIX}"
mkdir -p "$TMP_DIR"

CHANGE_IDEMPOTENCY_KEY="demo-change-${DEMO_SUFFIX}"
EVENT_ID="demo-event-${DEMO_SUFFIX}"
ISSUE_IDEMPOTENCY_KEY="demo-issue-${DEMO_SUFFIX}"
ISSUE_EXTERNAL_ID="demo-issue-ext-${DEMO_SUFFIX}"
TRACE_RULE_REF="demo-rule-${DEMO_SUFFIX}"
FAILED_RUN_TARGET_REF="demo-event-${DEMO_SUFFIX}"
RETRY_IDEMPOTENCY_KEY="demo-retry-${DEMO_SUFFIX}"
REPROCESS_IDEMPOTENCY_KEY="demo-reprocess-${DEMO_SUFFIX}"
REPROCESS_TARGET_REF="demo-dlq-${DEMO_SUFFIX}"

RAW_TITLE_SENTINEL="DEMO_RAW_TITLE_SENTINEL_${DEMO_SUFFIX}"
RAW_BODY_SENTINEL="DEMO_RAW_BODY_SENTINEL_${DEMO_SUFFIX}"
RAW_REPORTER_SENTINEL="demo-reporter-${DEMO_SUFFIX}@example.invalid"
RAW_PAYLOAD_SENTINEL="DEMO_RAW_PAYLOAD_SENTINEL_${DEMO_SUFFIX}"

OPERATOR_TOKEN="${DEMO_OPERATOR_BEARER_TOKEN:-${SMOKE_OPERATOR_BEARER_TOKEN:-${OPERATOR_BEARER_TOKEN:-}}}"
VIEWER_TOKEN="${DEMO_VIEWER_BEARER_TOKEN:-${SMOKE_VIEWER_BEARER_TOKEN:-${VIEWER_BEARER_TOKEN:-${OPERATOR_TOKEN}}}}"

OPERATOR_JSON_HEADERS=(-H "content-type: application/json")
VIEWER_HEADERS=()

if [[ -n "$OPERATOR_TOKEN" ]]; then
  OPERATOR_JSON_HEADERS+=(-H "Authorization: Bearer ${OPERATOR_TOKEN}")
fi

if [[ -n "$VIEWER_TOKEN" ]]; then
  VIEWER_HEADERS+=(-H "Authorization: Bearer ${VIEWER_TOKEN}")
fi

post_json() {
  local path="$1"
  local payload="$2"
  local output_file="$3"
  shift 3
  local expected_statuses=("$@")
  local status

  status="$(
    curl -sS -o "$output_file" -w '%{http_code}' \
      -X POST "${API_BASE_URL}${path}" \
      "${OPERATOR_JSON_HEADERS[@]}" \
      --data-binary "$payload"
  )" || fail "POST ${path} failed"

  for expected_status in "${expected_statuses[@]}"; do
    if [[ "$status" == "$expected_status" ]]; then
      return 0
    fi
  done

  fail "POST ${path} returned HTTP ${status}; response saved at ${output_file}"
}

get_json() {
  local path="$1"
  local output_file="$2"
  local expected_status="$3"
  local status

  status="$(
    curl -sS -o "$output_file" -w '%{http_code}' \
      "${API_BASE_URL}${path}" \
      "${VIEWER_HEADERS[@]}"
  )" || fail "GET ${path} failed"

  [[ "$status" == "$expected_status" ]] || fail "GET ${path} returned HTTP ${status}; response saved at ${output_file}"
}

assert_absent() {
  local needle="$1"
  local file="$2"
  local label="$3"

  if grep -Fq -- "$needle" "$file"; then
    fail "raw sentinel leaked in ${label}"
  fi
}

assert_safe_issue_detail() {
  local file="$1"

  jq -e '
    ((has("title") | not)
    and (has("body") | not)
    and (has("payload") | not)
    and (has("reporter") | not)
    and (has("keywords") | not)
    and (has("external_id") | not)
    and (has("affected_variation") | not))
  ' "$file" >/dev/null || fail "issue detail exposes raw issue fields"
}

assert_safe_run_detail() {
  local file="$1"

  jq -e '
    ((has("input_ref") | not)
    and (has("output_ref") | not)
    and (has("error_detail") | not)
    and (has("idempotency_key") | not)
    and (has("reason") | not))
  ' "$file" >/dev/null || fail "run detail exposes raw run fields"
}

assert_safe_trace_evidences() {
  local file="$1"

  jq -e '
    (.items | type == "array")
    and all(.items[];
      ((has("payload") | not)
      and (has("metadata") | not)
      and (has("fingerprint") | not)))
  ' "$file" >/dev/null || fail "trace evidences expose raw fields"
}

log "starting M1 MVP demo seed"
log "API_BASE_URL=${API_BASE_URL}"
log "using synthetic suffix ${DEMO_SUFFIX}"

CHANGE_OCCURRED_AT="$(date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%SZ)"
EVENT_OCCURRED_AT="$(date -u -d "${CHANGE_OCCURRED_AT} + 2 minutes" +%Y-%m-%dT%H:%M:%SZ)"
ISSUE_OCCURRED_AT="$(date -u -d "${CHANGE_OCCURRED_AT} + 4 minutes" +%Y-%m-%dT%H:%M:%SZ)"
ANOMALY_WINDOW_START="$(date -u -d "${CHANGE_OCCURRED_AT} + 3 minutes" +%Y-%m-%dT%H:%M:%SZ)"
ANOMALY_WINDOW_END="$(date -u -d "${CHANGE_OCCURRED_AT} + 8 minutes" +%Y-%m-%dT%H:%M:%SZ)"

CHANGE_PAYLOAD="$(
  jq -n \
    --arg idempotency_key "$CHANGE_IDEMPOTENCY_KEY" \
    --arg occurred_at "$CHANGE_OCCURRED_AT" \
    '{
      idempotency_key: $idempotency_key,
      change_type: "release",
      title: "M1 demo checkout release",
      target_service: "checkout",
      source: "m1_mvp_demo_seed",
      occurred_at: $occurred_at
    }'
)"

post_json "/api/v1/changes" "$CHANGE_PAYLOAD" "$TMP_DIR/change.json" "201" "200"
CHANGE_ID="$(jq -er '.change_id' "$TMP_DIR/change.json")"
jq -e '.idempotent_replay | type == "boolean"' "$TMP_DIR/change.json" >/dev/null \
  || fail "change response missing idempotency flag"
log "seeded change_id=${CHANGE_ID}"

EVENT_PAYLOAD="$(
  jq -n \
    --arg event_id "$EVENT_ID" \
    --arg occurred_at "$EVENT_OCCURRED_AT" \
    '{
      event_id: $event_id,
      occurred_at: $occurred_at,
      target_service: "checkout",
      event_type: "product",
      event_subtype: "payment_failed",
      source: "m1_mvp_demo_seed",
      retry_count: 0,
      is_error: true,
      payload: {
        demo_marker: "checkout-regression"
      }
    }'
)"

post_json "/api/v1/events/intake" "$EVENT_PAYLOAD" "$TMP_DIR/event.json" "202" "200"
jq -e --arg event_id "$EVENT_ID" '.event_id == $event_id' "$TMP_DIR/event.json" >/dev/null \
  || fail "event response returned the wrong event_id"
log "seeded event_id=${EVENT_ID}"

ISSUE_PAYLOAD="$(
  jq -n \
    --arg idempotency_key "$ISSUE_IDEMPOTENCY_KEY" \
    --arg external_id "$ISSUE_EXTERNAL_ID" \
    --arg title "$RAW_TITLE_SENTINEL" \
    --arg body "$RAW_BODY_SENTINEL" \
    --arg reporter "$RAW_REPORTER_SENTINEL" \
    --arg payload_marker "$RAW_PAYLOAD_SENTINEL" \
    --arg occurred_at "$ISSUE_OCCURRED_AT" \
    '{
      idempotency_key: $idempotency_key,
      external_id: $external_id,
      source: "m1_mvp_demo_seed",
      title: $title,
      body: $body,
      issue_family: "checkout_payment_failure",
      severity: 2,
      keywords: ["checkout", "payment", "release"],
      affected_variation: "checkout-v2",
      reporter: $reporter,
      payload: {
        raw_payload_marker: $payload_marker
      },
      occurred_at: $occurred_at
    }'
)"

post_json "/api/v1/issues/intake" "$ISSUE_PAYLOAD" "$TMP_DIR/issue.json" "201" "200"
ISSUE_ID="$(jq -er '.issue_id' "$TMP_DIR/issue.json")"
jq -e '.idempotent_replay | type == "boolean"' "$TMP_DIR/issue.json" >/dev/null \
  || fail "issue response missing idempotency flag"
log "seeded issue_id=${ISSUE_ID}"

TRACE_PAYLOAD="$(
  jq -n \
    --arg change_id "$CHANGE_ID" \
    --arg issue_id "$ISSUE_ID" \
    --arg event_id "$EVENT_ID" \
    --arg rule_ref "$TRACE_RULE_REF" \
    --arg window_start "$ANOMALY_WINDOW_START" \
    --arg window_end "$ANOMALY_WINDOW_END" \
    '{
      change_id: $change_id,
      primary_issue_id: $issue_id,
      anomaly_type: "error_spike",
      anomaly_metric: "checkout.payment_failed",
      anomaly_window_start: $window_start,
      anomaly_window_end: $window_end,
      evidences: [
        {
          evidence_type: "timing",
          source_ref: $event_id,
          summary: "Payment failures increased shortly after the checkout release.",
          strength: "strong"
        },
        {
          evidence_type: "event_spike",
          source_ref: $event_id,
          summary: "Synthetic checkout payment_failed events indicate an operational regression.",
          strength: "medium"
        },
        {
          evidence_type: "rule_match",
          source_ref: $rule_ref,
          summary: "Release marker, issue family, and anomaly window match the trace rule.",
          strength: "strong"
        }
      ]
    }'
)"

post_json "/api/v1/traces" "$TRACE_PAYLOAD" "$TMP_DIR/trace.json" "201" "200"
TRACE_ID="$(jq -er '.trace_id' "$TMP_DIR/trace.json")"
jq -e '(.evidence_count | type == "number") and .evidence_count >= 3' "$TMP_DIR/trace.json" >/dev/null \
  || fail "trace response did not include at least three evidence rows"
log "seeded trace_id=${TRACE_ID}"

SEED_RUN_ID="$(
  psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 \
    -v target_ref="$FAILED_RUN_TARGET_REF" \
    -v demo_marker="$DEMO_SUFFIX" <<'SQL'
INSERT INTO run (
  run_type,
  target_kind,
  target_ref,
  status,
  attempt,
  max_attempts,
  error_class,
  error_detail,
  input_ref,
  completed_at
)
VALUES (
  'normalization',
  'event',
  :'target_ref',
  'failed',
  1,
  3,
  'm1_demo_seed_failure',
  jsonb_build_object('demo_marker', :'demo_marker'),
  jsonb_build_object('source', 'm1_mvp_demo_seed'),
  NOW()
)
RETURNING run_id;
SQL
)"
[[ -n "$SEED_RUN_ID" ]] || fail "failed to insert failed seed run"
log "seeded failed_run_id=${SEED_RUN_ID}"

RETRY_PAYLOAD="$(
  jq -n \
    --arg idempotency_key "$RETRY_IDEMPOTENCY_KEY" \
    '{
      idempotency_key: $idempotency_key,
      reason: "m1_demo_retry"
    }'
)"

post_json "/api/v1/runs/${SEED_RUN_ID}/retry" "$RETRY_PAYLOAD" "$TMP_DIR/retry.json" "202" "200"
RETRY_RUN_ID="$(jq -er '.new_run_id' "$TMP_DIR/retry.json")"
jq -e --arg seed_run_id "$SEED_RUN_ID" \
  '.action == "retry_requested"
    and .original_run_id == $seed_run_id
    and (.new_run_id | type == "string" and length > 0)' \
  "$TMP_DIR/retry.json" >/dev/null || fail "retry response mismatch"
log "seeded retry_run_id=${RETRY_RUN_ID}"

REPROCESS_PAYLOAD="$(
  jq -n \
    --arg idempotency_key "$REPROCESS_IDEMPOTENCY_KEY" \
    --arg target_ref "$REPROCESS_TARGET_REF" \
    '{
      idempotency_key: $idempotency_key,
      target_kind: "dlq_batch",
      target_ref: $target_ref,
      reason: "m1_demo_reprocess"
    }'
)"

post_json "/api/v1/reprocess" "$REPROCESS_PAYLOAD" "$TMP_DIR/reprocess.json" "202" "200"
REPROCESS_RUN_ID="$(jq -er '.new_run_id' "$TMP_DIR/reprocess.json")"
jq -e '.action == "reprocess_requested" and (.new_run_id | type == "string" and length > 0)' \
  "$TMP_DIR/reprocess.json" >/dev/null || fail "reprocess response mismatch"
log "seeded reprocess_run_id=${REPROCESS_RUN_ID}"

get_json "/api/v1/issues/${ISSUE_ID}" "$TMP_DIR/issue_detail.json" "200"
assert_safe_issue_detail "$TMP_DIR/issue_detail.json"
assert_absent "$RAW_TITLE_SENTINEL" "$TMP_DIR/issue_detail.json" "issue detail"
assert_absent "$RAW_BODY_SENTINEL" "$TMP_DIR/issue_detail.json" "issue detail"
assert_absent "$RAW_REPORTER_SENTINEL" "$TMP_DIR/issue_detail.json" "issue detail"
assert_absent "$RAW_PAYLOAD_SENTINEL" "$TMP_DIR/issue_detail.json" "issue detail"

get_json "/api/v1/traces/${TRACE_ID}" "$TMP_DIR/trace_detail.json" "200"
jq -e --arg trace_id "$TRACE_ID" --arg change_id "$CHANGE_ID" --arg issue_id "$ISSUE_ID" \
  '.trace_id == $trace_id and .change_id == $change_id and .primary_issue_id == $issue_id' \
  "$TMP_DIR/trace_detail.json" >/dev/null || fail "trace detail does not link expected change and issue"

get_json "/api/v1/traces/${TRACE_ID}/evidences" "$TMP_DIR/trace_evidences.json" "200"
assert_safe_trace_evidences "$TMP_DIR/trace_evidences.json"
jq -e '(.items | length) >= 3' "$TMP_DIR/trace_evidences.json" >/dev/null \
  || fail "trace evidence read did not include at least three rows"

for run_name in failed retry reprocess; do
  case "$run_name" in
    failed) run_id="$SEED_RUN_ID" ;;
    retry) run_id="$RETRY_RUN_ID" ;;
    reprocess) run_id="$REPROCESS_RUN_ID" ;;
  esac

  get_json "/api/v1/runs/${run_id}" "$TMP_DIR/${run_name}_run_detail.json" "200"
  assert_safe_run_detail "$TMP_DIR/${run_name}_run_detail.json"
  get_json "/api/v1/runs/${run_id}/state-log" "$TMP_DIR/${run_name}_state_log.json" "200"
  jq -e --arg run_id "$run_id" \
    '(.items | length >= 1) and all(.items[]; .run_id == $run_id)' \
    "$TMP_DIR/${run_name}_state_log.json" >/dev/null || fail "${run_name} state-log missing expected rows"
done

cat <<EOF
[m1-mvp-seed] completed
demo_suffix=${DEMO_SUFFIX}
change_id=${CHANGE_ID}
event_id=${EVENT_ID}
issue_id=${ISSUE_ID}
trace_id=${TRACE_ID}
failed_run_id=${SEED_RUN_ID}
retry_run_id=${RETRY_RUN_ID}
reprocess_run_id=${REPROCESS_RUN_ID}

frontend_changes_url=${WEB_BASE_URL}/?data=api&demo=m1#changes
frontend_issues_url=${WEB_BASE_URL}/?data=api&demo=m1#issues
frontend_runs_url=${WEB_BASE_URL}/?data=api&demo=m1#runs
frontend_traceability_url=${WEB_BASE_URL}/?data=api&demo=m1#traceability
EOF
