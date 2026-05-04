const {
  CHANGE_TYPES,
  CHANGE_INTAKE_REQUIRED_FIELDS,
  CHANGE_INTAKE_ALLOWED_FIELDS,
} = require("../../../packages/contracts/change-intake");
const { buildListResponse, parseTypedCursor } = require("./list-page");
const { METRIC_NAMES, emitCount } = require("./metrics");

const FIVE_MINUTES_IN_MS = 5 * 60 * 1000;
const ACTOR_MAX_LENGTH = 120;

function validateChangeIntakeRequest(body, now = new Date()) {
  if (!isPlainObject(body)) {
    return {
      ok: false,
      errors: ["request body must be a JSON object"],
    };
  }

  const errors = [];

  for (const field of Object.keys(body)) {
    if (!CHANGE_INTAKE_ALLOWED_FIELDS.includes(field)) {
      errors.push(`unknown field: ${field}`);
    }
  }

  for (const field of CHANGE_INTAKE_REQUIRED_FIELDS) {
    if (!hasNonEmptyString(body[field])) {
      errors.push(`${field} is required`);
    }
  }

  if (body.change_type && !CHANGE_TYPES.includes(body.change_type)) {
    errors.push("change_type must be one of: release, flag, rule");
  }

  const occurredAt = new Date(body.occurred_at);
  if (body.occurred_at && Number.isNaN(occurredAt.getTime())) {
    errors.push("occurred_at must be a valid ISO 8601 date-time");
  }

  if (!Number.isNaN(occurredAt.getTime())) {
    const maxAllowed = now.getTime() + FIVE_MINUTES_IN_MS;
    if (occurredAt.getTime() > maxAllowed) {
      errors.push("occurred_at cannot be more than 5 minutes in the future");
    }
  }

  if (body.rule_scope !== undefined && body.rule_scope !== null && !isPlainObject(body.rule_scope)) {
    errors.push("rule_scope must be an object");
  }

  if (body.payload !== undefined && body.payload !== null && !isPlainObject(body.payload)) {
    errors.push("payload must be an object");
  }

  if (body.actor !== undefined && body.actor !== null) {
    if (typeof body.actor !== "string") {
      errors.push("actor must be a string");
    } else if (body.actor.trim().length === 0) {
      errors.push("actor must not be empty if provided");
    } else if (body.actor.length > ACTOR_MAX_LENGTH) {
      errors.push(`actor must be at most ${ACTOR_MAX_LENGTH} characters`);
    } else if (body.actor.includes("@")) {
      errors.push("actor must be a non-personal system identifier (no email-like values)");
    } else if (/\s/.test(body.actor)) {
      errors.push("actor must be a non-personal system identifier (no whitespace)");
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
      idempotency_key: body.idempotency_key.trim(),
      change_type: body.change_type,
      title: body.title.trim(),
      target_service: body.target_service.trim(),
      target_component: normalizeOptionalString(body.target_component),
      variation: normalizeOptionalString(body.variation),
      cohort: normalizeOptionalString(body.cohort),
      rule_scope: body.rule_scope ?? null,
      payload: body.payload ?? null,
      actor: normalizeOptionalString(body.actor),
      source: body.source.trim(),
      occurred_at: occurredAt.toISOString(),
    },
  };
}

