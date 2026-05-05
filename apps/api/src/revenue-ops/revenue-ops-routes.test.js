const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { Readable } = require("node:stream");

const exportData = require("./data/revenue_ops_export.json");
const { createServer } = require("../server");
const { createRevenueOpsStore } = require("./revenue-ops-store");

const KNOWN_BRIEF_ID = exportData.briefs[0].brief_id;
const KNOWN_ACTION_ID = exportData.actions[0].action_id;

test("Revenue Ops API returns brief list and known brief detail", async () => {
  const server = createTestServer();

  const list = await requestJson({ server, method: "GET", routePath: "/api/v1/revenue/briefs" });
  assert.equal(list.statusCode, 200);
  assert.equal(Array.isArray(list.value.briefs), true);
  assert.equal(list.value.briefs.length >= 1, true);
  assertNoUnsafeContent(list.value);

  const detail = await requestJson({ server, method: "GET", routePath: `/api/v1/revenue/briefs/${KNOWN_BRIEF_ID}` });
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.value.brief.brief_id, KNOWN_BRIEF_ID);
  assertNoUnsafeContent(detail.value);
});

test("Revenue Ops API returns anomalies, actions, context, and safe pipeline metadata", async () => {
  const server = createTestServer();
  const cases = [
    { routePath: "/api/v1/revenue/anomalies", key: "anomalies" },
    { routePath: "/api/v1/revenue/actions", key: "actions" },
    { routePath: "/api/v1/revenue/context", key: "context" },
    { routePath: "/api/v1/revenue/pipeline-meta", key: "pipeline_meta" },
  ];

  for (const item of cases) {
    const result = await requestJson({ server, method: "GET", routePath: item.routePath });
    assert.equal(result.statusCode, 200);
    assert.ok(result.value[item.key]);
    assertNoUnsafeContent(result.value);
  }
});

test("Revenue Ops API accepts valid action status PATCH", async () => {
  const server = createTestServer();

  const result = await requestJson({
    server,
    method: "PATCH",
    routePath: `/api/v1/revenue/actions/${KNOWN_ACTION_ID}/status`,
    input: { status: "planned" },
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.value.action.action_id, KNOWN_ACTION_ID);
  assert.equal(result.value.action.status, "planned");
  assertNoUnsafeContent(result.value);
});

test("Revenue Ops API rejects invalid action status with safe 400", async () => {
  const server = createTestServer();

  const result = await requestJson({
    server,
    method: "PATCH",
    routePath: `/api/v1/revenue/actions/${KNOWN_ACTION_ID}/status`,
    input: { status: "not-real" },
  });

  assert.equal(result.statusCode, 400);
  assert.equal(result.value.error.code, "bad_request");
  assertNoUnsafeContent(result.value);
});

test("Revenue Ops API returns safe 404 for unknown action id", async () => {
  const server = createTestServer();

  const result = await requestJson({
    server,
    method: "PATCH",
    routePath: "/api/v1/revenue/actions/action_missing/status",
    input: { status: "planned" },
  });

  assert.equal(result.statusCode, 404);
  assert.equal(result.value.error.code, "not_found");
  assertNoUnsafeContent(result.value);
});

async function requestJson({ server, method, routePath, input }) {
  const headers = {};
  let content = null;
  if (typeof input !== "undefined") {
    headers["content-type"] = "application/json";
    content = JSON.stringify(input);
  }

  const response = await dispatchServerRequest({
    server,
    method,
    routePath,
    headers,
    content,
  });

  return {
    statusCode: response.status,
    value: JSON.parse(response.text),
  };
}

function createTestServer() {
  return createServer({
    changeStore: {},
    eventStore: {},
    issueStore: {},
    runStore: {},
    traceStore: {},
    revenueOpsStore: createRevenueOpsStore(),
    logger: createSilentLogger(),
  });
}

function dispatchServerRequest({ server, method, routePath, headers, content }) {
  const request = Readable.from(content === null ? [] : [Buffer.from(content)]);
  request.method = method;
  request.url = routePath;
  request.headers = headers;

  const response = new FakeResponse();
  server.emit("request", request, response);
  return response.done;
}

function createSilentLogger() {
  return { info() {} };
}

class FakeResponse extends EventEmitter {
  constructor() {
    super();
    this.statusCode = 200;
    this.headers = {};
    this.writableFinished = false;
    this.chunks = [];
    this.done = new Promise((resolve) => {
      this.resolveDone = resolve;
    });
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

  end(value = "") {
    if (value) {
      this.chunks.push(Buffer.isBuffer(value) ? value : Buffer.from(String(value)));
    }
    this.writableFinished = true;
    const text = Buffer.concat(this.chunks).toString("utf8");
    this.emit("finish");
    this.emit("close");
    this.resolveDone({ status: this.statusCode, text, headers: this.headers });
  }
}

function assertNoUnsafeContent(value) {
  const text = JSON.stringify(value);
  assert.equal(text.includes("/home/"), false, "response leaked an absolute home path");
  assert.equal(text.includes("small-merchant-revenue-ops-backbone"), false, "response leaked repo path");
  assert.equal(text.includes("Error:"), false, "response leaked raw Error text");
  assert.equal(text.includes("stack"), false, "response leaked stack marker");
  assert.equal(text.includes("connection_string"), false, "response leaked connection marker");
}
