const { METRIC_NAMES, emitCount } = require("./metrics");

async function handleDashboardOverview({ response, runStore, traceStore, logger }) {
  const [runSummary, traceSummary] = await Promise.all([
    runStore.getOverviewSummary(),
    traceStore.getOverviewSummary(),
  ]);

  const scope = {};
  if (typeof traceSummary.scope_from === "string") {
    scope.from = traceSummary.scope_from;
  }
  if (typeof traceSummary.scope_to === "string") {
    scope.to = traceSummary.scope_to;
  }

  const chartContext = {};
  if (typeof traceSummary.primary_metric === "string") {
    chartContext.metric = traceSummary.primary_metric;
  }

  const body = {
    scope,
    kpis: {
      changes: normalizeCount(traceSummary.changes),
      detected_anomaly_patterns: normalizeCount(traceSummary.detected_anomaly_patterns),
      linked_issues: normalizeCount(traceSummary.linked_issues),
      suspected_traces: normalizeCount(traceSummary.suspected_traces),
    },
    chart_context: chartContext,
  };

  logger.info("dashboard_overview_retrieved", {
    pending_runs: normalizeCount(runSummary.pending_runs),
    processing_runs: normalizeCount(runSummary.processing_runs),
    failed_runs: normalizeCount(runSummary.failed_runs),
    dlq_runs: normalizeCount(runSummary.dlq_runs),
    changes: body.kpis.changes,
    detected_anomaly_patterns: body.kpis.detected_anomaly_patterns,
    linked_issues: body.kpis.linked_issues,
    suspected_traces: body.kpis.suspected_traces,
  });

  return writeJson(response, 200, body);
}

async function handleDashboardTimeline({
  request,
  response,
  changeStore,
  logger,
  metrics,
}) {
  const url = new URL(request.url, "http://127.0.0.1");
  const metric = normalizeOptionalQuery(url.searchParams.get("metric"));
  const service = normalizeOptionalQuery(url.searchParams.get("service"));
  const from = normalizeOptionalQuery(url.searchParams.get("from"));
  const to = normalizeOptionalQuery(url.searchParams.get("to"));
  const granularity = normalizeOptionalQuery(url.searchParams.get("granularity")) ?? "1m";
  const errors = [];

  if (!metric) {
    errors.push("metric is required");
  }

  if (from && !isValidDateTime(from)) {
    errors.push("from must be a valid date-time");
  }

  if (to && !isValidDateTime(to)) {
    errors.push("to must be a valid date-time");
  }

  if (!["1m", "5m", "15m"].includes(granularity)) {
    errors.push("granularity must be one of: 1m, 5m, 15m");
  }

  if (from && to && isValidDateTime(from) && isValidDateTime(to) && new Date(from) > new Date(to)) {
    errors.push("from must be before or equal to to");
  }

  if (errors.length > 0) {
    logger.info("dashboard_timeline_validation_failed", {
      error_count: errors.length,
      service,
      granularity,
    });

    return writeJson(response, 400, {
      error: {
        code: "bad_request",
        message: "validation failed",
        details: errors,
      },
    });
  }

  const result = await changeStore.listDashboardChangeMarkers({
    targetService: service,
    from,
    to,
  });
  const changeMarkers = result.items;
  const body = {
    metric,
    series: [],
    change_markers: changeMarkers,
    anomaly_markers: [],
  };

  logger.info("dashboard_timeline_retrieved", {
    service,
    granularity,
    change_marker_count: changeMarkers.length,
    series_count: 0,
    anomaly_marker_count: 0,
  });
  emitCount(metrics, METRIC_NAMES.DASHBOARD_TIMELINE_RETRIEVED_TOTAL, 1, {
    service,
    granularity,
    has_change_markers: changeMarkers.length > 0,
  });

  return writeJson(response, 200, body);
}

function normalizeOptionalQuery(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isValidDateTime(value) {
  return !Number.isNaN(new Date(value).getTime());
}

function normalizeCount(value) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function writeJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

module.exports = {
  handleDashboardOverview,
  handleDashboardTimeline,
};
