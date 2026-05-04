const EVENT_TYPES = Object.freeze(["product", "support_issue"]);

const EVENT_INTAKE_REQUIRED_FIELDS = Object.freeze([
  "event_id",
  "occurred_at",
  "target_service",
  "event_type",
  "event_subtype",
  "source",
]);

const EVENT_INTAKE_ALLOWED_FIELDS = Object.freeze([
  "event_id",
  "occurred_at",
  "target_service",
  "event_type",
  "event_subtype",
  "variation",
  "cohort",
  "duration_ms",
  "retry_count",
  "is_error",
  "user_id",
  "session_id",
  "request_id",
  "payload",
  "source",
  "ingestion_batch_id",
]);

module.exports = {
  EVENT_TYPES,
  EVENT_INTAKE_REQUIRED_FIELDS,
  EVENT_INTAKE_ALLOWED_FIELDS,
};
