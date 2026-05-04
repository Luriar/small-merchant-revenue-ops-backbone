const test = require("node:test");
const assert = require("node:assert/strict");

const { createServer } = require("./server");
const { InMemoryRunStore } = require("./run-store");

test("GET /api/v1/runs returns the default run list", async () => {
  const { baseUrl, close } = await startServer({
    runStore: {
      listRuns: async () => ({
        runs: [
          {
            run_id: "run-1",
            run_type: "normalization",
            target_kind: "event",
            target_ref: "evt-1",
            status: "pending",
            attempt: 0,
            created_at: "2026-04-22T10:00:00.000Z",
          },
          {
            run_id: "run-2",
            run_type: "reprocess",
            target_kind: "dlq_batch",
            target_ref: "dlq-1",
            status: "processing",
            attempt: 0,
            created_at: "2026-04-22T10:01:00.000Z",
          },
        ],
      }),
    },
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/runs`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.runs.length, 2);
    assert.equal(body.items.length, 2);
    assert.deepEqual(body.page, {
      limit: null,
      has_more: false,
      next_cursor: null,
    });
    assert.deepEqual(Object.keys(body.runs[0]), [
      "run_id",
      "run_type",
      "target_kind",
      "target_ref",
      "status",
      "attempt",
      "created_at",
    ]);
  } finally {
    await close();
  }
});

test("GET /api/v1/runs applies the status filter", async () => {
  let receivedStatus = null;
  const { baseUrl, close } = await startServer({
    runStore: {
      listRuns: async ({ status }) => {
        receivedStatus = status;
        return { runs: [] };
      },
    },
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/runs?status=failed`);
    assert.equal(response.status, 200);
    assert.equal(receivedStatus, "failed");
  } finally {
    await close();
  }
});

test("GET /api/v1/runs applies the limit query param", async () => {
  let receivedLimit = null;
  const { baseUrl, close } = await startServer({
    runStore: {
      listRuns: async ({ limit }) => {
        receivedLimit = limit;
        return { runs: [] };
      },
    },
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/runs?limit=5`);
    assert.equal(response.status, 200);
    assert.equal(receivedLimit, 5);
  } finally {
    await close();
  }
});

test("GET /api/v1/runs returns page metadata with has_more", async () => {
  const { baseUrl, close } = await startServer({
    runStore: {
      listRuns: async () => ({
        runs: [
          {
            run_id: "run-3",
            run_type: "normalization",
            target_kind: "event",
            target_ref: "evt-3",
            status: "pending",
            attempt: 0,
            created_at: "2026-04-22T10:02:00.000Z",
          },
          {
            run_id: "run-2",
            run_type: "normalization",
            target_kind: "event",
            target_ref: "evt-2",
            status: "processing",
            attempt: 0,
            created_at: "2026-04-22T10:01:00.000Z",
          },
          {
            run_id: "run-1",
            run_type: "normalization",
            target_kind: "event",
            target_ref: "evt-1",
            status: "failed",
            attempt: 1,
            created_at: "2026-04-22T10:00:00.000Z",
          },
        ],
      }),
    },
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/runs?limit=2`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.runs.length, 2);
    assert.equal(body.items.length, 2);
    assert.equal(body.page.limit, 2);
    assert.equal(body.page.has_more, true);
    assert.equal(typeof body.page.next_cursor, "string");
  } finally {
    await close();
  }
});

test("GET /api/v1/runs returns next_cursor and fetches the next page", async () => {
  const { baseUrl, close } = await startServer({
    runStore: new InMemoryRunStore({
      seedRuns: [
        {
          run_id: "run-1",
          run_type: "normalization",
          target_kind: "event",
          target_ref: "evt-1",
          status: "failed",
          attempt: 1,
          created_at: "2026-04-22T10:00:00.000Z",
        },
        {
          run_id: "run-2",
          run_type: "normalization",
          target_kind: "event",
          target_ref: "evt-2",
          status: "processing",
          attempt: 0,
          created_at: "2026-04-22T10:01:00.000Z",
        },
        {
          run_id: "run-3",
          run_type: "reprocess",
          target_kind: "issue",
          target_ref: "issue-1",
          status: "pending",
          attempt: 0,
          created_at: "2026-04-22T10:02:00.000Z",
        },
      ],
    }),
  });

  try {
    const firstResponse = await fetch(`${baseUrl}/api/v1/runs?limit=2`);
    assert.equal(firstResponse.status, 200);
    const firstBody = await firstResponse.json();
    assert.equal(firstBody.items.length, 2);
    assert.equal(firstBody.runs.length, 2);
    assert.equal(typeof firstBody.page.next_cursor, "string");

    const secondResponse = await fetch(`${baseUrl}/api/v1/runs?limit=2&cursor=${encodeURIComponent(firstBody.page.next_cursor)}`);
    assert.equal(secondResponse.status, 200);
    const secondBody = await secondResponse.json();
    assert.deepEqual(secondBody.items.map((item) => item.run_id), ["run-1"]);
    assert.deepEqual(secondBody.runs.map((item) => item.run_id), ["run-1"]);
    assert.deepEqual(secondBody.page, {
      limit: 2,
      has_more: false,
      next_cursor: null,
    });
  } finally {
    await close();
  }
});

