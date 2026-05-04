const { RUN_STATUSES } = require("../../../packages/contracts/retry-run");
const { buildListResponse, parseTypedCursor } = require("./list-page");
const { METRIC_NAMES, emitCount } = require("./metrics");

async function handleRunList({ request, response, store, logger, metrics }) {
  const url = new URL(request.url, "http://127.0.0.1");
  const status = normalizeOptionalQuery(url.searchParams.get("status"));
  const limit = normalizeLimit(url.searchParams.get("limit"));
  const cursor = parseTypedCursor(url.searchParams.get("cursor"), {
    expectedType: "run_list_v1",
    requiredKeys: ["created_at", "run_id"],
  });

  const errors = [];

  if (status && !RUN_STATUSES.includes(status)) {
    errors.push("status must be one of: pending, processing, completed, failed, dlq");
  }

  if (limit.error) {
    errors.push(limit.error);
  }

  if (cursor.error) {
    errors.push(cursor.error);
  }

  if (errors.length > 0) {
    logger.info("run_list_validation_failed", {
      error_count: errors.length,
      status,
    });

    return writeJson(response, 400, {
      error: {
        code: "bad_request",
        message: "validation failed",
        details: errors,
      },
    });
  }

  const result = await store.listRuns({
    status,
    limit: limit.value,
    cursor: cursor.value,
  });
  const body = buildListResponse({
    items: result.runs.map(projectRunListItem),
    requestedLimit: limit.value,
    nextCursorBuilder: (item) => ({
      type: "run_list_v1",
      created_at: item.created_at,
      run_id: item.run_id,
    }),
  });
  body.runs = body.items;

  logger.info("run_list_retrieved", {
    status,
    limit: limit.value,
    count: body.items.length,
    has_more: body.page.has_more,
    cursor_present: cursor.value !== null,
  });
  emitCount(metrics, METRIC_NAMES.RUN_LIST_RETRIEVED_TOTAL, 1, {
    status,
    limit_present: limit.value !== null,
    has_more: body.page.has_more,
    cursor_present: cursor.value !== null,
  });

  return writeJson(response, 200, body);
}

async function handleRunOverview({ response, store, logger }) {
  const summary = await store.getOverviewSummary();
  const kpis = {
    pending: normalizeCount(summary.pending_runs),
    processing: normalizeCount(summary.processing_runs),
    failed: normalizeCount(summary.failed_runs),
    dlq: normalizeCount(summary.dlq_runs),
  };
  const body = {
    kpis,
    distribution: [
      { status: "pending", count: kpis.pending },
      { status: "processing", count: kpis.processing },
      { status: "failed", count: kpis.failed },
      { status: "dlq", count: kpis.dlq },
    ],
  };

  logger.info("run_overview_retrieved", {
    pending: kpis.pending,
    processing: kpis.processing,
    failed: kpis.failed,
    dlq: kpis.dlq,
  });

  return writeJson(response, 200, body);
}

async function handleRunFailures({ response, store, logger }) {
  const result = await store.listRunFailures();
  const groups = result.groups.map(projectRunFailureGroup);

  logger.info("run_failures_retrieved", {
    count: groups.length,
  });

  return writeJson(response, 200, { groups });
}

async function handleRunDetail({ response, store, logger, runId }) {
  const run = await store.getRunById(runId);
  if (!run) {
    logger.info("run_detail_not_found", {
      run_id: runId,
    });

    return writeJson(response, 404, {
      error: {
        code: "not_found",
        message: "run not found",
      },
    });
  }

  const body = projectRunDetail(run);

  logger.info("run_detail_retrieved", {
    run_id: runId,
    status: body.status,
  });

  return writeJson(response, 200, body);
}

async function handleRunStateLog({ response, store, logger, runId }) {
  const run = await store.getRunById(runId);
  if (!run) {
    logger.info("run_state_log_not_found", {
      run_id: runId,
    });

    return writeJson(response, 404, {
      error: {
        code: "not_found",
        message: "run not found",
      },
    });
  }

  const result = await store.listRunStateLog(runId);
  const items = result.items.map(projectRunStateLogItem);

  logger.info("run_state_log_retrieved", {
    run_id: runId,
    count: items.length,
  });

  return writeJson(response, 200, { items });
}

function normalizeOptionalQuery(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeLimit(value) {
  if (value === null) {
    return { value: null };
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return { error: "limit must be a positive integer" };
  }

  return { value: parsed };
}

function writeJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function projectRunListItem(run) {
  return {
    run_id: run.run_id,
    run_type: run.run_type,
    target_kind: run.target_kind ?? null,
    target_ref: run.target_ref ?? null,
    status: run.status,
    attempt: run.attempt,
    created_at: run.created_at,
  };
}

function projectRunFailureGroup(group) {
  return {
    error_class: typeof group.error_class === "string" && group.error_class.trim().length > 0
      ? group.error_class
      : "unknown",
    count: normalizeCount(group.count),
    latest_occurred_at: group.latest_occurred_at ?? null,
    representative_run_type: typeof group.representative_run_type === "string"
      ? group.representative_run_type
      : null,
    retryable: Boolean(group.retryable),
  };
}

function normalizeCount(value) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function projectRunDetail(run) {
  const detail = projectRunListItem(run);

  if (typeof run.retry_action === "string") {
    detail.retry_action = run.retry_action;
  }

  if (typeof run.original_run_id === "string") {
    detail.original_run_id = run.original_run_id;
  }

  return detail;
}

function projectRunStateLogItem(stateLog) {
  return {
    state_log_id: stateLog.state_log_id,
    run_id: stateLog.run_id,
    from_status: stateLog.from_status ?? null,
    to_status: stateLog.to_status,
    changed_at: stateLog.changed_at,
  };
}

module.exports = {
  handleRunDetail,
  handleRunFailures,
  handleRunList,
  handleRunOverview,
  handleRunStateLog,
};
