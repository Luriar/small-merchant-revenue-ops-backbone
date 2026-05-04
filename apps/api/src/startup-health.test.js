const test = require("node:test");
const assert = require("node:assert/strict");

const { createServer } = require("./server");
const { AppError } = require("./error-response");

test("GET /healthz returns 200", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/healthz`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: "ok",
    });
  } finally {
    await close();
  }
});

test("GET /readyz returns 200 in valid config", async () => {
  const { baseUrl, close } = await startServer({
    env: {
      RUN_STORE_BACKEND: "aurora",
      AURORA_DATABASE_URL: "postgres://redacted-for-test",
    },
  });

  try {
    const response = await fetch(`${baseUrl}/readyz`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: "ready",
    });
  } finally {
    await close();
  }
});

test("startup validation fails clearly when Aurora mode is enabled without DB URL", () => {
  assert.throws(
    () => createServer({
      env: {
        RUN_STORE_BACKEND: "aurora",
      },
    }),
    (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, "config_invalid");
      assert.equal(error.statusCode, 500);
      assert.match(
        error.message,
        /startup config invalid: Aurora-backed store enabled \(RUN_STORE_BACKEND\) but AURORA_DATABASE_URL or DATABASE_URL is required/,
      );
      return true;
    },
  );
});

async function startServer(options = {}) {
  const server = createServer({
    changeStore: {},
    eventStore: {},
    issueStore: {},
    runStore: {
      listRuns: async () => ({ runs: [] }),
      getRunById: async () => null,
      listRunStateLog: async () => ({ items: [] }),
      getOverviewSummary: async () => ({
        total_runs: 0,
        pending_runs: 0,
        processing_runs: 0,
        failed_runs: 0,
        dlq_runs: 0,
      }),
    },
    traceStore: {
      listTraces: async () => ({ items: [] }),
      getTraceById: async () => null,
      listTraceEvidences: async () => ({ items: [] }),
      getOverviewSummary: async () => ({
        suspected_traces: 0,
        confirmed_traces: 0,
        dismissed_traces: 0,
      }),
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
