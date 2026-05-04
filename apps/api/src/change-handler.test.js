const test = require("node:test");
const assert = require("node:assert/strict");

const { createServer } = require("./server");

test("POST /api/v1/changes returns 201 for a new change", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const response = await postChange(baseUrl, {
      idempotency_key: "change-1",
      change_type: "release",
      title: "Release 2026.04.22",
      target_service: "payments",
      source: "deploy-system",
      occurred_at: new Date().toISOString(),
    });

    assert.equal(response.status, 201);

    const body = await response.json();
    assert.equal(body.created, true);
    assert.equal(body.idempotent_replay, false);
    assert.ok(body.change_id);
  } finally {
    await close();
  }
});

test("POST /api/v1/changes returns 200 for idempotent replay", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const payload = {
      idempotency_key: "change-2",
      change_type: "release",
      title: "Release 2026.04.22",
      target_service: "payments",
      source: "deploy-system",
      occurred_at: new Date().toISOString(),
    };

    const created = await postChange(baseUrl, payload);
    const createdBody = await created.json();

    const replay = await postChange(baseUrl, payload);
    assert.equal(replay.status, 200);

    const replayBody = await replay.json();
    assert.equal(replayBody.created, false);
    assert.equal(replayBody.idempotent_replay, true);
    assert.equal(replayBody.change_id, createdBody.change_id);
  } finally {
    await close();
  }
});

test("POST /api/v1/changes returns 400 when occurred_at is too far in the future", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const response = await postChange(baseUrl, {
      idempotency_key: "change-3",
      change_type: "release",
      title: "Release 2026.04.22",
      target_service: "payments",
      source: "deploy-system",
      occurred_at: new Date(Date.now() + 6 * 60 * 1000).toISOString(),
    });

    assert.equal(response.status, 400);

    const body = await response.json();
    assert.equal(body.error.code, "bad_request");
    assert.ok(body.error.details.includes("occurred_at cannot be more than 5 minutes in the future"));
  } finally {
    await close();
  }
});

test("POST /api/v1/changes returns 400 for an unknown top-level field", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const response = await postChange(baseUrl, {
      idempotency_key: "change-4",
      change_type: "release",
      title: "Release 2026.04.22",
      target_service: "payments",
      source: "deploy-system",
      occurred_at: new Date().toISOString(),
      unexpected_field: "reject-me",
    });

    assert.equal(response.status, 400);

    const body = await response.json();
    assert.equal(body.error.code, "bad_request");
    assert.ok(body.error.details.includes("unknown field: unexpected_field"));
  } finally {
    await close();
  }
});

test("POST /api/v1/changes accepts a non-personal system actor identifier", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const response = await postChange(baseUrl, {
      idempotency_key: "change-actor-valid-1",
      change_type: "release",
      title: "Release 2026.04.22",
      target_service: "payments",
      source: "deploy-system",
      actor: "deploy_bot",
      occurred_at: new Date().toISOString(),
    });

    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.created, true);
  } finally {
    await close();
  }
});

test("POST /api/v1/changes accepts a request with no actor field", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const response = await postChange(baseUrl, {
      idempotency_key: "change-actor-omitted-1",
      change_type: "release",
      title: "Release 2026.04.22",
      target_service: "payments",
      source: "deploy-system",
      occurred_at: new Date().toISOString(),
    });

    assert.equal(response.status, 201);
  } finally {
    await close();
  }
});

test("POST /api/v1/changes rejects an email-like actor", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const response = await postChange(baseUrl, {
      idempotency_key: "change-actor-email-1",
      change_type: "release",
      title: "Release 2026.04.22",
      target_service: "payments",
      source: "deploy-system",
      actor: "john@example.com",
      occurred_at: new Date().toISOString(),
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.code, "bad_request");
    assert.ok(
      body.error.details.includes(
        "actor must be a non-personal system identifier (no email-like values)"
      )
    );
  } finally {
    await close();
  }
});

