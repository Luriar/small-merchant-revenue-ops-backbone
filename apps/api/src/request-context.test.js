const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const { createServer } = require("./server");
const { attachRequestContext } = require("./request-context");
const { FORBIDDEN_TAG_KEYS } = require("./metrics");

test("request_id is generated when missing", async () => {
  const logs = [];
  const { baseUrl, close } = await startServer({
    logger: createTestLogger(logs),
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/changes`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(validChangePayload()),
    });

    assert.equal(response.status, 201);
    const requestId = response.headers.get("x-request-id");
    assert.ok(requestId);
    assert.match(requestId, /^[0-9a-f-]{36}$/i);

    const processedLog = logs.find((entry) => entry.event === "change_intake_processed");
    assert.ok(processedLog);
    assert.equal(processedLog.request_id, requestId);
    assert.equal(processedLog.method, "POST");
    assert.equal(processedLog.path, "/api/v1/changes");
  } finally {
    await close();
  }
});

test("request_id header is reused when present", async () => {
  const logs = [];
  const { baseUrl, close } = await startServer({
    logger: createTestLogger(logs),
  });

  try {
    const response = await fetch(`${baseUrl}/healthz`, {
      headers: {
        "x-request-id": "req-operator-123",
      },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-request-id"), "req-operator-123");
  } finally {
    await close();
  }
});

test("error log includes request_id", async () => {
  const logs = [];
  const { baseUrl, close } = await startServer({
    changeStore: {
      async createOrReplay() {
        const error = new Error("connection refused");
        error.code = "08006";
        throw error;
      },
    },
    logger: createTestLogger(logs),
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/changes`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "req-error-456",
      },
      body: JSON.stringify(validChangePayload({
        idempotency_key: "change-correlation-2",
      })),
    });

    assert.equal(response.status, 500);
    assert.equal(response.headers.get("x-request-id"), "req-error-456");

    const errorLog = logs.find((entry) => entry.event === "request_failed");
    assert.ok(errorLog);
    assert.equal(errorLog.request_id, "req-error-456");
    assert.equal(errorLog.method, "POST");
    assert.equal(errorLog.path, "/api/v1/changes");
    assert.equal("stack" in errorLog, false);
    assert.equal("sql" in errorLog, false);
  } finally {
    await close();
  }
});

test("request start log emitted", async () => {
  const logs = [];
  const { baseUrl, close } = await startServer({
    logger: createTestLogger(logs),
  });

  try {
    const response = await fetch(`${baseUrl}/healthz`, {
      headers: {
        "x-request-id": "req-start-1",
      },
    });

    assert.equal(response.status, 200);
    const startLog = logs.find((entry) => entry.event === "request_started");
    assert.ok(startLog);
    assert.equal(startLog.request_id, "req-start-1");
    assert.equal(startLog.method, "GET");
    assert.equal(startLog.path, "/healthz");
  } finally {
    await close();
  }
});

test("request finish log emitted with duration_ms", async () => {
  const logs = [];
  const { baseUrl, close } = await startServer({
    logger: createTestLogger(logs),
  });

  try {
    const response = await fetch(`${baseUrl}/healthz`, {
      headers: {
        "x-request-id": "req-finish-1",
      },
    });

    assert.equal(response.status, 200);
    const finishLog = logs.find((entry) => entry.event === "request_finished");
    assert.ok(finishLog);
    assert.equal(finishLog.request_id, "req-finish-1");
    assert.equal(finishLog.method, "GET");
    assert.equal(finishLog.path, "/healthz");
    assert.equal(finishLog.status_code, 200);
    assert.equal(Number.isInteger(finishLog.duration_ms), true);
    assert.equal(finishLog.duration_ms >= 0, true);
  } finally {
    await close();
  }
});

