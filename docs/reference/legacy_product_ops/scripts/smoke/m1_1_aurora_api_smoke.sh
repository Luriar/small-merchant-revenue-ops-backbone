#!/usr/bin/env bash
set -Eeuo pipefail

log() {
  printf '[m1.1-smoke] %s\n' "$*"
}

fail() {
  printf '[m1.1-smoke] ERROR: %s\n' "$*" >&2
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

SMOKE_SUFFIX="${SMOKE_SUFFIX:-m1-1-$(date -u +%Y%m%dT%H%M%SZ)-$$}"
TMP_DIR="${TMPDIR:-/tmp}/product-ops-smoke-${SMOKE_SUFFIX}"
mkdir -p "$TMP_DIR"

CHANGE_IDEMPOTENCY_KEY="smoke-change-${SMOKE_SUFFIX}"
EVENT_ID="smoke-event-${SMOKE_SUFFIX}"
ISSUE_IDEMPOTENCY_KEY="smoke-issue-${SMOKE_SUFFIX}"
ISSUE_EXTERNAL_ID="smoke-ext-${SMOKE_SUFFIX}"

RAW_TITLE_SENTINEL="SMOKE_RAW_TITLE_SENTINEL_${SMOKE_SUFFIX}"
RAW_BODY_SENTINEL="SMOKE_RAW_BODY_SENTINEL_${SMOKE_SUFFIX}"
RAW_REPORTER_SENTINEL="smoke-reporter-${SMOKE_SUFFIX}@example.invalid"
RAW_PAYLOAD_SENTINEL="SMOKE_RAW_PAYLOAD_SENTINEL_${SMOKE_SUFFIX}"

OPERATOR_TOKEN="${SMOKE_OPERATOR_BEARER_TOKEN:-${OPERATOR_BEARER_TOKEN:-}}"
VIEWER_TOKEN="${SMOKE_VIEWER_BEARER_TOKEN:-${VIEWER_BEARER_TOKEN:-${OPERATOR_TOKEN}}}"

OPERATOR_JSON_HEADERS=(-H "content-type: application/json")
OPERATOR_HEADERS=()
VIEWER_HEADERS=()

if [[ -n "$OPERATOR_TOKEN" ]]; then
  OPERATOR_JSON_HEADERS+=(-H "Authorization: Bearer ${OPERATOR_TOKEN}")
  OPERATOR_HEADERS+=(-H "Authorization: Bearer ${OPERATOR_TOKEN}")
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

assert_safe_issue_list() {
  local file="$1"

  jq -e '
    (.items | type == "array")
    and all(.items[];
      ((has("title") | not)
      and (has("body") | not)
      and (has("payload") | not)
      and (has("reporter") | not)
      and (has("keywords") | not)
      and (has("external_id") | not)
      and (has("affected_variation") | not)))
  ' "$file" >/dev/null || fail "issue list exposes raw issue fields"
}

log "starting Aurora-backed operational API smoke"
log "API_BASE_URL=${API_BASE_URL}"
log "using synthetic suffix ${SMOKE_SUFFIX}"

OCCURRED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

CHANGE_PAYLOAD="$(
  jq -n \
    --arg idempotency_key "$CHANGE_IDEMPOTENCY_KEY" \
    --arg occurred_at "$OCCURRED_AT" \
    '{
      idempotency_key: $idempotency_key,
      change_type: "release",
      title: "M1.1 scripted smoke release",
      target_service: "checkout",
      source: "m1_1_scripted_smoke",
      occurred_at: $occurred_at
    }'
)"

post_json "/api/v1/changes" "$CHANGE_PAYLOAD" "$TMP_DIR/change_create.json" "201"
CHANGE_ID="$(jq -er '.change_id' "$TMP_DIR/change_create.json")"
jq -e '.created == true and .idempotent_replay == false' "$TMP_DIR/change_create.json" >/dev/null \
  || fail "change create response did not indicate a new row"

post_json "/api/v1/changes" "$CHANGE_PAYLOAD" "$TMP_DIR/change_replay.json" "200"
jq -e --arg change_id "$CHANGE_ID" \
  '.change_id == $change_id and .idempotent_replay == true' \
  "$TMP_DIR/change_replay.json" >/dev/null || fail "change replay did not return the same change_id"

CHANGE_DB_CHECK="$(
  psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 \
    -v change_id="$CHANGE_ID" \
    -v idempotency_key="$CHANGE_IDEMPOTENCY_KEY" <<'SQL'
SELECT CASE
  WHEN EXISTS (
    SELECT 1
    FROM prod_change
    WHERE change_id = :'change_id'
      AND source = 'm1_1_scripted_smoke'
  )
  AND EXISTS (
    SELECT 1
    FROM change_intake_idempotency
    WHERE change_id = :'change_id'
      AND idempotency_key = :'idempotency_key'
  )
  THEN 'ok'
  ELSE 'missing'
END;
SQL
)"
[[ "$CHANGE_DB_CHECK" == "ok" ]] || fail "Aurora change row or idempotency ledger row missing"
log "change create/replay persisted"

EVENT_PAYLOAD="$(
  jq -n \
    --arg event_id "$EVENT_ID" \
    --arg occurred_at "$OCCURRED_AT" \
    '{
      event_id: $event_id,
      occurred_at: $occurred_at,
      target_service: "checkout",
      event_type: "product",
      event_subtype: "checkout_completed",
      source: "m1_1_scripted_smoke",
      retry_count: 0,
      is_error: false,
      payload: {
        smoke_marker: "event-intake"
      }
    }'
)"

