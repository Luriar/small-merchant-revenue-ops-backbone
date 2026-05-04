const test = require("node:test");
const assert = require("node:assert/strict");

const { createServer } = require("./server");

test("POST /api/v1/events/intake returns 202 for a new accepted event", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const response = await postEvent(baseUrl, validPayload("evt-1"));
    assert.equal(response.status, 202);

    const body = await response.json();
    assert.equal(body.accepted, true);
    assert.equal(body.idempotent_replay, false);
    assert.equal(body.event_id, "evt-1");
  } finally {
    await close();
  }
});

test("POST /api/v1/events/intake returns 200 for authoritative event replay", async () => {
  const { baseUrl, close } = await startServer();

  try {
    await postEvent(baseUrl, validPayload("evt-2"));
    const replay = await postEvent(baseUrl, validPayload("evt-2"));
    assert.equal(replay.status, 200);

    const body = await replay.json();
    assert.equal(body.accepted, true);
    assert.equal(body.idempotent_replay, true);
    assert.equal(body.event_id, "evt-2");
  } finally {
    await close();
  }
});

test("POST /api/v1/events/intake returns 400 for invalid event_type", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const response = await postEvent(baseUrl, {
      ...validPayload("evt-3"),
      event_type: "internal",
    });
    assert.equal(response.status, 400);

    const body = await response.json();
    assert.ok(body.error.details.includes("event_type must be one of: product, support_issue"));
  } finally {
    await close();
  }
});

test("POST /api/v1/events/intake returns 400 for retry_count out of range", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const response = await postEvent(baseUrl, {
      ...validPayload("evt-4"),
      retry_count: 256,
    });
    assert.equal(response.status, 400);

    const body = await response.json();
    assert.ok(body.error.details.includes("retry_count must be an integer between 0 and 255"));
  } finally {
    await close();
  }
});

test("POST /api/v1/events/intake returns 400 for an unknown top-level field", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const response = await postEvent(baseUrl, {
      ...validPayload("evt-5"),
      unexpected_field: "reject-me",
    });
    assert.equal(response.status, 400);

    const body = await response.json();
    assert.ok(body.error.details.includes("unknown field: unexpected_field"));
  } finally {
    await close();
  }
});

async function startServer() {
  const server = createServer();

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

function postEvent(baseUrl, payload) {
  return fetch(`${baseUrl}/api/v1/events/intake`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

function validPayload(eventId) {
  return {
    event_id: eventId,
    occurred_at: new Date().toISOString(),
    target_service: "payments",
    event_type: "product",
    event_subtype: "checkout_failed",
    retry_count: 1,
    is_error: true,
    user_id: "usr_9f3ab2",
    session_id: "sess_3a91f0",
    request_id: "req_7b61dd",
    payload: {
      metric: "checkout.error_rate",
    },
    source: "app-metrics",
  };
}
