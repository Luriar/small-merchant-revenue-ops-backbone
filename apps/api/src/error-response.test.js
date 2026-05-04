const test = require("node:test");
const assert = require("node:assert/strict");

const { createServer } = require("./server");
const { badRequest, mapErrorToHttpResponse } = require("./error-response");
const { FORBIDDEN_TAG_KEYS } = require("./metrics");

test("known typed 4xx path maps bad request safely", () => {
  const mapped = mapErrorToHttpResponse(
    badRequest("validation failed", ["idempotency_key is required"]),
  );

  assert.deepEqual(mapped, {
    statusCode: 400,
    body: {
      error: {
        code: "bad_request",
        message: "validation failed",
        details: ["idempotency_key is required"],
      },
    },
    logFields: {
      error_kind: "app_error",
      error_code: "bad_request",
      status_code: 400,
    },
  });
});

test("unexpected repository error returns safe 500", async () => {
  const logs = [];
  const { baseUrl, close } = await startServer({
    changeStore: {
      async createOrReplay() {
        const error = new Error("duplicate key value violates unique constraint pk_secret");
        error.code = "23505";
        error.constraint = "pk_secret";
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
      },
      body: JSON.stringify(validChangePayload()),
    });

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: {
        code: "internal_error",
        message: "internal server error",
      },
    });
  } finally {
    await close();
  }
});

test("raw DB error text is not exposed in response", async () => {
  const logs = [];
  const { baseUrl, close } = await startServer({
    changeStore: {
      async createOrReplay() {
        const error = new Error("password authentication failed for user postgres");
        error.code = "28P01";
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
      },
      body: JSON.stringify(validChangePayload({
        idempotency_key: "change-key-db-safe-2",
      })),
    });

    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.error.code, "internal_error");
    assert.equal(body.error.message.includes("password authentication failed"), false);
    assert.equal(body.error.message.includes("postgres"), false);

    const errorLog = logs.find((entry) => entry.event === "request_failed");
    assert.ok(errorLog);
    assert.equal(errorLog.db_code, "28P01");
    assert.equal(errorLog.path, "/api/v1/changes");
    assert.equal("message" in errorLog, false);
    assert.equal("stack" in errorLog, false);
  } finally {
    await close();
  }
});

test("existing conflict responses still work", async () => {
  const { baseUrl, close } = await startServer({
    runStore: {
      async requestRetry() {
        return {
          kind: "conflict",
          body: {
            error: {
              code: "active_retry_exists",
              message: "an active retry already exists for this run",
            },
          },
        };
      },
    },
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/runs/run-1/retry`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        idempotency_key: "retry-key-conflict-1",
        reason: "retry_requested",
      }),
    });

    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      error: {
        code: "active_retry_exists",
        message: "an active retry already exists for this run",
      },
    });
  } finally {
    await close();
  }
});

test("unknown error still maps to safe 500", () => {
  const mapped = mapErrorToHttpResponse(new Error("database blew up"));

  assert.deepEqual(mapped, {
    statusCode: 500,
    body: {
      error: {
        code: "internal_error",
        message: "internal server error",
      },
    },
    logFields: {
      error_kind: "unexpected_error",
      error_code: "internal_error",
      status_code: 500,
      db_code: null,
      db_constraint: null,
    },
  });
});

test("request_failed emits safe metrics tags", async () => {
  const metricCalls = [];
  const { baseUrl, close } = await startServer({
    metrics: createTestMetrics(metricCalls),
    changeStore: {
      async createOrReplay() {
        const error = new Error("password authentication failed for user postgres");
        error.code = "28P01";
        throw error;
      },
    },
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/changes`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "req-hidden-1",
      },
      body: JSON.stringify(validChangePayload({
        idempotency_key: "change-key-db-safe-3",
      })),
    });

    assert.equal(response.status, 500);
    const metric = metricCalls.find((call) => call.name === "http_request_failed_total");
    assert.ok(metric);
    assert.equal(metric.tags.method, "POST");
    assert.equal(metric.tags.route, "/api/v1/changes");
    assert.equal(metric.tags.error_code, "internal_error");
    assert.equal("request_id" in metric.tags, false);
    assert.equal("path" in metric.tags, false);
    for (const key of Object.keys(metric.tags)) {
      assert.equal(FORBIDDEN_TAG_KEYS.has(key), false);
    }
  } finally {
    await close();
  }
});

test("detail route request_failed metric uses safe route label without raw ids", async () => {
  const metricCalls = [];
  const { baseUrl, close } = await startServer({
    metrics: createTestMetrics(metricCalls),
    changeStore: {
      async getChangeById() {
        const error = new Error("read failed");
        error.code = "08006";
        throw error;
      },
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
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/changes/change-secret-99`);
    assert.equal(response.status, 500);

    const metric = metricCalls.find((call) => call.name === "http_request_failed_total");
    assert.ok(metric);
    assert.equal(metric.tags.route, "/api/v1/changes/{change_id}");
    assert.equal("path" in metric.tags, false);
    const serialized = JSON.stringify(metric.tags);
    assert.equal(serialized.includes("change-secret-99"), false);
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

function validChangePayload(overrides = {}) {
  return {
    idempotency_key: "change-key-db-safe-1",
    change_type: "release",
    title: "Deploy checkout",
    target_service: "payments",
    source: "deploy-system",
    occurred_at: "2026-04-22T10:00:00.000Z",
    ...overrides,
  };
}