test("error path still produces finish log", async () => {
  const logs = [];
  const { baseUrl, close } = await startServer({
    changeStore: {
      async createOrReplay() {
        const error = new Error("read ECONNRESET");
        error.code = "08006";
        throw error;
      },
    },
    logger: createTestLogger(logs),
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/changes`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "req-finish-error-1",
      },
      body: JSON.stringify(validChangePayload({
        idempotency_key: "change-correlation-3",
      })),
    });

    assert.equal(response.status, 500);
    const finishLog = logs.find((entry) => entry.event === "request_finished");
    assert.ok(finishLog);
    assert.equal(finishLog.request_id, "req-finish-error-1");
    assert.equal(finishLog.status_code, 500);
    assert.equal(Number.isInteger(finishLog.duration_ms), true);
  } finally {
    await close();
  }
});

test("request aborted logs request_aborted without request_finished", async () => {
  const logs = [];
  const request = new EventEmitter();
  request.method = "POST";
  request.url = "/api/v1/changes";
  request.headers = {
    "x-request-id": "req-abort-1",
  };

  const response = new EventEmitter();
  response.statusCode = 499;
  response.writableFinished = false;
  response.setHeader = () => {};

  attachRequestContext({
    request,
    response,
    logger: createTestLogger(logs),
  });

  request.emit("aborted");
  response.emit("close");

  const abortedLog = logs.find((entry) => entry.event === "request_aborted");
  assert.ok(abortedLog);
  assert.equal(abortedLog.request_id, "req-abort-1");
  assert.equal(abortedLog.method, "POST");
  assert.equal(abortedLog.path, "/api/v1/changes");
  assert.equal(Number.isInteger(abortedLog.duration_ms), true);
  assert.equal(logs.some((entry) => entry.event === "request_finished"), false);
  assert.equal(logs.some((entry) => entry.event === "request_closed"), false);
});

test("request close without finish logs request_closed", async () => {
  const logs = [];
  const request = new EventEmitter();
  request.method = "GET";
  request.url = "/api/v1/runs";
  request.headers = {};

  const response = new EventEmitter();
  response.statusCode = 503;
  response.writableFinished = false;
  response.setHeader = () => {};

  attachRequestContext({
    request,
    response,
    logger: createTestLogger(logs),
  });

  response.emit("close");

  const closedLog = logs.find((entry) => entry.event === "request_closed");
  assert.ok(closedLog);
  assert.equal(closedLog.method, "GET");
  assert.equal(closedLog.path, "/api/v1/runs");
  assert.equal(closedLog.status_code, 503);
  assert.equal(Number.isInteger(closedLog.duration_ms), true);
  assert.equal(logs.some((entry) => entry.event === "request_finished"), false);
});

test("request lifecycle emits metrics without forbidden tags", () => {
  const request = new EventEmitter();
  request.method = "GET";
  request.url = "/healthz";
  request.headers = {
    "x-request-id": "req-metric-1",
  };

  const response = new EventEmitter();
  response.statusCode = 200;
  response.writableFinished = true;
  response.setHeader = () => {};

  const metricCalls = [];
  attachRequestContext({
    request,
    response,
    logger: createTestLogger([]),
    metrics: createTestMetrics(metricCalls),
  });

  response.emit("finish");

  assert.equal(metricCalls.some((call) => call.name === "http_request_started_total"), true);
  assert.equal(metricCalls.some((call) => call.name === "http_request_finished_total"), true);
  assert.equal(metricCalls.some((call) => call.name === "http_request_duration_ms"), true);
  for (const call of metricCalls) {
    assert.equal("request_id" in call.tags, false);
    assert.equal("path" in call.tags, false);
    assert.equal(call.tags.route, "/healthz");
    for (const key of Object.keys(call.tags)) {
      assert.equal(FORBIDDEN_TAG_KEYS.has(key), false);
    }
  }
});

test("detail route lifecycle metrics use safe route labels instead of raw ids", async () => {
  const metricCalls = [];
  const { baseUrl, close } = await startServer({
    metrics: createTestMetrics(metricCalls),
    changeStore: {
      async getChangeById() {
        return {
          change_id: "change-secret-1",
          change_type: "release",
          title: "Release",
          target_service: "payments",
          source: "deploy-system",
          occurred_at: "2026-04-22T10:00:00.000Z",
          created_at: "2026-04-22T10:01:00.000Z",
          actor_present: false,
          rule_scope_present: false,
        };
      },
      async createOrReplay() {
        throw new Error("unexpected createOrReplay call");
      },
      async listChanges() {
        return { items: [] };
      },
    },
    issueStore: {
      async getIssueById() {
        return {
          issue_id: "issue-secret-1",
          title: "Checkout issue",
          issue_family: "payment_failed_issue",
          severity: 2,
          status: "open",
          source: "zendesk",
          external_id_present: true,
          created_at: "2026-04-22T10:01:00.000Z",
          reporter_present: false,
          affected_variation_present: false,
          keywords_count: 0,
          body_present: false,
        };
      },
      async listIssues() {
        return { items: [] };
      },
      async createOrReplay() {
        throw new Error("unexpected createOrReplay call");
      },
    },
    runStore: {
      async listRuns() {
        return { runs: [] };
      },
      async getRunById() {
        return {
          run_id: "run-secret-1",
          run_type: "retry",
          target_kind: "change",
          target_ref: "change-secret-1",
          status: "failed",
          attempt: 1,
          created_at: "2026-04-22T10:01:00.000Z",
        };
      },
      async listRunStateLog() {
        return { items: [] };
      },
      async getOverviewSummary() {
        return {
          total_runs: 0,
          pending_runs: 0,
          processing_runs: 0,
          failed_runs: 0,
          dlq_runs: 0,
        };
      },
    },
    traceStore: {
      async listTraces() {
        return { items: [] };
      },
      async getTraceById(traceId) {
        return {
          trace_id: traceId,
          change_id: "change-secret-1",
          primary_issue_id: "issue-secret-1",
          status: "suspected",
          confidence: 0.9,
          anomaly_type: "latency",
          anomaly_metric: "p95_ms",
          anomaly_window_start: "2026-04-22T10:00:00.000Z",
          anomaly_window_end: "2026-04-22T10:05:00.000Z",
          created_at: "2026-04-22T10:06:00.000Z",
          evidence_count: 1,
        };
      },
      async listTraceEvidences() {
        return { items: [] };
      },
      async createOrReuseTraceWithEvidence() {
        throw new Error("unexpected createOrReuseTraceWithEvidence call");
      },
      async getOverviewSummary() {
        return {
          suspected_traces: 0,
          confirmed_traces: 0,
          dismissed_traces: 0,
        };
      },
    },
  });

  try {
    const responses = await Promise.all([
      fetch(`${baseUrl}/api/v1/changes/change-secret-1`),
      fetch(`${baseUrl}/api/v1/issues/issue-secret-1`),
      fetch(`${baseUrl}/api/v1/runs/run-secret-1`),
      fetch(`${baseUrl}/api/v1/traces/trace-secret-1`),
    ]);

    for (const response of responses) {
      assert.equal(response.status, 200);
    }

    const finishedRoutes = metricCalls
      .filter((call) => call.name === "http_request_finished_total")
      .map((call) => call.tags.route);

    assert.deepEqual(finishedRoutes.sort(), [
      "/api/v1/changes/{change_id}",
      "/api/v1/issues/{issue_id}",
      "/api/v1/runs/{run_id}",
      "/api/v1/traces/{trace_id}",
    ]);

    for (const call of metricCalls.filter((entry) => entry.name === "http_request_finished_total")) {
      assert.equal("path" in call.tags, false);
      const serialized = JSON.stringify(call.tags);
      assert.equal(serialized.includes("change-secret-1"), false);
      assert.equal(serialized.includes("issue-secret-1"), false);
      assert.equal(serialized.includes("run-secret-1"), false);
      assert.equal(serialized.includes("trace-secret-1"), false);
    }
  } finally {
    await close();
  }
});

function createTestLogger(logs) {
  return {
    info(event, fields) {
      logs.push({ event, ...fields });
    },
  };
}

function createTestMetrics(calls) {
  return {
    count(name, value, tags) {
      calls.push({ kind: "count", name, value, tags });
    },
    histogram(name, value, tags) {
      calls.push({ kind: "histogram", name, value, tags });
    },
    gauge(name, value, tags) {
      calls.push({ kind: "gauge", name, value, tags });
    },
  };
}

async function startServer(options = {}) {
  const server = createServer({
    env: {},
    changeStore: {
      async createOrReplay() {
        return {
          statusCode: 201,
          body: {
            change_id: "change-1",
            idempotent_replay: false,
          },
        };
      },
    },
    eventStore: {},
    issueStore: {},
    runStore: {
      async listRuns() {
        return { runs: [] };
      },
      async getRunById() {
        return null;
      },
      async listRunStateLog() {
        return { items: [] };
      },
      async requestRetry() {
        return {
          kind: "ok",
          statusCode: 202,
          body: {
            action: "retry_requested",
            original_run_id: "run-1",
            new_run_id: "run-2",
            idempotent_replay: false,
            status: "accepted",
          },
        };
      },
      async requestReprocess() {
        return {
          kind: "ok",
          statusCode: 202,
          body: {
            action: "reprocess_requested",
            new_run_id: "run-3",
            idempotent_replay: false,
            status: "accepted",
          },
        };
      },
      async getOverviewSummary() {
        return {
          total_runs: 0,
          pending_runs: 0,
          processing_runs: 0,
          failed_runs: 0,
          dlq_runs: 0,
        };
      },
    },
    traceStore: {
      async listTraces() {
        return { items: [] };
      },
      async getTraceById() {
        return null;
      },
      async listTraceEvidences() {
        return { items: [] };
      },
      async createOrReuseTraceWithEvidence() {
        return {
          trace_id: "trace-1",
          trace_created: true,
          trace_reused: false,
          evidence_count: 1,
          evidence_created_count: 1,
          evidence_skipped_count: 0,
        };
      },
      async getOverviewSummary() {
        return {
          suspected_traces: 0,
          confirmed_traces: 0,
          dismissed_traces: 0,
        };
      },
    },
    ...options,
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const { port } = server.address();

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function validChangePayload(overrides = {}) {
  return {
    idempotency_key: "change-correlation-1",
    change_type: "release",
    title: "Deploy checkout",
    target_service: "payments",
    source: "deploy-system",
    occurred_at: "2026-04-22T10:00:00.000Z",
    ...overrides,
  };
}
