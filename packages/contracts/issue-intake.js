const ISSUE_INTAKE_REQUIRED_FIELDS = Object.freeze([
  "source",
  "title",
  "occurred_at",
  "issue_family",
  "severity",
]);

const ISSUE_INTAKE_ALLOWED_FIELDS = Object.freeze([
  "idempotency_key",
  "external_id",
  "source",
  "title",
  "body",
  "issue_family",
  "severity",
  "keywords",
  "affected_variation",
  "payload",
  "reporter",
  "occurred_at",
]);

module.exports = {
  ISSUE_INTAKE_REQUIRED_FIELDS,
  ISSUE_INTAKE_ALLOWED_FIELDS,
};