test("POST /api/v1/changes rejects a display-name actor with spaces", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const response = await postChange(baseUrl, {
      idempotency_key: "change-actor-name-1",
      change_type: "release",
      title: "Release 2026.04.22",
      target_service: "payments",
      source: "deploy-system",
      actor: "John Smith",
      occurred_at: new Date().toISOString(),
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.code, "bad_request");
    assert.ok(
      body.error.details.includes(
        "actor must be a non-personal system identifier (no whitespace)"
      )
    );
  } finally {
    await close();
  }
});

test("POST /api/v1/changes rejects a whitespace-only actor when provided", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const response = await postChange(baseUrl, {
      idempotency_key: "change-actor-whitespace-1",
      change_type: "release",
      title: "Release 2026.04.22",
      target_service: "payments",
      source: "deploy-system",
      actor: "   ",
      occurred_at: new Date().toISOString(),
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.code, "bad_request");
    assert.ok(body.error.details.includes("actor must not be empty if provided"));
  } finally {
    await close();
  }
});

test("POST /api/v1/changes rejects an overly long actor", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const response = await postChange(baseUrl, {
      idempotency_key: "change-actor-long-1",
      change_type: "release",
      title: "Release 2026.04.22",
      target_service: "payments",
      source: "deploy-system",
      actor: "a".repeat(121),
      occurred_at: new Date().toISOString(),
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.code, "bad_request");
    assert.ok(body.error.details.includes("actor must be at most 120 characters"));
  } finally {
    await close();
  }
});

test("GET /api/v1/changes returns the default change list", async () => {
  const { baseUrl, close } = await startServer();

  try {
    await postChange(baseUrl, {
      idempotency_key: "change-list-1",
      change_type: "release",
      title: "Release A",
      target_service: "payments",
      source: "deploy-system",
      occurred_at: "2026-04-22T10:00:00.000Z",
    });

    await postChange(baseUrl, {
      idempotency_key: "change-list-2",
      change_type: "flag",
      title: "Flag B",
      target_service: "checkout",
      source: "flag-service",
      occurred_at: "2026-04-22T11:00:00.000Z",
    });

    const response = await fetch(`${baseUrl}/api/v1/changes`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.items.length, 2);
    assert.deepEqual(body.page, {
      limit: null,
      has_more: false,
      next_cursor: null,
    });
    assert.deepEqual(body.items.map((item) => ({
      change_type: item.change_type,
      title: item.title,
      target_service: item.target_service,
      source: item.source,
      occurred_at: item.occurred_at,
    })), [
      {
        change_type: "flag",
        title: "Flag B",
        target_service: "checkout",
        source: "flag-service",
        occurred_at: "2026-04-22T11:00:00.000Z",
      },
      {
        change_type: "release",
        title: "Release A",
        target_service: "payments",
        source: "deploy-system",
        occurred_at: "2026-04-22T10:00:00.000Z",
      },
    ]);
    assert.equal(typeof body.items[0].change_id, "string");
    assert.equal(typeof body.items[0].created_at, "string");
    assert.equal(typeof body.items[1].change_id, "string");
    assert.equal(typeof body.items[1].created_at, "string");
  } finally {
    await close();
  }
});

test("GET /api/v1/changes applies the change_type filter", async () => {
  let seenChangeType = null;
  const { baseUrl, close } = await startServerWithOptions({
    changeStore: {
      async listChanges({ changeType }) {
        seenChangeType = changeType;
        return { items: [] };
      },
      async createOrReplay() {
        throw new Error("unexpected createOrReplay call");
      },
    },
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/changes?change_type=release`);
    assert.equal(response.status, 200);
    assert.equal(seenChangeType, "release");
  } finally {
    await close();
  }
});

test("GET /api/v1/changes applies the target_service filter", async () => {
  let seenTargetService = null;
  const { baseUrl, close } = await startServerWithOptions({
    changeStore: {
      async listChanges({ targetService }) {
        seenTargetService = targetService;
        return { items: [] };
      },
      async createOrReplay() {
        throw new Error("unexpected createOrReplay call");
      },
    },
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/changes?target_service=payments`);
    assert.equal(response.status, 200);
    assert.equal(seenTargetService, "payments");
  } finally {
    await close();
  }
});

