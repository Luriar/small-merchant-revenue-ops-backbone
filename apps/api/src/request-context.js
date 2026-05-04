const { randomUUID } = require("node:crypto");
const { METRIC_NAMES, emitCount, emitHistogram, resolveMetricRouteLabel } = require("./metrics");

const REQUEST_ID_HEADER = "x-request-id";
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;

function attachRequestContext({ request, response, logger, metrics }) {
  const requestId = resolveRequestId(request);
  const context = {
    request_id: requestId,
    method: request.method,
    path: sanitizePath(request.url),
  };
  const metricContext = {
    method: request.method,
    route: resolveMetricRouteLabel(request.method, request.url),
  };
  const startedAt = process.hrtime.bigint();
  let terminalEvent = null;

  response.setHeader(REQUEST_ID_HEADER, requestId);
  logger.info("request_started", context);
  emitCount(metrics, METRIC_NAMES.HTTP_REQUEST_STARTED_TOTAL, 1, metricContext);
  response.once("finish", () => {
    terminalEvent = "finished";
    const durationMs = getDurationMs(startedAt);
    logger.info("request_finished", {
      ...context,
      status_code: response.statusCode,
      duration_ms: durationMs,
    });
    emitCount(metrics, METRIC_NAMES.HTTP_REQUEST_FINISHED_TOTAL, 1, {
      ...metricContext,
      status_code: response.statusCode,
    });
    emitHistogram(metrics, METRIC_NAMES.HTTP_REQUEST_DURATION_MS, durationMs, {
      ...metricContext,
      status_code: response.statusCode,
    });
  });
  request.once("aborted", () => {
    terminalEvent = "aborted";
    const durationMs = getDurationMs(startedAt);
    logger.info("request_aborted", {
      ...context,
      duration_ms: durationMs,
    });
    emitCount(metrics, METRIC_NAMES.HTTP_REQUEST_ABORTED_TOTAL, 1, metricContext);
  });
  response.once("close", () => {
    if (response.writableFinished || terminalEvent === "finished" || terminalEvent === "aborted") {
      return;
    }

    terminalEvent = "closed";
    const durationMs = getDurationMs(startedAt);
    logger.info("request_closed", {
      ...context,
      status_code: normalizeStatusCode(response.statusCode),
      duration_ms: durationMs,
    });
    emitCount(metrics, METRIC_NAMES.HTTP_REQUEST_CLOSED_TOTAL, 1, {
      ...metricContext,
      status_code: normalizeStatusCode(response.statusCode),
    });
  });

  return {
    requestId,
    logger: withRequestContext(logger, context),
  };
}

function resolveRequestId(request) {
  const inbound = getHeaderValue(request, REQUEST_ID_HEADER);
  if (typeof inbound === "string" && REQUEST_ID_PATTERN.test(inbound)) {
    return inbound;
  }

  return randomUUID();
}

function withRequestContext(logger, context) {
  return {
    info(event, fields) {
      logger.info(event, {
        ...context,
        ...(fields ?? {}),
      });
    },
  };
}

function getHeaderValue(request, headerName) {
  if (!request?.headers || typeof request.headers !== "object") {
    return null;
  }

  const value = request.headers[headerName];
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return typeof value === "string" ? value : null;
}

function sanitizePath(url) {
  if (typeof url !== "string") {
    return null;
  }

  const queryStart = url.indexOf("?");
  return queryStart === -1 ? url : url.slice(0, queryStart);
}

function getDurationMs(startedAt) {
  const elapsedNs = process.hrtime.bigint() - startedAt;
  return Math.max(0, Number(elapsedNs / 1000000n));
}

function normalizeStatusCode(value) {
  return Number.isInteger(value) ? value : null;
}

module.exports = {
  REQUEST_ID_HEADER,
  attachRequestContext,
};
