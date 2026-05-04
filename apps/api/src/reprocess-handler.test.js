const test = require("node:test");
const assert = require("node:assert/strict");

const { createServer } = require("./server");
const { InMemoryRunStore } = require("./run-store");

test("POST /api/v1/reprocess returns 202 for a new reprocess request", async () => {
  const { baseUrl, close } = await startServer({
    runStore: new InMemoryRunStore(),
  });

  try {
    const response = await postReprocess(baseUrl, {
      idempotency_key: "reprocess-key-1",
      target_kind: "dlq_batch",
      target_ref: "dlq-2026-04-22",
      reason: "manual_reprocess",
    });

    assert.equal(response.status, 202);
    const body = await response.json();
    assert.equal(body.action, "reprocess_requested");
    assert.equal(body.idempotent_replay, false);
    assert.equal(body.status, "accepted");
    assert.ok(body.new_run_id);
  } finally {
    await close();
  }
});

test("POST /api/v1/reprocess returns same new_run_id for idempotent replay", async () => {
  const { baseUrl, close } = await startServer({
    runStore: new InMemoryRunStore(),
  });

  try {
    const first = await postReprocess(baseUrl, {
      idempotency_key: "reprocess-key-2",
      target_kind: "event_batch",
      target_ref: "events-2026-04-22",
      reason: "manual_reprocess",
    });
    const firstBody = await first.json();

    const replay = await postReprocess(baseUrl, {
      idempotency_key: "reprocess-key-2",
      target_kind: "event_batch",
      target_ref: "events-2026-04-22",
      reason: "manual_reprocess",
    });

    assert.equal(replay.status, 200);
    const replayBody = await replay.json();
    assert.equal(replayBody.idempotent_replay, true);
    assert.equal(replayBody.new_run_id, firstBody.new_run_id);
  } finally {
    await close();
  }
});

test("POST /api/v1/reprocess returns 409 when active reprocess already exists", async () => {
  const { baseUrl, close } = await startServer({
    runStore: new InMemoryRunStore({
      seedRuns: [
        {
          run_id: "reprocess-active-1",
          run_type: "reprocess",
          status: "processing",
          attempt: 0,
          target_kind: "dlq_batch",
          target_ref: "dlq-2026-04-22",
          idempotency_key: "reprocess-key-existing",
        },
      ],
    }),
  });

  try {
    const response = await postReprocess(baseUrl, {
      idempotency_key: "reprocess-key-3",
      target_kind: "dlq_batch",
      target_ref: "dlq-2026-04-22",
      reason: "manual_reprocess",
    });

    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.error.code, "active_reprocess_exists");
  } finally {
    await close();
  }
});

test("POST /api/v1/reprocess returns 400 for unknown top-level field", async () => {
  const { baseUrl, close } = await startServer({
    runStore: new InMemoryRunStore(),
  });

  try {
    const response = await postReprocess(baseUrl, {
      idempotency_key: "reprocess-key-4",
      target_kind: "event_batch",
      target_ref: "events-2026-04-22",
      reason: "manual_reprocess",
      unexpected_field: "reject-me",
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.ok(body.error.details.includes("unknown field: unexpected_field"));
  } finally {
    await close();
  }
});

test("POST /api/v1/reprocess returns 400 when reason is missing", async () => {
  const { baseUrl, close } = await startServer({
    runStore: new InMemoryRunStore(),
  });

  try {
    const response = await postReprocess(baseUrl, {
      idempotency_key: "reprocess-key-missing-reason",
      target_kind: "event_batch",
      target_ref: "events-2026-04-22",
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.code, "bad_request");
    assert.ok(body.error.details.includes("reason is required"));
  } finally {
    await close();
  }
});

test("POST /api/v1/reprocess returns 400 when reason is empty", async () => {
  const { baseUrl, close } = await startServer({
    runStore: new InMemoryRunStore(),
  });

  try {
    const response = await postReprocess(baseUrl, {
      idempotency_key: "reprocess-key-empty-reason",
      target_kind: "event_batch",
      target_ref: "events-2026-04-22",
      reason: "   ",
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.code, "bad_request");
    assert.ok(body.error.details.includes("reason must be a non-empty string"));
  } finally {
    await close();
  }
});

test("POST /api/v1/reprocess returns 400 when reason is not a string", async () => {
  const { baseUrl, close } = await startServer({
    runStore: new InMemoryRunStore(),
  });

  try {
    const response = await postReprocess(baseUrl, {
      idempotency_key: "reprocess-key-non-string-reason",
      target_kind: "event_batch",
      target_ref: "events-2026-04-22",
      reason: 123,
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.code, "bad_request");
    assert.ok(body.error.details.includes("reason must be a non-empty string"));
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

function postReprocess(baseUrl, payload) {
  return fetch(`${baseUrl}/api/v1/reprocess`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}