test("GET /api/v1/changes applies the limit query param", async () => {
  let seenLimit = null;
  const { baseUrl, close } = await startServerWithOptions({
    changeStore: {
      async listChanges({ limit }) {
        seenLimit = limit;
        return { items: [] };
      },
      async createOrReplay() {
        throw new Error("unexpected createOrReplay call");
      },
    },
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/changes?limit=5`);
    assert.equal(response.status, 200);
    assert.equal(seenLimit, 5);
  } finally {
    await close();
  }
});

test("GET /api/v1/changes returns page metadata with has_more", async () => {
  const { baseUrl, close } = await startServerWithOptions({
    changeStore: {
      async listChanges() {
        return {
          items: [
            {
              change_id: "change-3",
              change_type: "rule",
              title: "Rule C",
              target_service: "pricing",
              source: "rule-engine",
              occurred_at: "2026-04-22T12:00:00.000Z",
              created_at: "2026-04-22T12:01:00.000Z",
            },
            {
              change_id: "change-2",
              change_type: "flag",
              title: "Flag B",
              target_service: "checkout",
              source: "flag-service",
              occurred_at: "2026-04-22T11:00:00.000Z",
              created_at: "2026-04-22T11:01:00.000Z",
            },
            {
              change_id: "change-1",
              change_type: "release",
              title: "Release A",
              target_service: "payments",
              source: "deploy-system",
              occurred_at: "2026-04-22T10:00:00.000Z",
              created_at: "2026-04-22T10:01:00.000Z",
            },
          ],
        };
      },
      async createOrReplay() {
        throw new Error("unexpected createOrReplay call");
      },
    },
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/changes?limit=2`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.items.length, 2);
    assert.equal(body.page.limit, 2);
    assert.equal(body.page.has_more, true);
    assert.equal(typeof body.page.next_cursor, "string");
  } finally {
    await close();
  }
});

test("GET /api/v1/changes returns next_cursor and fetches the next page", async () => {
  const { baseUrl, close } = await startServer();

  try {
    await postChange(baseUrl, {
      idempotency_key: "change-cursor-1",
      change_type: "release",
      title: "Release A",
      target_service: "payments",
      source: "deploy-system",
      occurred_at: "2026-04-22T10:00:00.000Z",
    });
    await postChange(baseUrl, {
      idempotency_key: "change-cursor-2",
      change_type: "flag",
      title: "Flag B",
      target_service: "checkout",
      source: "flag-service",
      occurred_at: "2026-04-22T11:00:00.000Z",
    });
    await postChange(baseUrl, {
      idempotency_key: "change-cursor-3",
      change_type: "rule",
      title: "Rule C",
      target_service: "pricing",
      source: "rule-engine",
      occurred_at: "2026-04-22T12:00:00.000Z",
    });

    const firstResponse = await fetch(`${baseUrl}/api/v1/changes?limit=2`);
    assert.equal(firstResponse.status, 200);
    const firstBody = await firstResponse.json();
    assert.equal(firstBody.items.length, 2);
    assert.equal(firstBody.page.has_more, true);
    assert.equal(typeof firstBody.page.next_cursor, "string");

    const secondResponse = await fetch(`${baseUrl}/api/v1/changes?limit=2&cursor=${encodeURIComponent(firstBody.page.next_cursor)}`);
    assert.equal(secondResponse.status, 200);
    const secondBody = await secondResponse.json();
    assert.deepEqual(secondBody.items.map((item) => item.title), ["Release A"]);
    assert.deepEqual(secondBody.page, {
      limit: 2,
      has_more: false,
      next_cursor: null,
    });
  } finally {
    await close();
  }
});

