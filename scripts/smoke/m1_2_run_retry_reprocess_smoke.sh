#!/usr/bin/env bash
set -Eeuo pipefail

log() {
  printf '[m1.2-smoke] %s\n' "$*"
}

fail() {
  printf '[m1.2-smoke] ERROR: %s\n' "$*" >&2
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

SMOKE_SUFFIX="${SMOKE_SUFFIX:-m1-2-$(date -u +%Y%m%dT%H%M%SZ)-$$}"
TMP_DIR="${TMPDIR:-/tmp}/product-ops-smoke-${SMOKE_SUFFIX}"
mkdir -p "$TMP_DIR"

SEED_TARGET_REF="m1_2_seed_event_${SMOKE_SUFFIX}"
RETRY_IDEMPOTENCY_KEY="smoke-retry-${SMOKE_SUFFIX}"
REPROCESS_IDEMPOTENCY_KEY="smoke-reprocess-${SMOKE_SUFFIX}"
REPROCESS_TARGET_REF="m1_2_dlq_batch_${SMOKE_SUFFIX}"

RAW_INPUT_REF_SENTINEL="SMOKE_RAW_INPUT_REF_SENTINEL_${SMOKE_SUFFIX}"
RAW_PAYLOAD_SENTINEL="SMOKE_RAW_PAYLOAD_SENTINEL_${SMOKE_SUFFIX}"
RAW_CREDENTIAL_SENTINEL="SMOKE_RAW_CREDENTIAL_SENTINEL_${SMOKE_SUFFIX}"
RAW_SQL_TEXT_SENTINEL="SMOKE_RAW_SQL_TEXT_SENTINEL_${SMOKE_SUFFIX}"
RAW_STACK_TRACE_SENTINEL="SMOKE_RAW_STACK_TRACE_SENTINEL_${SMOKE_SUFFIX}"

OPERATOR_TOKEN="${SMOKE_OPERATOR_BEARER_TOKEN:-${OPERATOR_BEARER_TOKEN:-}}"
VIEWER_TOKEN="${SMOKE_VIEWER_BEARER_TOKEN:-${VIEWER_BEARER_TOKEN:-${OPERATOR_TOKEN}}}"

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
  local expected_status="$4"
  local status

  status="$(
    curl -sS -o "$output_file" -w '%{http_code}' \
      -X POST "${API_BASE_URL}${path}" \
      "${OPERATOR_JSON_HEADERS[@]}" \
      --data-binary "$payload"
  )" || fail "POST ${path} failed"

  [[ "$status" == "$expected_status" ]] || fail "POST ${path} returned HTTP ${status}; response saved at ${output_file}"
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
    fail "raw value leaked in ${label}"
  fi
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

assert_safe_state_log() {
  local file="$1"

  jq -e '
    (.items | type == "array")
    and all(.items[];
      ((keys_unsorted - ["state_log_id", "run_id", "from_status", "to_status", "changed_at"]) | length == 0))
  ' "$file" >/dev/null || fail "state-log response exposes unexpected fields"
}

state_log_count() {
  local run_id="$1"

  psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 \
    -v run_id="$run_id" <<'SQL'
SELECT COUNT(*)::integer
FROM run_state_log
WHERE run_id = :'run_id';
SQL
}

log "starting run/retry/reprocess Aurora smoke"
log "API_BASE_URL=${API_BASE_URL}"
log "using synthetic suffix ${SMOKE_SUFFIX}"

SEED_RUN_ID="$(
  psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 \
    -v target_ref="$SEED_TARGET_REF" \
    -v raw_input_ref="$RAW_INPUT_REF_SENTINEL" \
    -v raw_payload="$RAW_PAYLOAD_SENTINEL" \
    -v raw_credential="$RAW_CREDENTIAL_SENTINEL" \
    -v raw_sql_text="$RAW_SQL_TEXT_SENTINEL" \
    -v raw_stack_trace="$RAW_STACK_TRACE_SENTINEL" <<'SQL'
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
  'm1_2_seed_failure',
  jsonb_build_object(
    'raw_payload_marker', :'raw_payload',
    'sql_text_marker', :'raw_sql_text',
    'stack_trace_marker', :'raw_stack_trace'
  ),
  jsonb_build_object(
    'raw_input_ref_marker', :'raw_input_ref',
    'credential_marker', :'raw_credential'
  ),
  NOW()
)
RETURNING run_id;
SQL
)"
[[ -n "$SEED_RUN_ID" ]] || fail "failed to insert seed run"

