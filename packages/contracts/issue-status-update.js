const ISSUE_STATUSES = Object.freeze([
  "open",
  "investigating",
  "resolved",
  "ignored",
]);

const ISSUE_STATUS_UPDATE_REQUIRED_FIELDS = Object.freeze([
  "status",
  "expected_version",
]);

const ISSUE_STATUS_UPDATE_ALLOWED_FIELDS = Object.freeze([
  "status",
  "expected_version",
]);

module.exports = {
  ISSUE_STATUSES,
  ISSUE_STATUS_UPDATE_REQUIRED_FIELDS,
  ISSUE_STATUS_UPDATE_ALLOWED_FIELDS,
};
