const {
  ISSUE_INTAKE_REQUIRED_FIELDS,
  ISSUE_INTAKE_ALLOWED_FIELDS,
} = require("../../../packages/contracts/issue-intake");
const {
  ISSUE_STATUSES,
  ISSUE_STATUS_UPDATE_ALLOWED_FIELDS,
} = require("../../../packages/contracts/issue-status-update");
const { buildListResponse, parseTypedCursor } = require("./list-page");
const { METRIC_NAMES, emitCount } = require("./metrics");

async function handleIssueIntake({ request, response, store, logger, metrics }) {
  let body;

  try {
    body = await readJsonBody(request);
  } catch (error) {
    emitCount(metrics, METRIC_NAMES.ISSUE_INTAKE_TOTAL, 1, {
      outcome: "validation_failed",
      failure_stage: "read_body",
    });
    return writeJson(response, 400, {
      error: {
        code: "bad_request",
        message: error.message,
      },
    });
  }

  const validation = validateIssueIntakeRequest(body);
  if (!validation.ok) {
    logger.info("issue_intake_validation_failed", {
      error_count: validation.errors.length,
      source: hasNonEmptyString(body && body.source) ? body.source.trim() : null,
      external_id_present: hasNonEmptyString(body && body.external_id),
      idempotency_key_present: hasNonEmptyString(body && body.idempotency_key),
    });
    emitCount(metrics, METRIC_NAMES.ISSUE_INTAKE_TOTAL, 1, {
      outcome: "validation_failed",
      failure_stage: "validate",
      source: hasNonEmptyString(body?.source) ? body.source.trim() : null,
      issue_family: hasNonEmptyString(body?.issue_family) ? body.issue_family.trim() : null,
      severity: Number.isInteger(body?.severity) ? body.severity : null,
      external_id_present: hasNonEmptyString(body?.external_id),
      idempotency_key_present: hasNonEmptyString(body?.idempotency_key),
    });

    return writeJson(response, 400, {
      error: {
        code: "bad_request",
        message: "validation failed",
        details: validation.errors,
      },
    });
  }

  const result = await store.createOrReplay(validation.value);
  logger.info("issue_intake_processed", {
    issue_id: result.body.issue_id,
    replay: result.body.idempotent_replay,
    source: validation.value.source,
    issue_family: validation.value.issue_family,
    severity: validation.value.severity,
    external_id_present: validation.value.external_id !== null,
    idempotency_key_present: validation.value.idempotency_key !== null,
  });
  emitCount(metrics, METRIC_NAMES.ISSUE_INTAKE_TOTAL, 1, {
    outcome: result.body.idempotent_replay ? "replay" : "created",
    source: validation.value.source,
    issue_family: validation.value.issue_family,
    severity: validation.value.severity,
    external_id_present: validation.value.external_id !== null,
    idempotency_key_present: validation.value.idempotency_key !== null,
  });

  return writeJson(response, result.statusCode, result.body);
}

async function handleIssueList({ request, response, store, logger, metrics }) {
  const url = new URL(request.url, "http://127.0.0.1");
  const issueFamily = normalizeOptionalQuery(url.searchParams.get("issue_family"));
  const severity = normalizeSeverity(url.searchParams.get("severity"));
  const status = normalizeOptionalQuery(url.searchParams.get("status"));
  const source = normalizeOptionalQuery(url.searchParams.get("source"));
  const limit = normalizeLimit(url.searchParams.get("limit"));
  const cursor = parseTypedCursor(url.searchParams.get("cursor"), {
    expectedType: "issue_list_v1",
    requiredKeys: ["created_at", "issue_id"],
  });

  const errors = [];

  if (severity.error) {
    errors.push(severity.error);
  }

  if (status && !ISSUE_STATUSES.includes(status)) {
    errors.push("status must be one of: open, investigating, resolved, ignored");
  }

  if (limit.error) {
    errors.push(limit.error);
  }

  if (cursor.error) {
    errors.push(cursor.error);
  }

  if (errors.length > 0) {
    logger.info("issue_list_validation_failed", {
      error_count: errors.length,
      issue_family: issueFamily,
      severity: severity.value,
      status,
      source,
    });

    return writeJson(response, 400, {
      error: {
        code: "bad_request",
        message: "validation failed",
        details: errors,
      },
    });
  }

  const result = await store.listIssues({
    issueFamily,
    severity: severity.value,
    status,
    source,
    limit: limit.value,
    cursor: cursor.value,
  });
  const body = buildListResponse({
    items: result.items.map(projectIssueListItem),
    requestedLimit: limit.value,
    nextCursorBuilder: (item) => ({
      type: "issue_list_v1",
      created_at: item.created_at,
      issue_id: item.issue_id,
    }),
  });

  logger.info("issue_list_retrieved", {
    issue_family: issueFamily,
    severity: severity.value,
    status,
    source,
    limit: limit.value,
    count: body.items.length,
    has_more: body.page.has_more,
    cursor_present: cursor.value !== null,
  });
  emitCount(metrics, METRIC_NAMES.ISSUE_LIST_RETRIEVED_TOTAL, 1, {
    issue_family: issueFamily,
    severity: severity.value,
    status,
    source,
    limit_present: limit.value !== null,
    has_more: body.page.has_more,
    cursor_present: cursor.value !== null,
  });

  return writeJson(response, 200, body);
}

