const { EventEmitter } = require("node:events");
const { Readable } = require("node:stream");

const { createRevenueOpsStore } = require("./revenue-ops/revenue-ops-store");
const { createRevenueOpsSaasStoreFromEnv } = require("./revenue-ops/revenue-ops-saas-store-factory");
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
  handleGetMe,
  handleListStores,
  handleCreateStore,
  handleUpdateStore,
  handleArchiveStore,
  handleGetStoreBriefs,
  handleGetStoreAnomalies,
  handleGetStoreActions,
  handleUpdateStoreActionStatus,
  handleGetStoreContext,
  handleGetStorePipelineMeta,
  handleListRevenueUploads,
  handleCreateRevenueUpload,
  handlePreviewRevenueUpload,
  handleListRejectedRevenueRows,
  handleReprocessRevenueUpload,
  handleCollectStoreContext,
  handleGetStoreCauseCandidates,
  handleGetStoreCauseCandidate,
} = require("./revenue-ops/revenue-ops-handler");
const { handleGetAuroraHealth } = require("./revenue-ops/aurora-health");

const revenueOpsStore = createRevenueOpsStore({
  actionStatusPersistence: createOptionalAuroraActionStatusStoreFromEnv(),
});
const revenueOpsSaasStore = createRevenueOpsSaasStoreFromEnv();

async function handler(event) {
  const request = createRequestFromApiGatewayEvent(event);
  const response = new LambdaResponse();

  try {
    await dispatchRevenueRequest({ request, response, store: revenueOpsStore, saasStore: revenueOpsSaasStore });
  } catch (error) {
    console.error("[lambda-handler] unhandled error", {
      message: error && error.message,
      stack: error && error.stack,
      name: error && error.name,
      method: request && request.method,
      url: request && request.url,
    });
    response.writeHead(500, {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
    });
    response.end(JSON.stringify({ error: { code: "internal_error", message: "Internal server error" } }));
  }

  return response.toLambdaResult();
}

async function dispatchRevenueRequest({ request, response, store, saasStore = revenueOpsSaasStore }) {
  if (request.method === "OPTIONS" && (request.url.startsWith("/api/v1/revenue") || request.url.startsWith("/api/v1/stores") || request.url.startsWith("/api/v1/me"))) {
    response.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
      "access-control-allow-headers": "authorization,content-type",
    });
    return response.end();
  }

  if (request.method === "GET" && /^\/api\/v1\/me(?:\?.*)?$/.test(request.url)) {
    return handleGetMe({ request, response, store: saasStore });
  }

  if (request.method === "GET" && /^\/api\/v1\/stores(?:\?.*)?$/.test(request.url)) {
    return handleListStores({ request, response, store: saasStore });
  }

  if (request.method === "POST" && /^\/api\/v1\/stores(?:\?.*)?$/.test(request.url)) {
    return handleCreateStore({ request, response, store: saasStore });
  }

  const storeRootMatch = request.url.match(/^\/api\/v1\/stores\/([^/?]+)(?:\?.*)?$/);
  if (storeRootMatch) {
    const storeId = decodeURIComponent(storeRootMatch[1]);
    if (request.method === "PATCH") {
      return handleUpdateStore({ request, response, store: saasStore, storeId });
    }
    if (request.method === "DELETE") {
      return handleArchiveStore({ request, response, store: saasStore, storeId });
    }
  }

  const storeScopedMatch = request.url.match(/^\/api\/v1\/stores\/([^/?]+)\/(.+?)(?:\?.*)?$/);
  if (storeScopedMatch) {
    const storeId = decodeURIComponent(storeScopedMatch[1]);
    const rest = storeScopedMatch[2];

    if (request.method === "GET" && rest === "briefs") {
      return handleGetStoreBriefs({ request, response, store: saasStore, storeId });
    }
    if (request.method === "GET" && rest === "anomalies") {
      return handleGetStoreAnomalies({ request, response, store: saasStore, storeId });
    }
    if (request.method === "GET" && rest === "actions") {
      return handleGetStoreActions({ request, response, store: saasStore, storeId });
    }
    const storeActionStatusMatch = request.method === "PATCH" ? rest.match(/^actions\/([^/?]+)\/status$/) : null;
    if (storeActionStatusMatch) {
      return handleUpdateStoreActionStatus({
        request,
        response,
        store: saasStore,
        storeId,
        actionId: decodeURIComponent(storeActionStatusMatch[1]),
      });
    }
    if (request.method === "GET" && rest === "context") {
      return handleGetStoreContext({ request, response, store: saasStore, storeId });
    }
    if (request.method === "POST" && rest === "context/collect") {
      return handleCollectStoreContext({ request, response, store: saasStore, storeId });
    }
    if (request.method === "GET" && rest === "pipeline-meta") {
      return handleGetStorePipelineMeta({ request, response, store: saasStore, storeId });
    }
    if (request.method === "GET" && rest === "revenue/uploads") {
      return handleListRevenueUploads({ request, response, store: saasStore, storeId });
    }
    if (request.method === "POST" && rest === "revenue/uploads/preview") {
      return handlePreviewRevenueUpload({ request, response, store: saasStore, storeId });
    }
    if (request.method === "POST" && rest === "revenue/uploads") {
      return handleCreateRevenueUpload({ request, response, store: saasStore, storeId });
    }
    const rejectedRowsMatch = request.method === "GET" ? rest.match(/^revenue\/uploads\/([^/?]+)\/rejected-rows$/) : null;
    if (rejectedRowsMatch) {
      return handleListRejectedRevenueRows({
        request,
        response,
        store: saasStore,
        storeId,
        uploadId: decodeURIComponent(rejectedRowsMatch[1]),
      });
    }
    const reprocessMatch = request.method === "POST" ? rest.match(/^revenue\/uploads\/([^/?]+)\/reprocess$/) : null;
    if (reprocessMatch) {
      return handleReprocessRevenueUpload({
        request,
        response,
        store: saasStore,
        storeId,
        uploadId: decodeURIComponent(reprocessMatch[1]),
      });
    }
    if (request.method === "GET" && rest === "cause-candidates") {
      return handleGetStoreCauseCandidates({ request, response, store: saasStore, storeId });
    }
    const causeCandidateMatch = request.method === "GET" ? rest.match(/^cause-candidates\/([^/?]+)$/) : null;
    if (causeCandidateMatch) {
      return handleGetStoreCauseCandidate({
        request,
        response,
        store: saasStore,
        storeId,
        causeCandidateId: decodeURIComponent(causeCandidateMatch[1]),
      });
    }
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
  request.apiGatewayEvent = event;
  request.authClaims = event?.requestContext?.authorizer?.jwt?.claims
    ?? event?.requestContext?.authorizer?.claims
    ?? null;
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