test("GET /api/v1/runs returns 400 for an invalid cursor", async () => {
  const { baseUrl, close } = await startServer({
    runStore: new InMemoryRunStore(),
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/runs?cursor=not-a-valid-cursor`);
    assert.equal(response.status, 400);

    const body = await response.json();
    assert.equal(body.error.code, "bad_request");
    assert.ok(body.error.details.includes("cursor is invalid"));
  } finally {
    await close();
  }
});

test("GET /api/v1/runs/overview returns store-backed aggregate data", async () => {
  const { baseUrl, close } = await startServer({
    runStore: new InMemoryRunStore({
      seedRuns: [
        {
          run_id: "run-overview-pending-1",
          run_type: "normalization",
          status: "pending",
          created_at: "2026-04-22T10:00:00.000Z",
        },
        {
          run_id: "run-overview-processing-1",
          run_type: "normalization",
          status: "processing",
          created_at: "2026-04-22T10:01:00.000Z",
        },
        {
          run_id: "run-overview-failed-1",
          run_type: "normalization",
          status: "failed",
          error_class: "normalization_timeout",
          input_ref: { hidden: true },
          created_at: "2026-04-22T10:02:00.000Z",
        },
        {
          run_id: "run-overview-dlq-1",
          run_type: "correlation",
          status: "dlq",
          error_class: "dlq_threshold_exceeded",
          created_at: "2026-04-22T10:03:00.000Z",
        },
        {
          run_id: "run-overview-completed-1",
          run_type: "normalization",
          status: "completed",
          created_at: "2026-04-22T10:04:00.000Z",
        },
      ],
    }),
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/runs/overview`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.deepEqual(body.kpis, {
      pending: 1,
      processing: 1,
      failed: 1,
      dlq: 1,
    });
    assert.deepEqual(body.distribution, [
      { status: "pending", count: 1 },
      { status: "processing", count: 1 },
      { status: "failed", count: 1 },
      { status: "dlq", count: 1 },
    ]);
    assert.equal(body.run_id, undefined);
    assert.equal(body.input_ref, undefined);
  } finally {
    await close();
  }
});

test("GET /api/v1/runs/failures returns safe grouped failure data", async () => {
  const { baseUrl, close } = await startServer({
    runStore: new InMemoryRunStore({
      seedRuns: [
        {
          run_id: "run-failure-1",
          run_type: "normalization",
          status: "failed",
          error_class: "normalization_timeout",
          input_ref: { hidden: true },
          created_at: "2026-04-22T10:00:00.000Z",
          updated_at: "2026-04-22T10:04:00.000Z",
        },
        {
          run_id: "run-failure-2",
          run_type: "normalization",
          status: "failed",
          error_class: "normalization_timeout",
          created_at: "2026-04-22T10:01:00.000Z",
          updated_at: "2026-04-22T10:05:00.000Z",
        },
        {
          run_id: "run-failure-3",
          run_type: "correlation",
          status: "dlq",
          error_class: "",
          created_at: "2026-04-22T10:02:00.000Z",
          updated_at: "2026-04-22T10:06:00.000Z",
        },
        {
          run_id: "run-failure-completed-1",
          run_type: "normalization",
          status: "completed",
          error_class: "ignored_completed",
          created_at: "2026-04-22T10:03:00.000Z",
        },
      ],
    }),
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/runs/failures`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.deepEqual(body.groups, [
      {
        error_class: "unknown",
        count: 1,
        latest_occurred_at: "2026-04-22T10:06:00.000Z",
        representative_run_type: "correlation",
        retryable: true,
      },
      {
        error_class: "normalization_timeout",
        count: 2,
        latest_occurred_at: "2026-04-22T10:05:00.000Z",
        representative_run_type: "normalization",
        retryable: true,
      },
    ]);
    assert.equal(body.run_id, undefined);
    assert.equal(body.input_ref, undefined);
    assert.equal(body.stack, undefined);
  } finally {
    await close();
  }
});

test("GET /api/v1/runs/{run_id} returns 200 for an existing run", async () => {
  const { baseUrl, close } = await startServer({
    runStore: new InMemoryRunStore({
      seedRuns: [
        {
          run_id: "run-retry-1",
          run_type: "normalization",
          target_kind: "event",
          target_ref: "evt-1",
          status: "pending",
          attempt: 2,
          retry_action: "retry",
          original_run_id: "run-failed-1",
          created_at: "2026-04-22T10:02:00.000Z",
        },
      ],
    }),
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/runs/run-retry-1`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.run_id, "run-retry-1");
    assert.equal(body.run_type, "normalization");
    assert.equal(body.target_kind, "event");
    assert.equal(body.target_ref, "evt-1");
    assert.equal(body.status, "pending");
    assert.equal(body.attempt, 2);
    assert.equal(body.created_at, "2026-04-22T10:02:00.000Z");
    assert.equal(body.retry_action, "retry");
    assert.equal(body.original_run_id, "run-failed-1");
  } finally {
    await close();
  }
});

test("GET /api/v1/runs/{run_id} returns 404 for a missing run", async () => {
  const { baseUrl, close } = await startServer({
    runStore: new InMemoryRunStore(),
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/runs/missing-run`);
    assert.equal(response.status, 404);

    const body = await response.json();
    assert.equal(body.error.code, "not_found");
    assert.equal(body.error.message, "run not found");
  } finally {
    await close();
  }
});

test("GET /api/v1/runs/{run_id} does not expose raw input_ref", async () => {
  const { baseUrl, close } = await startServer({
    runStore: {
      async getRunById() {
        return {
          run_id: "run-raw-1",
          run_type: "normalization",
          target_kind: "event",
          target_ref: "evt-raw-1",
          status: "failed",
          attempt: 1,
          created_at: "2026-04-22T10:03:00.000Z",
          retry_action: "retry",
          original_run_id: "run-origin-1",
          input_ref: {
            action: "retry",
            original_run_id: "run-origin-1",
            idempotency_key: "retry-key-secret",
            reason: "contains-internal-fields",
          },
        };
      },
    },
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/runs/run-raw-1`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.input_ref, undefined);
    assert.equal(body.retry_action, "retry");
    assert.equal(body.original_run_id, "run-origin-1");
    assert.equal(body.idempotency_key, undefined);
  } finally {
    await close();
  }
});

test("GET /api/v1/runs/{run_id}/state-log returns 200 for an existing run", async () => {
  const { baseUrl, close } = await startServer({
    runStore: new InMemoryRunStore({
      seedRuns: [
        {
          run_id: "run-log-1",
          run_type: "normalization",
          status: "completed",
          attempt: 1,
          created_at: "2026-04-22T10:04:00.000Z",
          state_logs: [
            {
              state_log_id: 1,
              from_status: null,
              to_status: "pending",
              changed_at: "2026-04-22T10:00:00.000Z",
              metadata: { hidden: true },
            },
            {
              state_log_id: 2,
              from_status: "pending",
              to_status: "processing",
              changed_at: "2026-04-22T10:01:00.000Z",
            },
          ],
        },
      ],
    }),
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/runs/run-log-1/state-log`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.deepEqual(body.items, [
      {
        state_log_id: 1,
        run_id: "run-log-1",
        from_status: null,
        to_status: "pending",
        changed_at: "2026-04-22T10:00:00.000Z",
      },
      {
        state_log_id: 2,
        run_id: "run-log-1",
        from_status: "pending",
        to_status: "processing",
        changed_at: "2026-04-22T10:01:00.000Z",
      },
    ]);
    assert.equal(body.items[0].metadata, undefined);
  } finally {
    await close();
  }
});

test("GET /api/v1/runs/{run_id}/state-log keeps ordering stable", async () => {
  const { baseUrl, close } = await startServer({
    runStore: new InMemoryRunStore({
      seedRuns: [
        {
          run_id: "run-log-ordered-1",
          run_type: "normalization",
          status: "failed",
          attempt: 1,
          created_at: "2026-04-22T10:04:00.000Z",
          state_logs: [
            {
              state_log_id: 30,
              from_status: "pending",
              to_status: "processing",
              changed_at: "2026-04-22T10:01:00.000Z",
            },
            {
              state_log_id: 10,
              from_status: null,
              to_status: "pending",
              changed_at: "2026-04-22T10:00:00.000Z",
            },
            {
              state_log_id: 20,
              from_status: "processing",
              to_status: "failed",
              changed_at: "2026-04-22T10:01:00.000Z",
            },
          ],
        },
      ],
    }),
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/runs/run-log-ordered-1/state-log`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.deepEqual(
      body.items.map((item) => item.state_log_id),
      [10, 20, 30],
    );
  } finally {
    await close();
  }
});

test("GET /api/v1/runs/{run_id}/state-log returns 404 for a missing run", async () => {
  const { baseUrl, close } = await startServer({
    runStore: new InMemoryRunStore(),
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/runs/missing-run/state-log`);
    assert.equal(response.status, 404);

    const body = await response.json();
    assert.equal(body.error.code, "not_found");
    assert.equal(body.error.message, "run not found");
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
