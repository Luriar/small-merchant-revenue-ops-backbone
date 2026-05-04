const CHANGE_TYPES = Object.freeze(["release", "flag", "rule"]);

const CHANGE_INTAKE_REQUIRED_FIELDS = Object.freeze([
  "idempotency_key",
  "change_type",
  "title",
  "target_service",
  "source",
  "occurred_at",
]);

const CHANGE_INTAKE_ALLOWED_FIELDS = Object.freeze([
  "idempotency_key",
  "change_type",
  "title",
  "target_service",
  "target_component",
  "variation",
  "cohort",
  "rule_scope",
  "payload",
  "actor",
  "source",
  "occurred_at",
]);

module.exports = {
  CHANGE_TYPES,
  CHANGE_INTAKE_REQUIRED_FIELDS,
  CHANGE_INTAKE_ALLOWED_FIELDS,
};