post_json "/api/v1/events/intake" "$EVENT_PAYLOAD" "$TMP_DIR/event_create.json" "202"
jq -e --arg event_id "$EVENT_ID" \
  '.event_id == $event_id and .accepted == true and .idempotent_replay == false' \
  "$TMP_DIR/event_create.json" >/dev/null || fail "event create response mismatch"

post_json "/api/v1/events/intake" "$EVENT_PAYLOAD" "$TMP_DIR/event_replay.json" "200"
jq -e --arg event_id "$EVENT_ID" \
  '.event_id == $event_id and .idempotent_replay == true' \
  "$TMP_DIR/event_replay.json" >/dev/null || fail "event replay did not return the same event_id"

EVENT_DB_CHECK="$(
  psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 \
    -v event_id="$EVENT_ID" <<'SQL'
SELECT CASE
  WHEN EXISTS (
    SELECT 1
    FROM event_intake
    WHERE event_id = :'event_id'
      AND created_at IS NOT NULL
  )
  THEN 'ok'
  ELSE 'missing'
END;
SQL
)"
[[ "$EVENT_DB_CHECK" == "ok" ]] || fail "Aurora event_intake row missing"
log "event intake create/replay persisted"

ISSUE_PAYLOAD="$(
  jq -n \
    --arg idempotency_key "$ISSUE_IDEMPOTENCY_KEY" \
    --arg external_id "$ISSUE_EXTERNAL_ID" \
    --arg title "$RAW_TITLE_SENTINEL" \
    --arg body "$RAW_BODY_SENTINEL" \
    --arg payload_marker "$RAW_PAYLOAD_SENTINEL" \
    --arg reporter "$RAW_REPORTER_SENTINEL" \
    --arg occurred_at "$OCCURRED_AT" \
    '{
      idempotency_key: $idempotency_key,
      external_id: $external_id,
      source: "m1_1_scripted_smoke",
      title: $title,
      body: $body,
      issue_family: "checkout_failure",
      severity: 2,
      payload: {
        raw_payload_marker: $payload_marker
      },
      reporter: $reporter,
      occurred_at: $occurred_at
    }'
)"

if jq -e 'has("affected_service")' <<<"$ISSUE_PAYLOAD" >/dev/null; then
  fail "issue intake smoke payload must not include affected_service"
fi

post_json "/api/v1/issues/intake" "$ISSUE_PAYLOAD" "$TMP_DIR/issue_create.json" "201"
ISSUE_ID="$(jq -er '.issue_id' "$TMP_DIR/issue_create.json")"
jq -e '.created == true and .idempotent_replay == false' "$TMP_DIR/issue_create.json" >/dev/null \
  || fail "issue create response did not indicate a new row"

post_json "/api/v1/issues/intake" "$ISSUE_PAYLOAD" "$TMP_DIR/issue_replay.json" "200"
jq -e --arg issue_id "$ISSUE_ID" \
  '.issue_id == $issue_id and .idempotent_replay == true' \
  "$TMP_DIR/issue_replay.json" >/dev/null || fail "issue replay did not return the same issue_id"

ISSUE_DB_CHECK="$(
  psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 \
    -v issue_id="$ISSUE_ID" \
    -v idempotency_key="$ISSUE_IDEMPOTENCY_KEY" <<'SQL'
SELECT CASE
  WHEN EXISTS (
    SELECT 1
    FROM issue
    WHERE issue_id = :'issue_id'
      AND source = 'm1_1_scripted_smoke'
  )
  AND EXISTS (
    SELECT 1
    FROM issue_intake_idempotency
    WHERE issue_id = :'issue_id'
      AND idempotency_key = :'idempotency_key'
  )
  THEN 'ok'
  ELSE 'missing'
END;
SQL
)"
[[ "$ISSUE_DB_CHECK" == "ok" ]] || fail "Aurora issue row or issue idempotency ledger row missing"
log "issue intake create/replay persisted"

get_json "/api/v1/issues/${ISSUE_ID}" "$TMP_DIR/issue_detail.json" "200"
jq -e --arg issue_id "$ISSUE_ID" '.issue_id == $issue_id' "$TMP_DIR/issue_detail.json" >/dev/null \
  || fail "issue detail did not return the created issue"
assert_safe_issue_detail "$TMP_DIR/issue_detail.json"

get_json "/api/v1/issues?source=m1_1_scripted_smoke&limit=100" "$TMP_DIR/issue_list.json" "200"
jq -e --arg issue_id "$ISSUE_ID" \
  'any(.items[]; .issue_id == $issue_id)' \
  "$TMP_DIR/issue_list.json" >/dev/null || fail "issue list did not include the created issue"
assert_safe_issue_list "$TMP_DIR/issue_list.json"

for file in "$TMP_DIR/issue_detail.json" "$TMP_DIR/issue_list.json"; do
  assert_absent "$RAW_TITLE_SENTINEL" "$file" "$file"
  assert_absent "$RAW_BODY_SENTINEL" "$file" "$file"
  assert_absent "$RAW_REPORTER_SENTINEL" "$file" "$file"
  assert_absent "$RAW_PAYLOAD_SENTINEL" "$file" "$file"
done

log "issue read APIs returned safe projections only"
log "passed; response artifacts saved under ${TMP_DIR}"
