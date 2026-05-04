const test = require("node:test");
const assert = require("node:assert/strict");

const { createServer } = require("./server");
const { InMemoryRunStore } = require("./run-store");

test("POST /api/v1/runs/{run_id}/retry returns 202 for retryable failed run", async () => {
  const { baseUrl, close } = await startServer({
    runStore: new InMemoryRunStore({
      seedRuns: [{ run_id: "run-failed-1", status: "failed", attempt: 0 }],
    }),
  });

  try {
    const response = await postRetry(baseUrl, "run-failed-1", {
      idempotency_key: "retry-key-1",
      reason: "retry_requested",
    });

    assert.equal(response.status, 202);
    const body = await response.json();
    assert.equal(body.action, "retry_requested");
    assert.equal(body.original_run_id, "run-failed-1");
    assert.equal(body.idempotent_replay, false);
    assert.equal(body.status, "accepted");
    assert.ok(body.new_run_id);
  } finally {
    await close();
  }
});

test("POST /api/v1/runs/{run_id}/retry returns same new_run_id for idempotent replay", async () => {
  const { baseUrl, close } = await startServer({
    runStore: new InMemoryRunStore({
      seedRuns: [{ run_id: "run-dlq-1", status: "dlq", attempt: 2 }],
    }),
  });

  try {
    const first = await postRetry(baseUrl, "run-dlq-1", {
      idempotency_key: "retry-key-2",
      reason: "retry_requested",
    });
    const firstBody = await first.json();

    const replay = await postRetry(baseUrl, "run-dlq-1", {
      idempotency_key: "retry-key-2",
      reason: "retry_requested",
    });

    assert.equal(replay.status, 200);
    const replayBody = await replay.json();
    assert.equal(replayBody.idempotent_replay, true);
    assert.equal(replayBody.new_run_id, firstBody.new_run_id);
  } finally {
    await close();
  }
});

test("POST /api/v1/runs/{run_id}/retry returns 409 when active retry already exists", async () => {
  const { baseUrl, close } = await startServer({
    runStore: new InMemoryRunStore({
      seedRuns: [
        { run_id: "run-failed-2", status: "failed", attempt: 1 },
        {
          run_id: "retry-active-1",
          status: "pending",
          attempt: 2,
          original_run_id: "run-failed-2",
          retry_action: "retry",
          idempotency_key: "retry-key-existing",
        },
      ],
    }),
  });

  try {
    const response = await postRetry(baseUrl, "run-failed-2", {
      idempotency_key: "retry-key-3",
      reason: "retry_requested",
    });

    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.error.code, "active_retry_exists");
  } finally {
    await close();
  }
});

test("POST /api/v1/runs/{run_id}/retry returns 409 for non-retryable run status", async () => {
  const { baseUrl, close } = await startServer({
    runStore: new InMemoryRunStore({
      seedRuns: [{ run_id: "run-completed-1", status: "completed", attempt: 0 }],
    }),
  });

  try {
    const response = await postRetry(baseUrl, "run-completed-1", {
      idempotency_key: "retry-key-4",
      reason: "retry_requested",
    });

    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.error.code, "run_not_retryable");
  } finally {
    await close();
  }
});

async function startServer({ runStore }) {
  const server = createServer({ runStore });

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

function postRetry(baseUrl, runId, payload) {
  return fetch(`${baseUrl}/api/v1/runs/${runId}/retry`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}
