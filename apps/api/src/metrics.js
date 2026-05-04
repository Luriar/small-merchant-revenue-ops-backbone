"use strict";

const FORBIDDEN_TAG_KEYS = new Set([
  "request_id",
  "run_id",
  "trace_id",
  "change_id",
  "issue_id",
  "state_log_id",
  "evidence_id",
  "item_id",
  "original_run_id",
  "new_run_id",
  "primary_issue_id",
  "target_ref",
  "payload",
  "body",
  "title",
  "reporter",
  "token",
  "authorization",
  "credential",
  "sql",
  "stack",
  "raw_sql",
  "raw_db_text",
]);

const METRIC_ROUTE_LABELS = Object.freeze([
  { method: "GET", pattern: /^\/healthz$/, route: "/healthz" },
  { method: "GET", pattern: /^\/readyz$/, route: "/readyz" },
  { method: "GET", pattern: /^\/api\/v1\/dashboard\/overview$/, route: "/api/v1/dashboard/overview" },
  { method: "GET", pattern: /^\/api\/v1\/dashboard\/timeline$/, route: "/api/v1/dashboard/timeline" },
  { method: "GET", pattern: /^\/api\/v1\/runs$/, route: "/api/v1/runs" },
  { method: "GET", pattern: /^\/api\/v1\/runs\/overview$/, route: "/api/v1/runs/overview" },
  { method: "GET", pattern: /^\/api\/v1\/runs\/failures$/, route: "/api/v1/runs/failures" },
  { method: "GET", pattern: /^\/api\/v1\/runs\/[^/]+$/, route: "/api/v1/runs/{run_id}" },
  { method: "GET", pattern: /^\/api\/v1\/runs\/[^/]+\/state-log$/, route: "/api/v1/runs/{run_id}/state-log" },
  { method: "POST", pattern: /^\/api\/v1\/runs\/[^/]+\/retry$/, route: "/api/v1/runs/{run_id}/retry" },
  { method: "GET", pattern: /^\/api\/v1\/changes$/, route: "/api/v1/changes" },
  { method: "GET", pattern: /^\/api\/v1\/changes\/[^/]+$/, route: "/api/v1/changes/{change_id}" },
  { method: "POST", pattern: /^\/api\/v1\/changes$/, route: "/api/v1/changes" },
  { method: "POST", pattern: /^\/api\/v1\/events\/intake$/, route: "/api/v1/events/intake" },
  { method: "GET", pattern: /^\/api\/v1\/issues$/, route: "/api/v1/issues" },
  { method: "GET", pattern: /^\/api\/v1\/issues\/[^/]+$/, route: "/api/v1/issues/{issue_id}" },
  { method: "POST", pattern: /^\/api\/v1\/issues\/intake$/, route: "/api/v1/issues/intake" },
  { method: "PATCH", pattern: /^\/api\/v1\/issues\/[^/]+\/status$/, route: "/api/v1/issues/{issue_id}/status" },
  { method: "POST", pattern: /^\/api\/v1\/reprocess$/, route: "/api/v1/reprocess" },
  { method: "GET", pattern: /^\/api\/v1\/traces$/, route: "/api/v1/traces" },
  { method: "GET", pattern: /^\/api\/v1\/traces\/[^/]+$/, route: "/api/v1/traces/{trace_id}" },
  { method: "GET", pattern: /^\/api\/v1\/traces\/[^/]+\/evidences$/, route: "/api/v1/traces/{trace_id}/evidences" },
  { method: "GET", pattern: /^\/api\/v1\/traces\/[^/]+\/primary-issue$/, route: "/api/v1/traces/{trace_id}/primary-issue" },
  { method: "POST", pattern: /^\/api\/v1\/traces$/, route: "/api/v1/traces" },
]);

