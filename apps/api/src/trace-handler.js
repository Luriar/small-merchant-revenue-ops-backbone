const {
  TRACE_CREATE_ALLOWED_FIELDS,
  TRACE_CREATE_REQUIRED_FIELDS,
  TRACE_EVIDENCE_ALLOWED_FIELDS,
  TRACE_STATUSES,
} = require("../../../packages/contracts/trace-create");
const { buildListResponse, parseTypedCursor } = require("./list-page");
const { METRIC_NAMES, emitCount, emitHistogram } = require("./metrics");

// NOTE: Internal/worker-only. This is not part of the public OpenAPI v0.2
// contract; trace creation should be pipeline-generated, not arbitrary user
// mutation.
async function handleTraceCreate({ request, response, store, logger, metrics }) {
  let body;

  try {
    body = await readJsonBody(request);
  } catch (error) {
    emitCount(metrics, METRIC_NAMES.TRACE_CREATE_TOTAL, 1, {
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

  const validation = validateTraceCreateRequest(body);
  if (!validation.ok) {
    logger.info("trace_create_validation_failed", {
      error_count: validation.errors.length,
      change_id: typeof body?.change_id === "string" ? body.change_id.trim() : null,
      primary_issue_id: typeof body?.primary_issue_id === "string" ? body.primary_issue_id.trim() : null,
    });
    emitCount(metrics, METRIC_NAMES.TRACE_CREATE_TOTAL, 1, {
      outcome: "validation_failed",
      failure_stage: "validate",
      change_id_present: typeof body?.change_id === "string" && body.change_id.trim().length > 0,
      primary_issue_id_present: typeof body?.primary_issue_id === "string" && body.primary_issue_id.trim().length > 0,
    });

    return writeJson(response, 400, {
      error: {
        code: "bad_request",
        message: "validation failed",
        details: validation.errors,
      },
    });
  }

  const result = await store.createOrReuseTraceWithEvidence(validation.value);
  logger.info("trace_create_processed", {
    trace_id: result.trace_id,
    trace_created: result.trace_created,
    evidence_count: result.evidence_count,
    evidence_created_count: result.evidence_created_count,
    evidence_skipped_count: result.evidence_skipped_count,
  });
  emitCount(metrics, METRIC_NAMES.TRACE_CREATE_TOTAL, 1, {
    outcome: result.trace_created ? "created" : "reused",
  });
  emitHistogram(metrics, METRIC_NAMES.TRACE_CREATE_EVIDENCE_COUNT, result.evidence_count, {
    outcome: result.trace_created ? "created" : "reused",
  });

  return writeJson(response, result.trace_created ? 201 : 200, result);
}

async function handleTraceList({ request, response, store, logger, metrics }) {
  const url = new URL(request.url, "http://127.0.0.1");
  const status = normalizeOptionalQuery(url.searchParams.get("status"));
  const changeId = normalizeOptionalQuery(url.searchParams.get("change_id"));
  const primaryIssueId = normalizeOptionalQuery(url.searchParams.get("primary_issue_id"));
  const limit = normalizeLimit(url.searchParams.get("limit"));
  const cursor = parseTypedCursor(url.searchParams.get("cursor"), {
    expectedType: "trace_list_v1",
    requiredKeys: ["created_at", "trace_id"],
  });

  const errors = [];

  if (status && !TRACE_STATUSES.includes(status)) {
    errors.push("status must be one of: suspected, confirmed, dismissed");
  }

  if (limit.error) {
    errors.push(limit.error);
  }

  if (cursor.error) {
    errors.push(cursor.error);
  }

  if (errors.length > 0) {
    logger.info("trace_list_validation_failed", {
      error_count: errors.length,
      status,
      change_id: changeId,
      primary_issue_id: primaryIssueId,
    });

    return writeJson(response, 400, {
      error: {
        code: "bad_request",
        message: "validation failed",
        details: errors,
      },
    });
  }

  const result = await store.listTraces({
    status,
    changeId,
    primaryIssueId,
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

  logger.info("trace_list_retrieved", {
    status,
    change_id: changeId,
    primary_issue_id: primaryIssueId,
    limit: limit.value,
    count: body.items.length,
    has_more: body.page.has_more,
    cursor_present: cursor.value !== null,
  });
  emitCount(metrics, METRIC_NAMES.TRACE_LIST_RETRIEVED_TOTAL, 1, {
    status,
    change_id_present: changeId !== null,
    primary_issue_id_present: primaryIssueId !== null,
    limit_present: limit.value !== null,
    has_more: body.page.has_more,
    cursor_present: cursor.value !== null,
  });

  return writeJson(response, 200, body);
}

async function handleTraceDetail({ response, store, logger, traceId }) {
  const trace = await store.getTraceById(traceId);
  if (!trace) {
    logger.info("trace_detail_not_found", {
      trace_id: traceId,
    });

    return writeJson(response, 404, {
      error: {
        code: "not_found",
        message: "trace not found",
      },
    });
  }

  const body = projectTraceDetail(trace);

  logger.info("trace_detail_retrieved", {
    trace_id: traceId,
    status: body.status,
  });

  return writeJson(response, 200, body);
}

async function handleTraceEvidences({ response, store, logger, traceId }) {
  const trace = await store.getTraceById(traceId);
  if (!trace) {
    logger.info("trace_evidences_not_found", {
      trace_id: traceId,
    });

    return writeJson(response, 404, {
      error: {
        code: "not_found",
        message: "trace not found",
      },
    });
  }

  const result = await store.listTraceEvidences(traceId);
  const items = result.items.map(projectTraceEvidenceItem);

  logger.info("trace_evidences_retrieved", {
    trace_id: traceId,
    count: items.length,
  });

  return writeJson(response, 200, { items });
}

async function handleTracePrimaryIssue({ response, traceStore, issueStore, logger, traceId }) {
  const trace = await traceStore.getTraceById(traceId);
  if (!trace) {
    logger.info("trace_primary_issue_trace_not_found", {
      trace_id: traceId,
    });

    return writeJson(response, 404, {
      error: {
        code: "not_found",
        message: "trace not found",
      },
    });
  }

  if (!hasNonEmptyString(trace.primary_issue_id)) {
    logger.info("trace_primary_issue_not_found", {
      trace_id: traceId,
      primary_issue_id: null,
    });

    return writeJson(response, 404, {
      error: {
        code: "not_found",
        message: "primary issue not found",
      },
    });
  }

  const issue = await issueStore.getIssueById(trace.primary_issue_id);
  if (!issue) {
    logger.info("trace_primary_issue_not_found", {
      trace_id: traceId,
      primary_issue_id: trace.primary_issue_id,
    });

    return writeJson(response, 404, {
      error: {
        code: "not_found",
        message: "primary issue not found",
      },
    });
  }

  const body = projectPrimaryIssueDetail(issue);

  logger.info("trace_primary_issue_retrieved", {
    trace_id: traceId,
    primary_issue_id: body.issue_id,
    issue_family: body.issue_family,
    status: body.status,
  });

  return writeJson(response, 200, body);
}

function validateTraceCreateRequest(body) {
  if (!isPlainObject(body)) {
    return {
      ok: false,
      errors: ["request body must be a JSON object"],
    };
  }

  const errors = [];

  for (const field of Object.keys(body)) {
    if (!TRACE_CREATE_ALLOWED_FIELDS.includes(field)) {
      errors.push(`unknown field: ${field}`);
    }
  }

  for (const field of TRACE_CREATE_REQUIRED_FIELDS) {
    if (field === "evidences") {
      if (!Array.isArray(body.evidences) || body.evidences.length === 0) {
        errors.push("evidences is required");
      }
      continue;
    }

    if (!hasNonEmptyString(body[field])) {
      errors.push(`${field} is required`);
    }
  }

  const anomalyWindowStart = new Date(body.anomaly_window_start);
  if (body.anomaly_window_start && Number.isNaN(anomalyWindowStart.getTime())) {
    errors.push("anomaly_window_start must be a valid ISO 8601 date-time");
  }

  const anomalyWindowEnd = new Date(body.anomaly_window_end);
  if (body.anomaly_window_end && Number.isNaN(anomalyWindowEnd.getTime())) {
    errors.push("anomaly_window_end must be a valid ISO 8601 date-time");
  }

  if (Array.isArray(body.evidences)) {
    for (const [index, evidence] of body.evidences.entries()) {
      if (!isPlainObject(evidence)) {
        errors.push(`evidences[${index}] must be an object`);
        continue;
      }

      for (const field of Object.keys(evidence)) {
        if (!TRACE_EVIDENCE_ALLOWED_FIELDS.includes(field)) {
          errors.push(`evidences[${index}] unknown field: ${field}`);
        }
      }

      for (const field of ["evidence_type", "source_ref", "summary"]) {
        if (!hasNonEmptyString(evidence[field])) {
          errors.push(`evidences[${index}].${field} is required`);
        }
      }

      if (evidence.payload !== undefined && evidence.payload !== null && !isPlainObject(evidence.payload)) {
        errors.push(`evidences[${index}].payload must be an object`);
      }
    }
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
      change_id: body.change_id.trim(),
      primary_issue_id: body.primary_issue_id.trim(),
      anomaly_type: body.anomaly_type.trim(),
      anomaly_metric: body.anomaly_metric.trim(),
      anomaly_window_start: anomalyWindowStart.toISOString(),
      anomaly_window_end: anomalyWindowEnd.toISOString(),
      evidences: body.evidences.map((evidence) => ({
        evidence_type: evidence.evidence_type.trim(),
        source_ref: evidence.source_ref.trim(),
        summary: evidence.summary.trim(),
        strength: hasNonEmptyString(evidence.strength) ? evidence.strength.trim() : null,
        payload: evidence.payload ?? null,
      })),
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

function hasNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function projectTraceDetail(trace) {
  return {
    ...projectTraceListItem(trace),
    evidence_count: trace.evidence_count,
  };
}

function projectTraceEvidenceItem(evidence) {
  return {
    evidence_id: evidence.evidence_id,
    trace_id: evidence.trace_id,
    evidence_type: evidence.evidence_type,
    strength: evidence.strength ?? null,
    summary: evidence.summary,
    source_ref: evidence.source_ref ?? null,
  };
}

function projectPrimaryIssueDetail(issue) {
  return {
    issue_id: issue.issue_id,
    summary: deriveIssueSummary(issue),
    issue_family: issue.issue_family,
    severity: issue.severity,
    status: issue.status,
    source: issue.source,
    external_id_present: issue.external_id_present,
    created_at: issue.created_at,
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

module.exports = {
  handleTraceCreate,
  handleTraceDetail,
  handleTraceEvidences,
  handleTraceList,
  handleTracePrimaryIssue,
  validateTraceCreateRequest,
};
