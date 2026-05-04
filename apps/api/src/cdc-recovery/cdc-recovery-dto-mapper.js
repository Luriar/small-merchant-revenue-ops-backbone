const FORBIDDEN_RESPONSE_FIELDS = Object.freeze([
  "payload",
  "body",
  "title",
  "reporter",
  "actor",
  "raw_message",
  "message_body",
  "full_message",
  "secret",
  "password",
  "token",
  "endpoint",
  "db_url",
  "connection_string",
]);

const FORBIDDEN_RESPONSE_FIELD_SET = new Set(FORBIDDEN_RESPONSE_FIELDS);

const FAILURE_RESPONSE_FIELDS = Object.freeze([
  "failure_id",
  "failure_type",
  "source_topic",
  "source_table",
  "primary_key",
  "op",
  "ts_ms",
  "observed_field_names",
  "missing_required_fields",
  "unexpected_fields",
  "forbidden_field_names_detected",
  "parser_error_class",
  "parser_error_summary",
  "first_seen_at",
  "last_seen_at",
  "attempt_count",
  "status",
  "owner",
  "evidence_report_ref",
  "source_run_id",
  "latest_replay_request_id",
]);

const REPLAY_REQUEST_RESPONSE_FIELDS = Object.freeze([
  "failure_id",
  "replay_request_id",
  "requested_action",
  "status",
  "idempotency_key",
  "bounded_scope",
  "target_topic",
  "target_table",
  "attempt_count",
  "owner",
  "source_run_id",
  "new_run_id",
  "cleanup_status",
  "evidence_report_ref",
  "requested_at",
  "approved_at",
  "completed_at",
  "created_at",
  "updated_at",
]);

const STATE_LOG_RESPONSE_FIELDS = Object.freeze([
  "state_log_id",
  "failure_id",
  "replay_request_id",
  "from_status",
  "to_status",
  "reason_code",
  "owner",
  "safe_metadata",
  "evidence_report_ref",
  "created_at",
]);

function stripForbiddenFields(value) {
  if (Array.isArray(value)) {
    return value.map((item) => stripForbiddenFields(item));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const safe = {};
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_RESPONSE_FIELD_SET.has(key)) {
      continue;
    }
    safe[key] = stripForbiddenFields(child);
  }

  return safe;
}

function containsForbiddenKeys(value) {
  if (Array.isArray(value)) {
    return value.some((item) => containsForbiddenKeys(item));
  }

  if (!isPlainObject(value)) {
    return false;
  }

  return Object.entries(value).some(([key, child]) => (
    FORBIDDEN_RESPONSE_FIELD_SET.has(key) || containsForbiddenKeys(child)
  ));
}

function pickSafeFields(record, allowedFields) {
  const stripped = stripForbiddenFields(record);
  const dto = {};

  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(stripped, field)) {
      dto[field] = stripped[field];
    }
  }

  return dto;
}

function toSafeFailureDto(record) {
  return pickSafeFields(record, FAILURE_RESPONSE_FIELDS);
}

function toSafeReplayRequestDto(record) {
  return pickSafeFields(record, REPLAY_REQUEST_RESPONSE_FIELDS);
}

function toSafeStateLogDto(record) {
  return pickSafeFields(record, STATE_LOG_RESPONSE_FIELDS);
}

function toSafeListDto(items, mapper, nextCursor = null) {
  return {
    items: Array.isArray(items) ? items.map((item) => mapper(item)) : [],
    next_cursor: nextCursor,
  };
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

module.exports = {
  FORBIDDEN_RESPONSE_FIELDS,
  FAILURE_RESPONSE_FIELDS,
  REPLAY_REQUEST_RESPONSE_FIELDS,
  STATE_LOG_RESPONSE_FIELDS,
  stripForbiddenFields,
  containsForbiddenKeys,
  pickSafeFields,
  toSafeFailureDto,
  toSafeReplayRequestDto,
  toSafeStateLogDto,
  toSafeListDto,
};
