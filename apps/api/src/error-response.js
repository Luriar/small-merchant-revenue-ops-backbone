const { METRIC_NAMES, emitCount, resolveMetricRouteLabel } = require("./metrics");

class AppError extends Error {
  constructor({ statusCode, code, message, details } = {}) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function badRequest(message, details) {
  return new AppError({
    statusCode: 400,
    code: "bad_request",
    message,
    details,
  });
}

function unauthorized(message = "unauthorized") {
  return new AppError({
    statusCode: 401,
    code: "unauthorized",
    message,
  });
}

function forbidden(message = "forbidden") {
  return new AppError({
    statusCode: 403,
    code: "forbidden",
    message,
  });
}

function notFound(message) {
  return new AppError({
    statusCode: 404,
    code: "not_found",
    message,
  });
}

function conflict(code, message) {
  return new AppError({
    statusCode: 409,
    code,
    message,
  });
}

function configInvalid(message) {
  return new AppError({
    statusCode: 500,
    code: "config_invalid",
    message,
  });
}

function mapErrorToHttpResponse(error) {
  if (error instanceof AppError) {
    const body = {
      error: {
        code: error.code,
        message: error.message,
      },
    };

    if (Array.isArray(error.details) && error.details.length > 0) {
      body.error.details = error.details;
    }

    return {
      statusCode: error.statusCode,
      body,
      logFields: {
        error_kind: "app_error",
        error_code: error.code,
        status_code: error.statusCode,
      },
    };
  }

  return {
    statusCode: 500,
    body: {
      error: {
        code: "internal_error",
        message: "internal server error",
      },
    },
    logFields: {
      error_kind: isDatabaseLikeError(error) ? "repository_error" : "unexpected_error",
      error_code: "internal_error",
      status_code: 500,
      db_code: safeString(error?.code),
      db_constraint: safeString(error?.constraint),
    },
  };
}

function handleRouteError({ request, response, logger, metrics, error }) {
  const mapped = mapErrorToHttpResponse(error);

  logger.info("request_failed", {
    method: request.method,
    path: sanitizePath(request.url),
    ...mapped.logFields,
  });
  emitCount(metrics, METRIC_NAMES.HTTP_REQUEST_FAILED_TOTAL, 1, {
    method: request.method,
    route: resolveMetricRouteLabel(request.method, request.url),
    error_kind: mapped.logFields.error_kind,
    error_code: mapped.logFields.error_code,
    status_code: mapped.logFields.status_code,
  });

  if (!response.headersSent) {
    writeJson(response, mapped.statusCode, mapped.body);
    return;
  }

  response.end();
}

function writeJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function sanitizePath(url) {
  if (typeof url !== "string") {
    return null;
  }

  const queryStart = url.indexOf("?");
  return queryStart === -1 ? url : url.slice(0, queryStart);
}

function isDatabaseLikeError(error) {
  return hasPostgresCodeShape(error?.code)
    || typeof error?.constraint === "string"
    || typeof error?.table === "string";
}

function hasPostgresCodeShape(value) {
  return typeof value === "string" && /^[0-9A-Z]{5}$/.test(value);
}

function safeString(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

module.exports = {
  AppError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  configInvalid,
  mapErrorToHttpResponse,
  handleRouteError,
};
