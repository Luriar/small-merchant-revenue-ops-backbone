const { EventEmitter } = require("node:events");
const { Readable } = require("node:stream");

const { createRevenueOpsStore } = require("./revenue-ops/revenue-ops-store");
const { createOptionalAuroraActionStatusStoreFromEnv } = require("./revenue-ops/aurora-action-status-store");
const {
  handleGetBriefs,
  handleGetBriefById,
  handleGetAnomalies,
  handleGetEvidenceForAnomaly,
  handleGetActions,
  handleUpdateActionStatus,
  handleGetContext,
  handleGetPipelineMeta,
} = require("./revenue-ops/revenue-ops-handler");
const { handleGetAuroraHealth } = require("./revenue-ops/aurora-health");

const revenueOpsStore = createRevenueOpsStore({
  actionStatusPersistence: createOptionalAuroraActionStatusStoreFromEnv(),
});

async function handler(event) {
  const request = createRequestFromApiGatewayEvent(event);
  const response = new LambdaResponse();

  try {
    await dispatchRevenueRequest({ request, response, store: revenueOpsStore });
  } catch {
    response.writeHead(500, {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
    });
    response.end(JSON.stringify({ error: { code: "internal_error", message: "Internal server error" } }));
  }

  return response.toLambdaResult();
}

async function dispatchRevenueRequest({ request, response, store }) {
  if (request.method === "OPTIONS" && request.url.startsWith("/api/v1/revenue")) {
    response.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,PATCH",
      "access-control-allow-headers": "content-type",
    });
    return response.end();
  }

  if (request.method === "GET" && /^\/api\/v1\/revenue\/health\/aurora(?:\?.*)?$/.test(request.url)) {
    return handleGetAuroraHealth({ response });
  }

  if (request.method === "GET" && /^\/api\/v1\/revenue\/briefs(?:\?.*)?$/.test(request.url)) {
    return handleGetBriefs({ response, store });
  }

  const briefMatch = request.method === "GET"
    ? request.url.match(/^\/api\/v1\/revenue\/briefs\/([^/?]+)(?:\?.*)?$/)
    : null;
  if (briefMatch) {
    return handleGetBriefById({ response, store, briefId: decodeURIComponent(briefMatch[1]) });
  }

  if (request.method === "GET" && /^\/api\/v1\/revenue\/anomalies(?:\?.*)?$/.test(request.url)) {
    return handleGetAnomalies({ response, store });
  }

  const evidenceMatch = request.method === "GET"
    ? request.url.match(/^\/api\/v1\/revenue\/anomalies\/([^/?]+)\/evidence(?:\?.*)?$/)
    : null;
  if (evidenceMatch) {
    return handleGetEvidenceForAnomaly({ response, store, anomalyId: decodeURIComponent(evidenceMatch[1]) });
  }

  if (request.method === "GET" && /^\/api\/v1\/revenue\/actions(?:\?.*)?$/.test(request.url)) {
    return handleGetActions({ response, store });
  }

  const actionStatusMatch = request.method === "PATCH"
    ? request.url.match(/^\/api\/v1\/revenue\/actions\/([^/?]+)\/status(?:\?.*)?$/)
    : null;
  if (actionStatusMatch) {
    return handleUpdateActionStatus({
      request,
      response,
      store,
      actionId: decodeURIComponent(actionStatusMatch[1]),
    });
  }

  if (request.method === "GET" && /^\/api\/v1\/revenue\/context(?:\?.*)?$/.test(request.url)) {
    return handleGetContext({ response, store });
  }

  if (request.method === "GET" && /^\/api\/v1\/revenue\/pipeline-meta(?:\?.*)?$/.test(request.url)) {
    return handleGetPipelineMeta({ response, store });
  }

  response.writeHead(404, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
  });
  return response.end(JSON.stringify({ error: { code: "not_found", message: "route not found" } }));
}

function createRequestFromApiGatewayEvent(event) {
  const method = event?.requestContext?.http?.method ?? event?.httpMethod ?? "GET";
  const rawPath = event?.rawPath ?? event?.path ?? "/";
  const rawQueryString = event?.rawQueryString ? `?${event.rawQueryString}` : "";
  const body = event?.body
    ? Buffer.from(event.body, event.isBase64Encoded ? "base64" : "utf8")
    : null;

  const request = Readable.from(body ? [body] : []);
  request.method = method;
  request.url = `${rawPath}${rawQueryString}`;
  request.headers = normalizeHeaders(event?.headers ?? {});
  return request;
}

function normalizeHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );
}

class LambdaResponse extends EventEmitter {
  constructor() {
    super();
    this.statusCode = 200;
    this.headers = {};
    this.chunks = [];
  }

  setHeader(name, value) {
    this.headers[name.toLowerCase()] = value;
  }

  writeHead(statusCode, headers = {}) {
    this.statusCode = statusCode;
    for (const [name, value] of Object.entries(headers)) {
      this.setHeader(name, value);
    }
  }

  write(value = "") {
    if (value) {
      this.chunks.push(Buffer.isBuffer(value) ? value : Buffer.from(String(value)));
    }
  }

  end(value = "") {
    this.write(value);
    this.emit("finish");
    this.emit("close");
  }

  toLambdaResult() {
    return {
      statusCode: this.statusCode,
      headers: this.headers,
      body: Buffer.concat(this.chunks).toString("utf8"),
      isBase64Encoded: false,
    };
  }
}

module.exports = {
  handler,
  dispatchRevenueRequest,
  createRequestFromApiGatewayEvent,
};