async function handleIssueStatusUpdate({ request, response, store, logger, metrics, issueId }) {
  let body;

  try {
    body = await readJsonBody(request);
  } catch (error) {
    emitCount(metrics, METRIC_NAMES.ISSUE_STATUS_UPDATE_TOTAL, 1, {
      outcome: "validation_failed",
      failure_stage: "read_body",
    });
    return writeJson(response, 400, {
      error: {
        code: "bad_request",
        message: error.message,
      },
    });
  }

  const validation = validateIssueStatusUpdateRequest(body);
  if (!validation.ok) {
    logger.info("issue_status_update_validation_failed", {
      issue_id: issueId,
      error_count: validation.errors.length,
    });
    emitCount(metrics, METRIC_NAMES.ISSUE_STATUS_UPDATE_TOTAL, 1, {
      outcome: "validation_failed",
      failure_stage: "validate",
    });

    return writeJson(response, 400, {
      error: {
        code: "bad_request",
        message: "validation failed",
        details: validation.errors,
      },
    });
  }

  const result = await store.updateIssueStatus({
    issueId,
    status: validation.value.status,
    expectedVersion: validation.value.expected_version,
  });

  if (result.kind === "not_found") {
    logger.info("issue_status_update_not_found", {
      issue_id: issueId,
    });
    emitCount(metrics, METRIC_NAMES.ISSUE_STATUS_UPDATE_TOTAL, 1, {
      outcome: "not_found",
    });

    return writeJson(response, 404, {
      error: {
        code: "not_found",
        message: "issue not found",
      },
    });
  }

  if (result.kind === "version_conflict") {
    logger.info("issue_status_update_conflict", {
      issue_id: issueId,
      error_code: "version_conflict",
    });
    emitCount(metrics, METRIC_NAMES.ISSUE_STATUS_UPDATE_TOTAL, 1, {
      outcome: "conflict",
      error_code: "version_conflict",
    });

    return writeJson(response, 409, {
      error: {
        code: "version_conflict",
        message: "expected_version does not match current issue version",
      },
    });
  }

  logger.info("issue_status_update_processed", {
    issue_id: issueId,
    previous_status: result.body.previous_status,
    current_status: result.body.current_status,
    previous_version: result.body.previous_version,
    current_version: result.body.current_version,
  });
  emitCount(metrics, METRIC_NAMES.ISSUE_STATUS_UPDATE_TOTAL, 1, {
    outcome: "updated",
  });

  return writeJson(response, 200, result.body);
}

async function handleIssueDetail({ response, store, logger, issueId }) {
  const issue = await store.getIssueById(issueId);
  if (!issue) {
    logger.info("issue_detail_not_found", {
      issue_id: issueId,
    });

    return writeJson(response, 404, {
      error: {
        code: "not_found",
        message: "issue not found",
      },
    });
  }

  logger.info("issue_detail_retrieved", {
    issue_id: issueId,
    issue_family: issue.issue_family,
    severity: issue.severity,
    status: issue.status,
  });

  return writeJson(response, 200, projectIssueDetail(issue));
}

