const {
  EVENT_TYPES,
  EVENT_INTAKE_REQUIRED_FIELDS,
  EVENT_INTAKE_ALLOWED_FIELDS,
} = require("../../../packages/contracts/event-intake");
const { METRIC_NAMES, emitCount } = require("./metrics");

const EMAIL_LIKE_PATTERN = /@/;
const WHITESPACE_PATTERN = /\s/;
const PHONE_LIKE_PATTERN = /^\+?[0-9][0-9\-()]{6,}$/;

async function handleEventIntake({ request, response, store, logger, metrics }) {
  let body;

  try {
    body = await readJsonBody(request);
  } catch (error) {
    emitCount(metrics, METRIC_NAMES.EVENT_INTAKE_TOTAL, 1, {
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

  const validation = validateEventIntakeRequest(body);
  if (!validation.ok) {
    logger.info("event_intake_validation_failed", {
      error_count: validation.errors.length,
      source: hasNonEmptyString(body && body.source) ? body.source.trim() : null,
      event_id: hasNonEmptyString(body && body.event_id) ? body.event_id.trim() : null,
    });
    emitCount(metrics, METRIC_NAMES.EVENT_INTAKE_TOTAL, 1, {
      outcome: "validation_failed",
      failure_stage: "validate",
      source: hasNonEmptyString(body?.source) ? body.source.trim() : null,
      target_service: hasNonEmptyString(body?.target_service) ? body.target_service.trim() : null,
      event_type: hasNonEmptyString(body?.event_type) ? body.event_type.trim() : null,
      is_error: typeof body?.is_error === "boolean" ? body.is_error : null,
    });

    return writeJson(response, 400, {
      error: {
        code: "bad_request",
        message: "validation failed",
        details: validation.errors,
      },
    });
  }

  const result = await store.acceptOrReplay(validation.value);
  logger.info("event_intake_processed", {
    event_id: result.body.event_id,
    replay: result.body.idempotent_replay,
    source: validation.value.source,
    target_service: validation.value.target_service,
    event_type: validation.value.event_type,
  });
  emitCount(metrics, METRIC_NAMES.EVENT_INTAKE_TOTAL, 1, {
    outcome: result.body.idempotent_replay ? "replay" : "created",
    source: validation.value.source,
    target_service: validation.value.target_service,
    event_type: validation.value.event_type,
    is_error: validation.value.is_error,
  });

  return writeJson(response, result.statusCode, result.body);
}

function validateEventIntakeRequest(body) {
  if (!isPlainObject(body)) {
    return {
      ok: false,
      errors: ["request body must be a JSON object"],
    };
  }

  const errors = [];

  for (const field of Object.keys(body)) {
    if (!EVENT_INTAKE_ALLOWED_FIELDS.includes(field)) {
      errors.push(`unknown field: ${field}`);
    }
  }

  for (const field of EVENT_INTAKE_REQUIRED_FIELDS) {
    if (!hasNonEmptyString(body[field])) {
      errors.push(`${field} is required`);
    }
  }

  if (body.event_type && !EVENT_TYPES.includes(body.event_type)) {
    errors.push("event_type must be one of: product, support_issue");
  }

  const occurredAt = new Date(body.occurred_at);
  if (body.occurred_at && Number.isNaN(occurredAt.getTime())) {
    errors.push("occurred_at must be a valid ISO 8601 date-time");
  }

  if (body.retry_count !== undefined) {
    if (!Number.isInteger(body.retry_count) || body.retry_count < 0 || body.retry_count > 255) {
      errors.push("retry_count must be an integer between 0 and 255");
    }
  }

  if (body.is_error !== undefined && typeof body.is_error !== "boolean") {
    errors.push("is_error must be a boolean");
  }

  if (body.payload !== undefined && body.payload !== null && !isPlainObject(body.payload)) {
    errors.push("payload must be an object");
  }

  if (body.duration_ms !== undefined && body.duration_ms !== null) {
    if (!Number.isInteger(body.duration_ms) || body.duration_ms < 0) {
      errors.push("duration_ms must be a non-negative integer");
    }
  }

  validatePseudonymousIdentifier("user_id", body.user_id, errors);
  validatePseudonymousIdentifier("session_id", body.session_id, errors);
  validatePseudonymousIdentifier("request_id", body.request_id, errors);

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
    };
  }

  return {
    ok: true,
    value: {
      event_id: body.event_id.trim(),
      occurred_at: occurredAt.toISOString(),
      target_service: body.target_service.trim(),
      event_type: body.event_type,
      event_subtype: body.event_subtype.trim(),
      variation: normalizeOptionalString(body.variation),
      cohort: normalizeOptionalString(body.cohort),
      duration_ms: body.duration_ms ?? null,
      retry_count: body.retry_count ?? 0,
      is_error: body.is_error ?? false,
      user_id: normalizeOptionalString(body.user_id),
      session_id: normalizeOptionalString(body.session_id),
      request_id: normalizeOptionalString(body.request_id),
      payload: body.payload ?? null,
      source: body.source.trim(),
      ingestion_batch_id: normalizeOptionalString(body.ingestion_batch_id),
    },
  };
}

function validatePseudonymousIdentifier(fieldName, value, errors) {
  if (value === undefined || value === null) {
    return;
  }

  if (!hasNonEmptyString(value)) {
    errors.push(`${fieldName} must be a non-empty string`);
    return;
  }

  const normalized = value.trim();
  if (EMAIL_LIKE_PATTERN.test(normalized) || WHITESPACE_PATTERN.test(normalized) || PHONE_LIKE_PATTERN.test(normalized)) {
    errors.push(`${fieldName} must be a pseudonymous identifier`);
  }
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

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

module.exports = {
  handleEventIntake,
  validateEventIntakeRequest,
};
