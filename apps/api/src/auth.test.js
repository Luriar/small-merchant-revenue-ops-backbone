const test = require("node:test");
const assert = require("node:assert/strict");

const { createServer } = require("./server");

test("missing bearer token returns 401", async () => {
  const logs = [];
  const { baseUrl, close } = await startServer({
    env: authEnv(),
    logger: createTestLogger(logs),
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/dashboard/overview`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: {
        code: "unauthorized",
        message: "unauthorized",
      },
    });

    const failedLog = logs.find((entry) => entry.event === "request_failed");
    assert.ok(failedLog);
    assert.equal(failedLog.status_code, 401);
    assert.equal(failedLog.error_code, "unauthorized");
    assert.equal("authorization" in failedLog, false);
    assert.equal("token" in failedLog, false);
  } finally {
    await close();
  }
});

test("invalid bearer token returns 401", async () => {
  const { baseUrl, close } = await startServer({
    env: authEnv(),
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/dashboard/overview`, {
      headers: {
        authorization: "Bearer invalid-token",
      },
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: {
        code: "unauthorized",
        message: "unauthorized",
      },
    });
  } finally {
    await close();
  }
});

test("viewer token can access read path", async () => {
  const { baseUrl, close } = await startServer({
    env: authEnv(),
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/dashboard/overview`, {
      headers: {
        authorization: "Bearer viewer-token-1",
      },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      scope: {},
      kpis: {
        changes: 0,
        detected_anomaly_patterns: 0,
        linked_issues: 0,
        suspected_traces: 0,
      },
      chart_context: {},
    });
  } finally {
    await close();
  }
});

test("exempt route stays available without auth", async () => {
  const { baseUrl, close } = await startServer({
    env: authEnv(),
  });

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

test("viewer token is forbidden on write path", async () => {
  const { baseUrl, close } = await startServer({
    env: authEnv(),
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/changes`, {
      method: "POST",
      headers: {
        authorization: "Bearer viewer-token-1",
        "content-type": "application/json",
      },
      body: JSON.stringify(validChangePayload()),
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      error: {
        code: "forbidden",
        message: "forbidden",
      },
    });
  } finally {
    await close();
  }
});

test("viewer token is forbidden on PATCH /api/v1/issues/{issue_id}/status", async () => {
  const { baseUrl, close } = await startServer({
    env: authEnv(),
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/issues/issue-x/status`, {
      method: "PATCH",
      headers: {
        authorization: "Bearer viewer-token-1",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        status: "investigating",
        expected_version: 1,
      }),
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      error: {
        code: "forbidden",
        message: "forbidden",
      },
    });
  } finally {
    await close();
  }
});

test("unknown api route returns 404 before auth challenge", async () => {
  const { baseUrl, close } = await startServer({
    env: authEnv(),
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/unknown-route`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: {
        code: "not_found",
        message: "route not found",
      },
    });
  } finally {
    await close();
  }
});

test("operator token preserves existing write behavior", async () => {
  const { baseUrl, close } = await startServer({
    env: authEnv(),
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/changes`, {
      method: "POST",
      headers: {
        authorization: "Bearer operator-token-1",
        "content-type": "application/json",
      },
      body: JSON.stringify(validChangePayload()),
    });
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), {
      change_id: "change-auth-1",
      idempotent_replay: false,
      created: true,
    });
  } finally {
    await close();
  }
});

function authEnv() {
  return {
    VIEWER_BEARER_TOKEN: "viewer-token-1",
    OPERATOR_BEARER_TOKEN: "operator-token-1",
  };
}

function createTestLogger(logs) {
  return {
    info(event, fields) {
      logs.push({ event, ...(fields ?? {}) });
    },
  };
}

function validChangePayload() {
  return {
    idempotency_key: "change-auth-key-1",
    change_type: "release",
    title: "Release 2026.04.23",
    target_service: "payments",
    source: "deploy-system",
    occurred_at: new Date().toISOString(),
  };
}

async function startServer(options = {}) {
  const server = createServer({
    changeStore: {
      async createOrReplay() {
        return {
          statusCode: 201,
          body: {
            change_id: "change-auth-1",
            idempotent_replay: false,
            created: true,
          },
        };
      },
    },
    eventStore: {},
    issueStore: {},
    runStore: {
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
