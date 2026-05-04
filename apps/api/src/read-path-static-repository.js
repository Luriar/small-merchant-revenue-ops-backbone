const TRACE_ID = "trace-inc-4872";
const CHANGE_ID = "change-release-4872";
const ISSUE_ID = "issue-inc-4872";
const INCIDENT_DISPLAY_ID = "INC-4872";
const RUN_ID = "run-normalization-4872";

// Static contract repository only. Future implementations should replace this
// boundary with Aurora repositories for core records and ClickHouse repositories
// for timeline/anomaly read models.
function createReadPathStaticRepository() {
  return {
    getDashboardOverview,
    getDashboardTimeline,
    listTraces,
    getTraceDetail,
    listTraceEvidences,
    getTracePrimaryIssue,
    listChanges,
    getChangeDetail,
    listChangeTraces,
    getRunOverview,
    getRunFailures,
    listRuns,
    getRunDetail,
    listRunStateLog,
    listIssues,
    getIssueDetail,
    listIssueTraces,
  };
}

function getDashboardOverview() {
  return {
    scope: {
      service: "checkout-service",
      from: "2026-04-22T10:00:00.000Z",
      to: "2026-04-22T11:00:00.000Z",
    },
    kpis: {
      changes: 3,
      detected_anomaly_patterns: 2,
      linked_issues: 1,
      suspected_traces: 1,
    },
    chart_context: {
      metric: "checkout.error_rate",
      baseline_window: "previous_60m",
      compare_window: "current_60m",
      granularity: "5m",
    },
  };
}

function getDashboardTimeline() {
  return {
    metric: "checkout.error_rate",
    series: [
      { ts: "2026-04-22T10:00:00.000Z", value: 0.018 },
      { ts: "2026-04-22T10:05:00.000Z", value: 0.019 },
      { ts: "2026-04-22T10:10:00.000Z", value: 0.031 },
      { ts: "2026-04-22T10:15:00.000Z", value: 0.087 },
      { ts: "2026-04-22T10:20:00.000Z", value: 0.083 },
      { ts: "2026-04-22T10:25:00.000Z", value: 0.076 },
    ],
    change_markers: [
      {
        change_id: CHANGE_ID,
        title: "Checkout release 2026.04.22",
        occurred_at: "2026-04-22T10:02:00.000Z",
      },
    ],
    anomaly_markers: [
      {
        detection_id: "detection-checkout-error-spike",
        ts: "2026-04-22T10:15:00.000Z",
        label: "Checkout error rate 4.8x baseline",
      },
    ],
  };
}

function listTraces() {
  return {
    items: [
      {
        trace_id: TRACE_ID,
        status: "suspected",
        confidence: "strong",
        change: {
          change_id: CHANGE_ID,
          title: "Checkout release 2026.04.22",
        },
        anomaly_summary: "Checkout error rate rose 383% for checkout-v2 after the release marker.",
        linked_issue_count: 1,
        evidence_count: 4,
        created_at: "2026-04-22T10:16:00.000Z",
      },
    ],
    next_cursor: null,
  };
}

function getTraceDetail(traceId) {
  if (traceId !== TRACE_ID) {
    return null;
  }

  return {
    trace_id: TRACE_ID,
    status: "suspected",
    confidence: "strong",
    change: {
      change_id: CHANGE_ID,
      title: "Checkout release 2026.04.22",
      type: "release",
      target_service: "checkout-service",
    },
    primary_issue: {
      issue_id: ISSUE_ID,
      issue_family: "checkout_error",
    },
    anomaly: {
      type: "error",
      metric: "checkout.error_rate",
      window_start: "2026-04-22T10:11:00.000Z",
      window_end: "2026-04-22T10:26:00.000Z",
      detail: {
        baseline_value: 0.018,
        actual_value: 0.087,
        delta_pct: 383,
        affected_users: 23100,
        affected_variation: "checkout-v2",
        explanation: "Checkout error-rate anomaly overlaps the release marker window.",
      },
    },
    counts: {
      linked_event_count: 42,
      linked_issue_count: 1,
      evidence_count: 4,
    },
  };
}

function listTraceEvidences(traceId) {
  if (traceId !== TRACE_ID) {
    return null;
  }

  return {
    items: [
      {
        evidence_id: "evidence-timing-4872",
        type: "timing",
        strength: "strong",
        summary: "Error-rate spike begins nine minutes after the checkout release marker.",
        payload: {
          change_occurred_at: "2026-04-22T10:02:00.000Z",
          anomaly_window_start: "2026-04-22T10:11:00.000Z",
          anomaly_window_end: "2026-04-22T10:26:00.000Z",
        },
      },
      {
        evidence_id: "evidence-variation-4872",
        type: "variation",
        strength: "medium",
        summary: "Affected checkout-v2 variation matches the release scope.",
        payload: {
          variation: "checkout-v2",
          target_service: "checkout-service",
        },
      },
      {
        evidence_id: "evidence-event-spike-4872",
        type: "event_spike",
        strength: "strong",
        summary: "Checkout payment_failed events increased from 18 to 87 per 1K attempts.",
        payload: {
          metric: "checkout.error_rate",
          baseline_value: 0.018,
          actual_value: 0.087,
          delta_pct: 383,
        },
      },
      {
        evidence_id: "evidence-rule-match-4872",
        type: "rule_match",
        strength: "strong",
        summary: "Correlation rule matched checkout release, error spike, and linked incident family.",
        payload: {
          rule_id: "checkout-release-error-correlation",
          issue_family: "checkout_error",
          incident_external_id: INCIDENT_DISPLAY_ID,
        },
      },
    ],
  };
}

