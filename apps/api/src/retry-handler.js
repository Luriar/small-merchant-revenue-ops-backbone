const {
  RETRY_RUN_REQUIRED_FIELDS,
  RETRY_RUN_ALLOWED_FIELDS,
} = require("../../../packages/contracts/retry-run");
const { METRIC_NAMES, emitCount } = require("./metrics");

async function handleRetryRun({ request, response, store, logger, metrics, runId }) {
  let body;

  try {
    body = await readJsonBody(request);
  } catch (error) {
    emitCount(metrics, METRIC_NAMES.RETRY_RUN_TOTAL, 1, {
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

  const validation = validateRetryRunRequest(body);
  if (!validation.ok) {
    logger.info("retry_run_validation_failed", {
      original_run_id: runId,
      error_count: validation.errors.length,
    });
    emitCount(metrics, METRIC_NAMES.RETRY_RUN_TOTAL, 1, {
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

  const result = await store.requestRetry({
    originalRunId: runId,
    idempotencyKey: validation.value.idempotency_key,
    reason: validation.value.reason,
  });

  if (result.kind === "not_found") {
    logger.info("retry_run_not_found", {
      original_run_id: runId,
    });

    return writeJson(response, 404, {
      error: {
        code: "not_found",
        message: "run not found",
      },
    });
  }

  if (result.kind === "conflict") {
    logger.info("retry_run_conflict", {
      original_run_id: runId,
    });
    emitCount(metrics, METRIC_NAMES.RETRY_RUN_TOTAL, 1, {
      outcome: "conflict",
      error_code: result.body?.error?.code ?? null,
    });

    return writeJson(response, 409, result.body);
  }

  logger.info("retry_run_processed", {
    original_run_id: runId,
    new_run_id: result.body.new_run_id,
    replay: result.body.idempotent_replay,
  });
  emitCount(metrics, METRIC_NAMES.RETRY_RUN_TOTAL, 1, {
    outcome: result.body.idempotent_replay ? "replay" : "created",
  });

  return writeJson(response, result.statusCode, result.body);
}

function validateRetryRunRequest(body) {
  if (!isPlainObject(body)) {
    return {
      ok: false,
      errors: ["request body must be a JSON object"],
    };
  }

  const errors = [];

  for (const field of Object.keys(body)) {
    if (!RETRY_RUN_ALLOWED_FIELDS.includes(field)) {
      errors.push(`unknown field: ${field}`);
    }
  }

  for (const field of RETRY_RUN_REQUIRED_FIELDS) {
    if (!hasNonEmptyString(body[field])) {
      errors.push(`${field} is required`);
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
  handleRetryRun,
  validateRetryRunRequest,
};