async function handleIssueTraces({ request, response, issueStore, traceStore, logger, metrics, issueId }) {
  if (!hasNonEmptyString(issueId)) {
    return writeJson(response, 400, {
      error: {
        code: "bad_request",
        message: "issue_id is required",
      },
    });
  }

  const issue = await issueStore.getIssueById(issueId);
  if (!issue) {
    logger.info("issue_traces_not_found", {
      issue_id: issueId,
    });

    return writeJson(response, 404, {
      error: {
        code: "not_found",
        message: "issue not found",
      },
    });
  }

  const url = new URL(request.url, "http://127.0.0.1");
  const limit = normalizeLimit(url.searchParams.get("limit"));
  const cursor = parseTypedCursor(url.searchParams.get("cursor"), {
    expectedType: "trace_list_v1",
    requiredKeys: ["created_at", "trace_id"],
  });
  const errors = [];

  if (limit.error) {
    errors.push(limit.error);
  }

  if (cursor.error) {
    errors.push(cursor.error);
  }

  if (errors.length > 0) {
    logger.info("issue_traces_validation_failed", {
      issue_id: issueId,
      error_count: errors.length,
    });

    return writeJson(response, 400, {
      error: {
        code: "bad_request",
        message: "validation failed",
        details: errors,
      },
    });
  }

  const result = await traceStore.listTraces({
    status: null,
    changeId: null,
    primaryIssueId: issueId,
    limit: limit.value,
    cursor: cursor.value,
  });
  const body = buildListResponse({
    items: result.items.map(projectTraceListItem),
    requestedLimit: limit.value,
    nextCursorBuilder: (item) => ({
      type: "trace_list_v1",
      created_at: item.created_at,
      trace_id: item.trace_id,
    }),
  });

  logger.info("issue_traces_retrieved", {
    issue_id: issueId,
    limit: limit.value,
    count: body.items.length,
    has_more: body.page.has_more,
    cursor_present: cursor.value !== null,
  });
  emitCount(metrics, METRIC_NAMES.TRACE_LIST_RETRIEVED_TOTAL, 1, {
    status: null,
    change_id_present: false,
    primary_issue_id_present: true,
    limit_present: limit.value !== null,
    has_more: body.page.has_more,
    cursor_present: cursor.value !== null,
  });

  return writeJson(response, 200, body);
}

function validateIssueIntakeRequest(body) {
  if (!isPlainObject(body)) {
    return {
      ok: false,
      errors: ["request body must be a JSON object"],
    };
  }

  const errors = [];

  for (const field of Object.keys(body)) {
    if (!ISSUE_INTAKE_ALLOWED_FIELDS.includes(field)) {
      errors.push(`unknown field: ${field}`);
    }
  }

  for (const field of ISSUE_INTAKE_REQUIRED_FIELDS) {
    if (field === "severity") {
      if (body.severity === undefined || body.severity === null) {
        errors.push("severity is required");
      }
      continue;
    }

    if (!hasNonEmptyString(body[field])) {
      errors.push(`${field} is required`);
    }
  }

  const occurredAt = new Date(body.occurred_at);
  if (body.occurred_at && Number.isNaN(occurredAt.getTime())) {
    errors.push("occurred_at must be a valid ISO 8601 date-time");
  }

  if (body.severity !== undefined) {
    if (!Number.isInteger(body.severity) || body.severity < 1 || body.severity > 5) {
      errors.push("severity must be an integer between 1 and 5");
    }
  }

  if (body.keywords !== undefined && body.keywords !== null) {
    if (!Array.isArray(body.keywords) || body.keywords.some((item) => typeof item !== "string")) {
      errors.push("keywords must be an array of strings");
    }
  }

  if (body.payload !== undefined && body.payload !== null && !isPlainObject(body.payload)) {
    errors.push("payload must be an object");
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
    };
  }

  return {
    ok: true,
    value: {
      idempotency_key: normalizeOptionalString(body.idempotency_key),
      external_id: normalizeOptionalString(body.external_id),
      source: body.source.trim(),
      title: body.title.trim(),
      body: normalizeOptionalString(body.body),
      issue_family: body.issue_family.trim(),
      severity: body.severity,
      keywords: body.keywords ?? null,
      affected_variation: normalizeOptionalString(body.affected_variation),
      payload: body.payload ?? null,
      reporter: normalizeOptionalString(body.reporter),
      occurred_at: occurredAt.toISOString(),
    },
  };
}