function getTracePrimaryIssue(traceId) {
  if (traceId !== TRACE_ID) {
    return null;
  }

  return {
    issue_id: ISSUE_ID,
    issue_family: "checkout_error",
    severity: 2,
    status: "open",
    summary: "INC-4872 checkout failures increased for checkout-v2 after the release marker.",
    keywords: ["checkout", "error-rate", "release", "checkout-v2"],
    affected_variation: "checkout-v2",
    source: "support",
    external_id: INCIDENT_DISPLAY_ID,
  };
}

function listChanges() {
  return {
    summary: {
      release_count: 1,
      flag_count: 1,
      rule_count: 1,
    },
    items: [
      {
        change_id: CHANGE_ID,
        type: "release",
        title: "Checkout release 2026.04.22",
        target_service: "checkout-service",
        variation: "checkout-v2",
        occurred_at: "2026-04-22T10:02:00.000Z",
        linked_trace_count: 1,
        linked_issue_count: 1,
        strongest_confidence: "strong",
      },
      {
        change_id: "change-flag-4872",
        type: "flag",
        title: "Checkout experiment ramp",
        target_service: "checkout-service",
        variation: "checkout-v2",
        occurred_at: "2026-04-22T10:04:00.000Z",
        linked_trace_count: 1,
        linked_issue_count: 1,
        strongest_confidence: "medium",
      },
      {
        change_id: "change-rule-4872",
        type: "rule",
        title: "Payment routing rule update",
        target_service: "checkout-service",
        variation: null,
        occurred_at: "2026-04-22T10:07:00.000Z",
        linked_trace_count: 0,
        linked_issue_count: 0,
        strongest_confidence: "weak",
      },
    ],
    next_cursor: null,
  };
}

function getChangeDetail(changeId) {
  if (changeId !== CHANGE_ID) {
    return null;
  }

  return {
    change_id: CHANGE_ID,
    type: "release",
    title: "Checkout release 2026.04.22",
    target_service: "checkout-service",
    target_component: "checkout-api",
    variation: "checkout-v2",
    actor: "release-bot",
    source: "deploy-system",
    occurred_at: "2026-04-22T10:02:00.000Z",
  };
}

function listChangeTraces(changeId) {
  if (changeId !== CHANGE_ID) {
    return null;
  }

  return listTraces();
}

function getRunOverview() {
  return {
    kpis: {
      pending: 2,
      processing: 1,
      failed: 1,
      dlq: 1,
    },
    distribution: [
      { status: "pending", count: 2 },
      { status: "processing", count: 1 },
      { status: "failed", count: 1 },
      { status: "dlq", count: 1 },
    ],
  };
}

function listRuns() {
  return {
    items: [
      {
        run_id: RUN_ID,
        run_type: "normalization",
        target_kind: "trace",
        target_ref: TRACE_ID,
        status: "failed",
        attempt: 1,
        max_attempts: 3,
        error_class: "normalization_timeout",
        input_ref: {
          trace_id: TRACE_ID,
        },
        output_ref: null,
      },
    ],
    next_cursor: null,
  };
}

function getRunDetail(runId) {
  if (runId !== RUN_ID) {
    return null;
  }

  return listRuns().items[0];
}

function listRunStateLog(runId) {
  if (runId !== RUN_ID) {
    return null;
  }

  return {
    items: [
      {
        from_status: null,
        to_status: "pending",
        attempt: 1,
        reason: "read-path skeleton run created",
        occurred_at: "2026-04-22T10:17:00.000Z",
      },
      {
        from_status: "pending",
        to_status: "failed",
        attempt: 1,
        reason: "normalization_timeout",
        occurred_at: "2026-04-22T10:18:00.000Z",
      },
    ],
  };
}

function getRunFailures() {
  return {
    groups: [
      {
        error_class: "normalization_timeout",
        count: 1,
        latest_occurred_at: "2026-04-22T10:18:00.000Z",
        representative_run_type: "normalization",
        retryable: true,
      },
      {
        error_class: "dlq_threshold_exceeded",
        count: 1,
        latest_occurred_at: "2026-04-22T10:21:00.000Z",
        representative_run_type: "correlation",
        retryable: false,
      },
    ],
  };
}

function listIssues() {
  return {
    items: [
      {
        issue_id: ISSUE_ID,
        issue_family: "checkout_error",
        severity: 2,
        status: "open",
        summary: "INC-4872 checkout failures increased for checkout-v2 after the release marker.",
        source: "support",
        occurred_at: "2026-04-22T10:16:00.000Z",
        affected_variation: "checkout-v2",
        linked_trace_count: 1,
      },
    ],
    next_cursor: null,
  };
}

function getIssueDetail(issueId) {
  if (issueId !== ISSUE_ID) {
    return null;
  }

  return {
    issue_id: ISSUE_ID,
    issue_family: "checkout_error",
    severity: 2,
    status: "open",
    summary: "INC-4872 checkout failures increased for checkout-v2 after the release marker.",
    keywords: ["checkout", "error-rate", "release", "checkout-v2"],
    affected_variation: "checkout-v2",
    source: "support",
    external_id: INCIDENT_DISPLAY_ID,
  };
}

function listIssueTraces(issueId) {
  if (issueId !== ISSUE_ID) {
    return null;
  }

  return listTraces();
}

module.exports = {
  TRACE_ID,
  createReadPathStaticRepository,
  staticReadPathRepository: createReadPathStaticRepository(),
};
