const RUN_STATUSES = Object.freeze([
  "pending",
  "processing",
  "completed",
  "failed",
  "dlq",
]);

const RETRYABLE_RUN_STATUSES = Object.freeze(["failed", "dlq"]);

const RETRY_RUN_REQUIRED_FIELDS = Object.freeze(["idempotency_key", "reason"]);

const RETRY_RUN_ALLOWED_FIELDS = Object.freeze(["idempotency_key", "reason"]);

module.exports = {
  RUN_STATUSES,
  RETRYABLE_RUN_STATUSES,
  RETRY_RUN_REQUIRED_FIELDS,
  RETRY_RUN_ALLOWED_FIELDS,
};