test("GET /api/v1/changes returns 400 for an invalid cursor", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/changes?cursor=not-a-valid-cursor`);
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.code, "bad_request");
    assert.ok(body.error.details.includes("cursor is invalid"));
  } finally {
    await close();
  }
});

test("GET /api/v1/changes/{change_id} returns 200 for an existing change", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const createResponse = await postChange(baseUrl, {
      idempotency_key: "change-detail-1",
      change_type: "rule",
      title: "Rule rollout",
      target_service: "pricing",
      source: "rule-engine",
      actor: "operator-1",
      rule_scope: {
        market: "kr",
      },
      occurred_at: "2026-04-22T12:00:00.000Z",
    });
    const created = await createResponse.json();

    const response = await fetch(`${baseUrl}/api/v1/changes/${created.change_id}`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual({
      change_id: body.change_id,
      change_type: body.change_type,
      title: body.title,
      target_service: body.target_service,
      source: body.source,
      occurred_at: body.occurred_at,
      actor_present: body.actor_present,
      rule_scope_present: body.rule_scope_present,
    }, {
      change_id: created.change_id,
      change_type: "rule",
      title: "Rule rollout",
      target_service: "pricing",
      source: "rule-engine",
      occurred_at: "2026-04-22T12:00:00.000Z",
      actor_present: true,
      rule_scope_present: true,
    });
    assert.equal(typeof body.created_at, "string");
  } finally {
    await close();
  }
});

test("GET /api/v1/changes/{change_id}/traces returns traces linked by change_id", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const createResponse = await postChange(baseUrl, {
      idempotency_key: "change-traces-1",
      change_type: "release",
      title: "Release trace target",
      target_service: "checkout",
      source: "deploy-system",
      occurred_at: "2026-04-22T12:30:00.000Z",
    });
    const created = await createResponse.json();

    const traceResponse = await postTrace(baseUrl, {
      change_id: created.change_id,
      primary_issue_id: "issue-change-traces-1",
      anomaly_type: "error",
      anomaly_metric: "checkout.error_rate",
      anomaly_window_start: "2026-04-22T12:31:00.000Z",
      anomaly_window_end: "2026-04-22T12:36:00.000Z",
      evidences: [
        {
          evidence_type: "timing",
          source_ref: "event-change-traces-1",
          summary: "error spike followed release",
          strength: "strong",
        },
      ],
    });
    const trace = await traceResponse.json();

    const response = await fetch(`${baseUrl}/api/v1/changes/${created.change_id}/traces`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].trace_id, trace.trace_id);
    assert.equal(body.items[0].change_id, created.change_id);
    assert.equal(body.items[0].primary_issue_id, "issue-change-traces-1");
    assert.equal(body.items[0].status, "suspected");
    assert.equal(body.items[0].confidence, "strong");
    assert.equal(body.items[0].anomaly_type, "error");
    assert.deepEqual(body.page, {
      limit: null,
      has_more: false,
      next_cursor: null,
    });
    assert.equal("items" in body, true);
    assert.equal("change_id" in body, false);
  } finally {
    await close();
  }
});

test("GET /api/v1/changes/{change_id}/traces returns wrapped 404 for a missing change", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/changes/missing-change/traces`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: {
        code: "not_found",
        message: "change not found",
      },
    });
  } finally {
    await close();
  }
});

test("GET /api/v1/changes/{change_id} returns 404 for a missing change", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/changes/missing-change`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: {
        code: "not_found",
        message: "change not found",
      },
    });
  } finally {
    await close();
  }
});

test("GET /api/v1/changes/{change_id} does not expose payload or raw internal metadata", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const createResponse = await postChange(baseUrl, {
      idempotency_key: "change-detail-safe-1",
      change_type: "flag",
      title: "Flag rollout",
      target_service: "checkout",
      source: "flag-service",
      actor: "operator-2",
      payload: {
        secret_reason: "do-not-expose",
      },
      occurred_at: "2026-04-22T13:00:00.000Z",
    });
    const created = await createResponse.json();

    const response = await fetch(`${baseUrl}/api/v1/changes/${created.change_id}`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.change_id, created.change_id);
    assert.equal(body.actor_present, true);
    assert.equal(body.rule_scope_present, false);
    assert.equal("payload" in body, false);
    assert.equal("actor" in body, false);
    assert.equal("rule_scope" in body, false);
    assert.equal("created_by" in body, false);
    assert.equal("updated_by" in body, false);
  } finally {
    await close();
  }
});

async function startServer() {
  return startServerWithOptions();
}

async function startServerWithOptions(options = {}) {
  const server = createServer(options);

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

function postChange(baseUrl, payload) {
  return fetch(`${baseUrl}/api/v1/changes`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

function postTrace(baseUrl, payload) {
  return fetch(`${baseUrl}/api/v1/traces`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}