async function handleChangeIntake({ request, response, store, logger, metrics }) {
  let body;

  try {
    body = await readJsonBody(request);
  } catch (error) {
    emitCount(metrics, METRIC_NAMES.CHANGE_INTAKE_TOTAL, 1, {
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

  const validation = validateChangeIntakeRequest(body);
  if (!validation.ok) {
    logger.info("change_intake_validation_failed", {
      error_count: validation.errors.length,
      source: hasNonEmptyString(body && body.source) ? body.source.trim() : null,
    });
    emitCount(metrics, METRIC_NAMES.CHANGE_INTAKE_TOTAL, 1, {
      outcome: "validation_failed",
      failure_stage: "validate",
      source: hasNonEmptyString(body?.source) ? body.source.trim() : null,
      change_type: hasNonEmptyString(body?.change_type) ? body.change_type.trim() : null,
      target_service: hasNonEmptyString(body?.target_service) ? body.target_service.trim() : null,
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
  logger.info("change_intake_processed", {
    change_id: result.body.change_id,
    replay: result.body.idempotent_replay,
    source: validation.value.source,
    target_service: validation.value.target_service,
  });
  emitCount(metrics, METRIC_NAMES.CHANGE_INTAKE_TOTAL, 1, {
    outcome: result.body.idempotent_replay ? "replay" : "created",
    source: validation.value.source,
    change_type: validation.value.change_type,
    target_service: validation.value.target_service,
  });

  return writeJson(response, result.statusCode, result.body);
}

async function handleChangeList({ request, response, store, logger, metrics }) {
  const url = new URL(request.url, "http://127.0.0.1");
  const changeType = normalizeOptionalQuery(url.searchParams.get("change_type"));
  const targetService = normalizeOptionalQuery(url.searchParams.get("target_service"));
  const source = normalizeOptionalQuery(url.searchParams.get("source"));
  const limit = normalizeLimit(url.searchParams.get("limit"));
  const cursor = parseTypedCursor(url.searchParams.get("cursor"), {
    expectedType: "change_list_v1",
    requiredKeys: ["occurred_at", "change_id"],
  });

  const errors = [];

  if (changeType && !CHANGE_TYPES.includes(changeType)) {
    errors.push("change_type must be one of: release, flag, rule");
  }

  if (limit.error) {
    errors.push(limit.error);
  }

  if (cursor.error) {
    errors.push(cursor.error);
  }

  if (errors.length > 0) {
    logger.info("change_list_validation_failed", {
      error_count: errors.length,
      change_type: changeType,
      target_service: targetService,
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

  const result = await store.listChanges({
    changeType,
    targetService,
    source,
    limit: limit.value,
    cursor: cursor.value,
  });
  const body = buildListResponse({
    items: result.items,
    requestedLimit: limit.value,
    nextCursorBuilder: (item) => ({
      type: "change_list_v1",
      occurred_at: item.occurred_at,
      change_id: item.change_id,
    }),
  });

  logger.info("change_list_retrieved", {
    change_type: changeType,
    target_service: targetService,
    source,
    limit: limit.value,
    count: body.items.length,
    has_more: body.page.has_more,
    cursor_present: cursor.value !== null,
  });
  emitCount(metrics, METRIC_NAMES.CHANGE_LIST_RETRIEVED_TOTAL, 1, {
    change_type: changeType,
    target_service: targetService,
    source,
    limit_present: limit.value !== null,
    has_more: body.page.has_more,
    cursor_present: cursor.value !== null,
  });

  return writeJson(response, 200, body);
}

async function handleChangeDetail({ response, store, logger, changeId }) {
  const change = await store.getChangeById(changeId);
  if (!change) {
    logger.info("change_detail_not_found", {
      change_id: changeId,
    });

    return writeJson(response, 404, {
      error: {
        code: "not_found",
        message: "change not found",
      },
    });
  }

  logger.info("change_detail_retrieved", {
    change_id: changeId,
    change_type: change.change_type,
    target_service: change.target_service,
  });

  return writeJson(response, 200, change);
}

async function handleChangeTraces({ request, response, changeStore, traceStore, logger, metrics, changeId }) {
  if (!hasNonEmptyString(changeId)) {
    return writeJson(response, 400, {
      error: {
        code: "bad_request",
        message: "change_id is required",
      },
    });
  }

  const change = await changeStore.getChangeById(changeId);
  if (!change) {
    logger.info("change_traces_not_found", {
      change_id: changeId,
    });

    return writeJson(response, 404, {
      error: {
        code: "not_found",
        message: "change not found",
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
    logger.info("change_traces_validation_failed", {
      change_id: changeId,
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
    changeId,
    primaryIssueId: null,
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

  logger.info("change_traces_retrieved", {
    change_id: changeId,
    limit: limit.value,
    count: body.items.length,
    has_more: body.page.has_more,
    cursor_present: cursor.value !== null,
  });
  emitCount(metrics, METRIC_NAMES.TRACE_LIST_RETRIEVED_TOTAL, 1, {
    status: null,
    change_id_present: true,
    primary_issue_id_present: false,
    limit_present: limit.value !== null,
    has_more: body.page.has_more,
    cursor_present: cursor.value !== null,
  });

  return writeJson(response, 200, body);
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
  handleChangeDetail,
  handleChangeIntake,
  handleChangeList,
  handleChangeTraces,
  validateChangeIntakeRequest,
};
