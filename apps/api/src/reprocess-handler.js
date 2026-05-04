const {
  REPROCESS_TARGET_KINDS,
  REPROCESS_REQUIRED_FIELDS,
  REPROCESS_ALLOWED_FIELDS,
} = require("../../../packages/contracts/reprocess-run");
const { METRIC_NAMES, emitCount } = require("./metrics");

async function handleReprocessRun({ request, response, store, logger, metrics }) {
  let body;

  try {
    body = await readJsonBody(request);
  } catch (error) {
    emitCount(metrics, METRIC_NAMES.REPROCESS_RUN_TOTAL, 1, {
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

  const validation = validateReprocessRequest(body);
  if (!validation.ok) {
    logger.info("reprocess_run_validation_failed", {
      error_count: validation.errors.length,
      target_kind: typeof body?.target_kind === "string" ? body.target_kind.trim() : null,
    });
    emitCount(metrics, METRIC_NAMES.REPROCESS_RUN_TOTAL, 1, {
      outcome: "validation_failed",
      failure_stage: "validate",
      target_kind: typeof body?.target_kind === "string" ? body.target_kind.trim() : null,
    });

    return writeJson(response, 400, {
      error: {
        code: "bad_request",
        message: "validation failed",
        details: validation.errors,
      },
    });
  }

  const result = await store.requestReprocess({
    idempotencyKey: validation.value.idempotency_key,
    targetKind: validation.value.target_kind,
    targetRef: validation.value.target_ref,
    reason: validation.value.reason,
  });

  if (result.kind === "conflict") {
    logger.info("reprocess_run_conflict", {
      target_kind: validation.value.target_kind,
      target_ref: validation.value.target_ref,
    });
    emitCount(metrics, METRIC_NAMES.REPROCESS_RUN_TOTAL, 1, {
      outcome: "conflict",
      target_kind: validation.value.target_kind,
      error_code: result.body?.error?.code ?? null,
    });

    return writeJson(response, 409, result.body);
  }

  logger.info("reprocess_run_processed", {
    new_run_id: result.body.new_run_id,
    replay: result.body.idempotent_replay,
    target_kind: validation.value.target_kind,
    target_ref: validation.value.target_ref,
  });
  emitCount(metrics, METRIC_NAMES.REPROCESS_RUN_TOTAL, 1, {
    outcome: result.body.idempotent_replay ? "replay" : "created",
    target_kind: validation.value.target_kind,
  });

  return writeJson(response, result.statusCode, result.body);
}

function validateReprocessRequest(body) {
  if (!isPlainObject(body)) {
    return {
      ok: false,
      errors: ["request body must be a JSON object"],
    };
  }

  const errors = [];

  for (const field of Object.keys(body)) {
    if (!REPROCESS_ALLOWED_FIELDS.includes(field)) {
      errors.push(`unknown field: ${field}`);
    }
  }

  for (const field of REPROCESS_REQUIRED_FIELDS) {
    if (field === "reason") {
      if (body[field] === undefined || body[field] === null) {
        errors.push(`${field} is required`);
      }
      continue;
    }

    if (!hasNonEmptyString(body[field])) {
      errors.push(`${field} is required`);
    }
  }

  if (hasNonEmptyString(body.target_kind) && !REPROCESS_TARGET_KINDS.includes(body.target_kind)) {
    errors.push("target_kind must be one of: dlq_batch, event_batch");
  }

  if (body.reason !== undefined && body.reason !== null && !hasNonEmptyString(body.reason)) {
    errors.push("reason must be a non-empty string");
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
      target_kind: body.target_kind.trim(),
      target_ref: body.target_ref.trim(),
      reason: body.reason.trim(),
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

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

module.exports = {
  handleReprocessRun,
  validateReprocessRequest,
};