function validateIssueStatusUpdateRequest(body) {
  if (!isPlainObject(body)) {
    return {
      ok: false,
      errors: ["request body must be a JSON object"],
    };
  }

  const errors = [];

  for (const field of Object.keys(body)) {
    if (!ISSUE_STATUS_UPDATE_ALLOWED_FIELDS.includes(field)) {
      errors.push(`unknown field: ${field}`);
    }
  }

  if (body.status === undefined || body.status === null) {
    errors.push("status is required");
  } else if (typeof body.status !== "string") {
    errors.push("status must be a string");
  } else if (!ISSUE_STATUSES.includes(body.status)) {
    errors.push("status must be one of: open, investigating, resolved, ignored");
  }

  if (body.expected_version === undefined || body.expected_version === null) {
    errors.push("expected_version is required");
  } else if (!Number.isInteger(body.expected_version) || body.expected_version < 1) {
    errors.push("expected_version must be a positive integer");
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
    };
  }

  return {
    ok: true,
    value: {
      status: body.status,
      expected_version: body.expected_version,
    },
  };
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";

    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error("request body too large"));
        request.destroy();
      }
    });

    request.on("end", () => {
      if (raw.length === 0) {
        reject(new Error("request body is required"));
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (_error) {
        reject(new Error("request body must be valid JSON"));
      }
    });

    request.on("error", () => {
      reject(new Error("failed to read request body"));
    });
  });
}

function writeJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function hasNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeOptionalString(value) {
  return hasNonEmptyString(value) ? value.trim() : null;
}

function normalizeOptionalQuery(value) {
  return hasNonEmptyString(value) ? value.trim() : null;
}

function normalizeSeverity(value) {
  if (value === null) {
    return {
      value: null,
      error: null,
    };
  }

  if (!/^[1-5]$/.test(value)) {
    return {
      value: null,
      error: "severity must be an integer between 1 and 5",
    };
  }

  return {
    value: Number.parseInt(value, 10),
    error: null,
  };
}

function normalizeLimit(value) {
  if (value === null) {
    return {
      value: null,
      error: null,
    };
  }

  if (!/^[1-9][0-9]*$/.test(value)) {
    return {
      value: null,
      error: "limit must be a positive integer",
    };
  }

  return {
    value: Number.parseInt(value, 10),
    error: null,
  };
}

function projectIssueListItem(issue) {
  return {
    issue_id: issue.issue_id,
    summary: deriveIssueSummary(issue),
    issue_family: issue.issue_family,
    severity: issue.severity,
    status: issue.status,
    source: issue.source,
    external_id_present: issue.external_id_present,
    created_at: issue.created_at,
  };
}

function projectIssueDetail(issue) {
  return {
    ...projectIssueListItem(issue),
    reporter_present: issue.reporter_present,
    affected_variation_present: issue.affected_variation_present,
    keywords_count: issue.keywords_count,
    body_present: issue.body_present,
  };
}

function deriveIssueSummary(issue) {
  return hasNonEmptyString(issue.summary)
    ? issue.summary
    : hasNonEmptyString(issue.issue_family)
      ? issue.issue_family
      : "Issue summary unavailable";
}

function projectTraceListItem(trace) {
  return {
    trace_id: trace.trace_id,
    change_id: trace.change_id ?? null,
    primary_issue_id: trace.primary_issue_id ?? null,
    status: trace.status,
    confidence: trace.confidence,
    anomaly_type: trace.anomaly_type,
    anomaly_metric: trace.anomaly_metric,
    anomaly_window_start: trace.anomaly_window_start,
    anomaly_window_end: trace.anomaly_window_end,
    created_at: trace.created_at,
  };
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

module.exports = {
  handleIssueDetail,
  handleIssueIntake,
  handleIssueList,
  handleIssueStatusUpdate,
  handleIssueTraces,
  validateIssueIntakeRequest,
  validateIssueStatusUpdateRequest,
};