const METRIC_NAMES = Object.freeze({
  HTTP_REQUEST_STARTED_TOTAL: "http_request_started_total",
  HTTP_REQUEST_FINISHED_TOTAL: "http_request_finished_total",
  HTTP_REQUEST_DURATION_MS: "http_request_duration_ms",
  HTTP_REQUEST_ABORTED_TOTAL: "http_request_aborted_total",
  HTTP_REQUEST_CLOSED_TOTAL: "http_request_closed_total",
  HTTP_REQUEST_FAILED_TOTAL: "http_request_failed_total",
  SERVER_SHUTDOWN_STARTED_TOTAL: "server_shutdown_started_total",
  SERVER_SHUTDOWN_TIMEOUT_TOTAL: "server_shutdown_timeout_total",
  SERVER_SHUTDOWN_COMPLETED_TOTAL: "server_shutdown_completed_total",
  SERVER_SHUTDOWN_FAILED_TOTAL: "server_shutdown_failed_total",
  SERVER_SHUTDOWN_ACTIVE_REQUESTS: "server_shutdown_active_requests",
  SERVER_SHUTDOWN_OPEN_CONNECTIONS: "server_shutdown_open_connections",
  SERVER_SHUTDOWN_DESTROYED_CONNECTIONS: "server_shutdown_destroyed_connections",
  CHANGE_LIST_RETRIEVED_TOTAL: "change_list_retrieved_total",
  ISSUE_LIST_RETRIEVED_TOTAL: "issue_list_retrieved_total",
  RUN_LIST_RETRIEVED_TOTAL: "run_list_retrieved_total",
  TRACE_LIST_RETRIEVED_TOTAL: "trace_list_retrieved_total",
  DASHBOARD_TIMELINE_RETRIEVED_TOTAL: "dashboard_timeline_retrieved_total",
  CHANGE_INTAKE_TOTAL: "change_intake_total",
  EVENT_INTAKE_TOTAL: "event_intake_total",
  ISSUE_INTAKE_TOTAL: "issue_intake_total",
  ISSUE_STATUS_UPDATE_TOTAL: "issue_status_update_total",
  TRACE_CREATE_TOTAL: "trace_create_total",
  TRACE_CREATE_EVIDENCE_COUNT: "trace_create_evidence_count",
  RETRY_RUN_TOTAL: "retry_run_total",
  REPROCESS_RUN_TOTAL: "reprocess_run_total",
});

function createNoopMetricsEmitter() {
  return {
    count() {},
    histogram() {},
    gauge() {},
  };
}

function sanitizeMetricTags(tags) {
  if (!isPlainObject(tags)) {
    return {};
  }

  const safeTags = {};
  for (const [key, value] of Object.entries(tags)) {
    if (FORBIDDEN_TAG_KEYS.has(key)) {
      continue;
    }

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      safeTags[key] = value;
      continue;
    }

    if (value === null) {
      safeTags[key] = null;
    }
  }

  return safeTags;
}

function emitCount(metrics, name, value = 1, tags) {
  const resolvedMetrics = metrics ?? createNoopMetricsEmitter();
  resolvedMetrics.count(name, value, sanitizeMetricTags(tags));
}

function emitHistogram(metrics, name, value, tags) {
  const resolvedMetrics = metrics ?? createNoopMetricsEmitter();
  resolvedMetrics.histogram(name, value, sanitizeMetricTags(tags));
}

function emitGauge(metrics, name, value, tags) {
  const resolvedMetrics = metrics ?? createNoopMetricsEmitter();
  resolvedMetrics.gauge(name, value, sanitizeMetricTags(tags));
}

function resolveMetricRouteLabel(method, url) {
  const path = sanitizePath(url);
  if (!path) {
    return null;
  }

  for (const candidate of METRIC_ROUTE_LABELS) {
    if (candidate.method === method && candidate.pattern.test(path)) {
      return candidate.route;
    }
  }

  return null;
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizePath(url) {
  if (typeof url !== "string") {
    return null;
  }

  const queryStart = url.indexOf("?");
  return queryStart === -1 ? url : url.slice(0, queryStart);
}

module.exports = {
  FORBIDDEN_TAG_KEYS,
  METRIC_ROUTE_LABELS,
  METRIC_NAMES,
  createNoopMetricsEmitter,
  sanitizeMetricTags,
  emitCount,
  emitHistogram,
  emitGauge,
  resolveMetricRouteLabel,
};