SEED_DB_CHECK="$(
  psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 \
    -v seed_run_id="$SEED_RUN_ID" \
    -v raw_input_ref="$RAW_INPUT_REF_SENTINEL" \
    -v raw_payload="$RAW_PAYLOAD_SENTINEL" \
    -v raw_credential="$RAW_CREDENTIAL_SENTINEL" \
    -v raw_sql_text="$RAW_SQL_TEXT_SENTINEL" \
    -v raw_stack_trace="$RAW_STACK_TRACE_SENTINEL" <<'SQL'
SELECT CASE
  WHEN EXISTS (
    SELECT 1
    FROM run
    WHERE run_id = :'seed_run_id'
      AND status = 'failed'
      AND completed_at IS NOT NULL
      AND input_ref->>'raw_input_ref_marker' = :'raw_input_ref'
      AND input_ref->>'credential_marker' = :'raw_credential'
      AND error_detail->>'raw_payload_marker' = :'raw_payload'
      AND error_detail->>'sql_text_marker' = :'raw_sql_text'
      AND error_detail->>'stack_trace_marker' = :'raw_stack_trace'
  )
  THEN 'ok'
  ELSE 'missing'
END;
SQL
)"
[[ "$SEED_DB_CHECK" == "ok" ]] || fail "seed run was not stored with expected synthetic markers"
log "seed failed run inserted"

RETRY_PAYLOAD="$(
  jq -n \
    --arg idempotency_key "$RETRY_IDEMPOTENCY_KEY" \
    '{
      idempotency_key: $idempotency_key,
      reason: "m1_2_scripted_smoke_retry"
    }'
)"

post_json "/api/v1/runs/${SEED_RUN_ID}/retry" "$RETRY_PAYLOAD" "$TMP_DIR/retry_create.json" "202"
RETRY_RUN_ID="$(jq -er '.new_run_id' "$TMP_DIR/retry_create.json")"
jq -e --arg seed_run_id "$SEED_RUN_ID" \
  '.action == "retry_requested"
    and .original_run_id == $seed_run_id
    and .idempotent_replay == false
    and .status == "accepted"
    and (.new_run_id | type == "string" and length > 0)' \
  "$TMP_DIR/retry_create.json" >/dev/null || fail "retry create response mismatch"

RETRY_ROW_COUNT="$(
  psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 \
    -v seed_run_id="$SEED_RUN_ID" \
    -v retry_idempotency_key="$RETRY_IDEMPOTENCY_KEY" <<'SQL'
SELECT COUNT(*)::integer
FROM run
WHERE input_ref->>'action' = 'retry'
  AND input_ref->>'original_run_id' = :'seed_run_id'
  AND input_ref->>'idempotency_key' = :'retry_idempotency_key';
SQL
)"
[[ "$RETRY_ROW_COUNT" == "1" ]] || fail "retry row count expected 1, got ${RETRY_ROW_COUNT}"

RETRY_LOG_COUNT_BEFORE="$(state_log_count "$RETRY_RUN_ID")"
post_json "/api/v1/runs/${SEED_RUN_ID}/retry" "$RETRY_PAYLOAD" "$TMP_DIR/retry_replay.json" "200"
jq -e --arg retry_run_id "$RETRY_RUN_ID" \
  '.action == "retry_requested"
    and .new_run_id == $retry_run_id
    and .idempotent_replay == true
    and .status == "accepted"' \
  "$TMP_DIR/retry_replay.json" >/dev/null || fail "retry replay did not return the same new_run_id"
RETRY_LOG_COUNT_AFTER="$(state_log_count "$RETRY_RUN_ID")"
[[ "$RETRY_LOG_COUNT_BEFORE" == "$RETRY_LOG_COUNT_AFTER" ]] || fail "retry replay increased run_state_log count"
log "retry create/replay verified"

REPROCESS_PAYLOAD="$(
  jq -n \
    --arg idempotency_key "$REPROCESS_IDEMPOTENCY_KEY" \
    --arg target_ref "$REPROCESS_TARGET_REF" \
    '{
      idempotency_key: $idempotency_key,
      target_kind: "dlq_batch",
      target_ref: $target_ref,
      reason: "m1_2_scripted_smoke_reprocess"
    }'
)"

post_json "/api/v1/reprocess" "$REPROCESS_PAYLOAD" "$TMP_DIR/reprocess_create.json" "202"
REPROCESS_RUN_ID="$(jq -er '.new_run_id' "$TMP_DIR/reprocess_create.json")"
jq -e \
  '.action == "reprocess_requested"
    and .idempotent_replay == false
    and .status == "accepted"
    and (.new_run_id | type == "string" and length > 0)' \
  "$TMP_DIR/reprocess_create.json" >/dev/null || fail "reprocess create response mismatch"

