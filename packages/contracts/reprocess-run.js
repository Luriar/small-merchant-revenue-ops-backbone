const REPROCESS_TARGET_KINDS = Object.freeze(["dlq_batch", "event_batch"]);

const REPROCESS_REQUIRED_FIELDS = Object.freeze([
  "idempotency_key",
  "target_kind",
  "target_ref",
  "reason",
]);

const REPROCESS_ALLOWED_FIELDS = Object.freeze([
  "idempotency_key",
  "target_kind",
  "target_ref",
  "reason",
]);

module.exports = {
  REPROCESS_TARGET_KINDS,
  REPROCESS_REQUIRED_FIELDS,
  REPROCESS_ALLOWED_FIELDS,
};
