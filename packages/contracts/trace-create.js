const TRACE_CREATE_ALLOWED_FIELDS = Object.freeze([
  "change_id",
  "primary_issue_id",
  "anomaly_type",
  "anomaly_metric",
  "anomaly_window_start",
  "anomaly_window_end",
  "evidences",
]);

const TRACE_CREATE_REQUIRED_FIELDS = Object.freeze([
  "change_id",
  "primary_issue_id",
  "anomaly_type",
  "anomaly_metric",
  "anomaly_window_start",
  "anomaly_window_end",
  "evidences",
]);

const TRACE_EVIDENCE_ALLOWED_FIELDS = Object.freeze([
  "evidence_type",
  "source_ref",
  "summary",
  "strength",
  "payload",
]);

const TRACE_STATUS = "suspected";
const TRACE_STATUSES = Object.freeze([
  "suspected",
  "confirmed",
  "dismissed",
]);

module.exports = {
  TRACE_CREATE_ALLOWED_FIELDS,
  TRACE_CREATE_REQUIRED_FIELDS,
  TRACE_EVIDENCE_ALLOWED_FIELDS,
  TRACE_STATUS,
  TRACE_STATUSES,
};