REPROCESS_ROW_COUNT="$(
  psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 \
    -v reprocess_idempotency_key="$REPROCESS_IDEMPOTENCY_KEY" \
    -v reprocess_target_ref="$REPROCESS_TARGET_REF" <<'SQL'
SELECT COUNT(*)::integer
FROM run
WHERE run_type = 'reprocess'
  AND target_kind = 'dlq_batch'
  AND target_ref = :'reprocess_target_ref'
  AND input_ref->>'idempotency_key' = :'reprocess_idempotency_key';
SQL
)"
[[ "$REPROCESS_ROW_COUNT" == "1" ]] || fail "reprocess row count expected 1, got ${REPROCESS_ROW_COUNT}"

REPROCESS_LOG_COUNT_BEFORE="$(state_log_count "$REPROCESS_RUN_ID")"
post_json "/api/v1/reprocess" "$REPROCESS_PAYLOAD" "$TMP_DIR/reprocess_replay.json" "200"
jq -e --arg reprocess_run_id "$REPROCESS_RUN_ID" \
  '.action == "reprocess_requested"
    and .new_run_id == $reprocess_run_id
    and .idempotent_replay == true
    and .status == "accepted"' \
  "$TMP_DIR/reprocess_replay.json" >/dev/null || fail "reprocess replay did not return the same new_run_id"
REPROCESS_LOG_COUNT_AFTER="$(state_log_count "$REPROCESS_RUN_ID")"
[[ "$REPROCESS_LOG_COUNT_BEFORE" == "$REPROCESS_LOG_COUNT_AFTER" ]] || fail "reprocess replay increased run_state_log count"
log "reprocess create/replay verified"

for run_name in seed retry reprocess; do
  case "$run_name" in
    seed) run_id="$SEED_RUN_ID" ;;
    retry) run_id="$RETRY_RUN_ID" ;;
    reprocess) run_id="$REPROCESS_RUN_ID" ;;
  esac

  detail_file="$TMP_DIR/${run_name}_run_detail.json"
  get_json "/api/v1/runs/${run_id}" "$detail_file" "200"
  jq -e --arg run_id "$run_id" '.run_id == $run_id' "$detail_file" >/dev/null \
    || fail "${run_name} run detail returned the wrong run_id"
  assert_safe_run_detail "$detail_file"

  assert_absent "$RAW_INPUT_REF_SENTINEL" "$detail_file" "$detail_file"
  assert_absent "$RAW_PAYLOAD_SENTINEL" "$detail_file" "$detail_file"
  assert_absent "$RAW_CREDENTIAL_SENTINEL" "$detail_file" "$detail_file"
  assert_absent "$RAW_SQL_TEXT_SENTINEL" "$detail_file" "$detail_file"
  assert_absent "$RAW_STACK_TRACE_SENTINEL" "$detail_file" "$detail_file"
done
log "run detail safe projection verified"

for run_name in retry reprocess; do
  case "$run_name" in
    retry) run_id="$RETRY_RUN_ID" ;;
    reprocess) run_id="$REPROCESS_RUN_ID" ;;
  esac

  state_log_file="$TMP_DIR/${run_name}_state_log.json"
  get_json "/api/v1/runs/${run_id}/state-log" "$state_log_file" "200"
  assert_safe_state_log "$state_log_file"
  jq -e --arg run_id "$run_id" \
    '(.items | length >= 1) and all(.items[]; .run_id == $run_id)' \
    "$state_log_file" >/dev/null || fail "${run_name} state-log did not contain expected rows"

  assert_absent "metadata" "$state_log_file" "$state_log_file"
  assert_absent "$RAW_INPUT_REF_SENTINEL" "$state_log_file" "$state_log_file"
  assert_absent "$RAW_PAYLOAD_SENTINEL" "$state_log_file" "$state_log_file"
  assert_absent "$RAW_CREDENTIAL_SENTINEL" "$state_log_file" "$state_log_file"
  assert_absent "$RAW_SQL_TEXT_SENTINEL" "$state_log_file" "$state_log_file"
  assert_absent "$RAW_STACK_TRACE_SENTINEL" "$state_log_file" "$state_log_file"
done

log "state-log safe projection verified"
log "passed; response artifacts saved under ${TMP_DIR}"
