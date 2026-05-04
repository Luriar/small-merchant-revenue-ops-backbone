const test = require("node:test");
const assert = require("node:assert/strict");

const { createServer } = require("./server");
const { InMemoryTraceStore } = require("./trace-store");

test("POST /api/v1/traces creates a new trace with evidences", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const response = await postTrace(baseUrl, validPayload());
    assert.equal(response.status, 201);

    const body = await response.json();
    assert.equal(body.trace_created, true);
    assert.equal(body.trace_reused, false);
    assert.equal(body.evidence_count, 2);
    assert.equal(body.evidence_created_count, 2);
    assert.equal(body.evidence_skipped_count, 0);
    assert.ok(body.trace_id);
  } finally {
    await close();
  }
});

test("POST /api/v1/traces reuses an existing trace for the same trace key", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const first = await postTrace(baseUrl, validPayload());
    const firstBody = await first.json();

    const replay = await postTrace(baseUrl, validPayload({
      evidences: [singleEvidence("timing", "event-3", "metric spike detected")],
    }));
    assert.equal(replay.status, 200);

    const replayBody = await replay.json();
    assert.equal(replayBody.trace_created, false);
    assert.equal(replayBody.trace_reused, true);
    assert.equal(replayBody.trace_id, firstBody.trace_id);
  } finally {
    await close();
  }
});

test("POST /api/v1/traces skips duplicate evidence fingerprints", async () => {
  const { baseUrl, close } = await startServer();

  try {
    await postTrace(baseUrl, validPayload({
      evidences: [singleEvidence("timing", "event-1", "metric spike detected")],
    }));

    const replay = await postTrace(baseUrl, validPayload({
      evidences: [singleEvidence("timing", "event-1", "metric spike detected")],
    }));

    const body = await replay.json();
    assert.equal(body.trace_reused, true);
    assert.equal(body.evidence_count, 1);
    assert.equal(body.evidence_created_count, 0);
    assert.equal(body.evidence_skipped_count, 1);
  } finally {
    await close();
  }
});

test("POST /api/v1/traces returns 400 for unknown top-level field", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const response = await postTrace(baseUrl, {
      ...validPayload(),
      unexpected_field: "reject-me",
    });
    assert.equal(response.status, 400);

    const body = await response.json();
    assert.ok(body.error.details.includes("unknown field: unexpected_field"));
  } finally {
    await close();
  }
});

test("GET /api/v1/traces returns the default trace list", async () => {
  const { baseUrl, close } = await startServer({
    traceStore: {
      async listTraces() {
        return {
          items: [
            {
              trace_id: "trace-2",
              change_id: "change-2",
              primary_issue_id: "issue-2",
              status: "suspected",
              confidence: "medium",
              anomaly_type: "error",
              anomaly_metric: "checkout.error_rate",
              anomaly_window_start: "2026-04-22T10:05:00.000Z",
              anomaly_window_end: "2026-04-22T10:10:00.000Z",
              created_at: "2026-04-22T10:11:00.000Z",
              anomaly_detail: { hidden: true },
            },
          ],
        };
      },
    },
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/traces`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.deepEqual(body.items, [
      {
        trace_id: "trace-2",
        change_id: "change-2",
        primary_issue_id: "issue-2",
        status: "suspected",
        confidence: "medium",
        anomaly_type: "error",
        anomaly_metric: "checkout.error_rate",
        anomaly_window_start: "2026-04-22T10:05:00.000Z",
        anomaly_window_end: "2026-04-22T10:10:00.000Z",
        created_at: "2026-04-22T10:11:00.000Z",
      },
    ]);
    assert.deepEqual(body.page, {
      limit: null,
      has_more: false,
      next_cursor: null,
    });
    assert.equal(body.items[0].anomaly_detail, undefined);
  } finally {
    await close();
  }
});

test("GET /api/v1/traces applies the status filter", async () => {
  let seenStatus = null;
  const { baseUrl, close } = await startServer({
    traceStore: {
      async listTraces({ status }) {
        seenStatus = status;
        return { items: [] };
      },
    },
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/traces?status=suspected`);
    assert.equal(response.status, 200);
    assert.equal(seenStatus, "suspected");
  } finally {
    await close();
  }
});

test("GET /api/v1/traces applies the change_id filter", async () => {
  let seenChangeId = null;
  const { baseUrl, close } = await startServer({
    traceStore: {
      async listTraces({ changeId }) {
        seenChangeId = changeId;
        return { items: [] };
      },
    },
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/traces?change_id=change-123`);
    assert.equal(response.status, 200);
    assert.equal(seenChangeId, "change-123");
  } finally {
    await close();
  }
});

test("GET /api/v1/traces applies the limit query param", async () => {
  let seenLimit = null;
  const { baseUrl, close } = await startServer({
    traceStore: {
      async listTraces({ limit }) {
        seenLimit = limit;
        return { items: [] };
      },
    },
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/traces?limit=5`);
    assert.equal(response.status, 200);
    assert.equal(seenLimit, 5);
  } finally {
    await close();
  }
});

test("GET /api/v1/traces returns page metadata with has_more", async () => {
  const { baseUrl, close } = await startServer({
    traceStore: {
      async listTraces() {
        return {
          items: [
            {
              trace_id: "trace-3",
              change_id: "change-3",
              primary_issue_id: "issue-3",
              status: "suspected",
              confidence: "strong",
              anomaly_type: "error",
              anomaly_metric: "metric-3",
              anomaly_window_start: "2026-04-22T10:10:00.000Z",
              anomaly_window_end: "2026-04-22T10:15:00.000Z",
              created_at: "2026-04-22T10:16:00.000Z",
            },
            {
              trace_id: "trace-2",
              change_id: "change-2",
              primary_issue_id: "issue-2",
              status: "suspected",
              confidence: "medium",
              anomaly_type: "error",
              anomaly_metric: "metric-2",
              anomaly_window_start: "2026-04-22T10:05:00.000Z",
              anomaly_window_end: "2026-04-22T10:10:00.000Z",
              created_at: "2026-04-22T10:11:00.000Z",
            },
            {
              trace_id: "trace-1",
              change_id: "change-1",
              primary_issue_id: "issue-1",
              status: "suspected",
              confidence: "weak",
              anomaly_type: "error",
              anomaly_metric: "metric-1",
              anomaly_window_start: "2026-04-22T10:00:00.000Z",
              anomaly_window_end: "2026-04-22T10:05:00.000Z",
              created_at: "2026-04-22T10:06:00.000Z",
            },
          ],
        };
      },
    },
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/traces?limit=2`);
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

test("GET /api/v1/traces returns next_cursor and fetches the next page", async () => {
  const { baseUrl, close } = await startServer();

  try {
    await postTrace(baseUrl, validPayload({
      change_id: "change-cursor-1",
      primary_issue_id: "issue-cursor-1",
      anomaly_metric: "metric-1",
      anomaly_window_start: "2026-04-22T10:00:00.000Z",
      anomaly_window_end: "2026-04-22T10:05:00.000Z",
      evidences: [validPayload().evidences[0]],
    }));
    await postTrace(baseUrl, validPayload({
      change_id: "change-cursor-2",
      primary_issue_id: "issue-cursor-2",
      anomaly_metric: "metric-2",
      anomaly_window_start: "2026-04-22T11:00:00.000Z",
      anomaly_window_end: "2026-04-22T11:05:00.000Z",
      evidences: [validPayload().evidences[0]],
    }));
    await postTrace(baseUrl, validPayload({
      change_id: "change-cursor-3",
      primary_issue_id: "issue-cursor-3",
      anomaly_metric: "metric-3",
      anomaly_window_start: "2026-04-22T12:00:00.000Z",
      anomaly_window_end: "2026-04-22T12:05:00.000Z",
      evidences: [validPayload().evidences[0]],
    }));

    const firstResponse = await fetch(`${baseUrl}/api/v1/traces?limit=2`);
    assert.equal(firstResponse.status, 200);
    const firstBody = await firstResponse.json();
    assert.equal(firstBody.items.length, 2);
    assert.equal(firstBody.page.has_more, true);
    assert.equal(typeof firstBody.page.next_cursor, "string");

    const secondResponse = await fetch(`${baseUrl}/api/v1/traces?limit=2&cursor=${encodeURIComponent(firstBody.page.next_cursor)}`);
    assert.equal(secondResponse.status, 200);
    const secondBody = await secondResponse.json();
    assert.deepEqual(secondBody.items.map((item) => item.change_id), ["change-cursor-1"]);
    assert.deepEqual(secondBody.page, {
      limit: 2,
      has_more: false,
      next_cursor: null,
    });
  } finally {
    await close();
  }
});

test("GET /api/v1/traces returns 400 for an invalid cursor", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/traces?cursor=not-a-valid-cursor`);
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.code, "bad_request");
    assert.ok(body.error.details.includes("cursor is invalid"));
  } finally {
    await close();
  }
});

test("GET /api/v1/traces/{trace_id} returns 200 for an existing trace", async () => {
  const { baseUrl, close } = await startServer({
    traceStore: {
      async getTraceById() {
        return {
          trace_id: "trace-detail-1",
          change_id: "change-1",
          primary_issue_id: "issue-1",
          status: "suspected",
          confidence: "strong",
          anomaly_type: "error",
          anomaly_metric: "checkout.error_rate",
          anomaly_window_start: "2026-04-22T10:00:00.000Z",
          anomaly_window_end: "2026-04-22T10:05:00.000Z",
          created_at: "2026-04-22T10:06:00.000Z",
          evidence_count: 2,
          anomaly_detail: { hidden: true },
        };
      },
    },
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/traces/trace-detail-1`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.deepEqual(body, {
      trace_id: "trace-detail-1",
      change_id: "change-1",
      primary_issue_id: "issue-1",
      status: "suspected",
      confidence: "strong",
      anomaly_type: "error",
      anomaly_metric: "checkout.error_rate",
      anomaly_window_start: "2026-04-22T10:00:00.000Z",
      anomaly_window_end: "2026-04-22T10:05:00.000Z",
      created_at: "2026-04-22T10:06:00.000Z",
      evidence_count: 2,
    });
  } finally {
    await close();
  }
});

test("GET /api/v1/traces/{trace_id} returns 404 for a missing trace", async () => {
  const { baseUrl, close } = await startServer({
    traceStore: {
      async getTraceById() {
        return null;
      },
    },
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/traces/missing-trace`);
    assert.equal(response.status, 404);

    const body = await response.json();
    assert.equal(body.error.code, "not_found");
    assert.equal(body.error.message, "trace not found");
  } finally {
    await close();
  }
});

test("GET /api/v1/traces/{trace_id} does not expose anomaly_detail or raw metadata", async () => {
  const { baseUrl, close } = await startServer({
    traceStore: {
      async getTraceById() {
        return {
          trace_id: "trace-safe-1",
          change_id: "change-2",
          primary_issue_id: "issue-2",
          status: "confirmed",
          confidence: "medium",
          anomaly_type: "error",
          anomaly_metric: "checkout.error_rate",
          anomaly_window_start: "2026-04-22T10:10:00.000Z",
          anomaly_window_end: "2026-04-22T10:15:00.000Z",
          created_at: "2026-04-22T10:16:00.000Z",
          evidence_count: 3,
          anomaly_detail: { delta_pct: 200 },
          metadata: { internal: true },
          evidence_payload: { should_not: "leak" },
          fingerprint: "secret",
        };
      },
    },
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/traces/trace-safe-1`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.anomaly_detail, undefined);
    assert.equal(body.metadata, undefined);
    assert.equal(body.evidence_payload, undefined);
    assert.equal(body.fingerprint, undefined);
    assert.equal(body.evidence_count, 3);
  } finally {
    await close();
  }
});

test("GET /api/v1/traces/{trace_id}/evidences returns 200 for an existing trace", async () => {
  const { baseUrl, close } = await startServer({
    traceStore: {
      async getTraceById() {
        return { trace_id: "trace-evd-1", evidence_count: 2 };
      },
      async listTraceEvidences() {
        return {
          items: [
            {
              evidence_id: "evidence-1",
              trace_id: "trace-evd-1",
              evidence_type: "timing",
              strength: "strong",
              summary: "metric spike detected",
              source_ref: "event-1",
              payload: { hidden: true },
            },
            {
              evidence_id: "evidence-2",
              trace_id: "trace-evd-1",
              evidence_type: "event_spike",
              strength: "medium",
              summary: "checkout failures increased",
              source_ref: "event-2",
            },
          ],
        };
      },
    },
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/traces/trace-evd-1/evidences`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.deepEqual(body.items, [
      {
        evidence_id: "evidence-1",
        trace_id: "trace-evd-1",
        evidence_type: "timing",
        strength: "strong",
        summary: "metric spike detected",
        source_ref: "event-1",
      },
      {
        evidence_id: "evidence-2",
        trace_id: "trace-evd-1",
        evidence_type: "event_spike",
        strength: "medium",
        summary: "checkout failures increased",
        source_ref: "event-2",
      },
    ]);
  } finally {
    await close();
  }
});

test("GET /api/v1/traces/{trace_id}/primary-issue returns 200 for an existing primary issue", async () => {
  const { baseUrl, close } = await startServer({
    traceStore: {
      async getTraceById() {
        return {
          trace_id: "trace-primary-1",
          primary_issue_id: "issue-primary-1",
        };
      },
    },
    issueStore: {
      async getIssueById() {
        return {
          issue_id: "issue-primary-1",
          title: "Checkout error reported",
          issue_family: "payment_failed_issue",
          severity: 2,
          status: "open",
          source: "zendesk",
          external_id_present: true,
          created_at: "2026-04-22T10:01:00.000Z",
          reporter_present: true,
          affected_variation_present: true,
          keywords_count: 2,
          body_present: true,
          body: "hidden",
          payload: { hidden: true },
        };
      },
    },
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/traces/trace-primary-1/primary-issue`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.deepEqual(body, {
      issue_id: "issue-primary-1",
      summary: "payment_failed_issue",
      issue_family: "payment_failed_issue",
      severity: 2,
      status: "open",
      source: "zendesk",
      external_id_present: true,
      created_at: "2026-04-22T10:01:00.000Z",
      reporter_present: true,
      affected_variation_present: true,
      keywords_count: 2,
      body_present: true,
    });
    assert.equal("title" in body, false);
    assert.equal(JSON.stringify(body).includes("Checkout error reported"), false);
  } finally {
    await close();
  }
});

test("GET /api/v1/traces/{trace_id}/primary-issue returns 404 for a missing trace", async () => {
  const { baseUrl, close } = await startServer({
    traceStore: {
      async getTraceById() {
        return null;
      },
    },
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/traces/missing-trace/primary-issue`);
    assert.equal(response.status, 404);

    const body = await response.json();
    assert.equal(body.error.code, "not_found");
    assert.equal(body.error.message, "trace not found");
  } finally {
    await close();
  }
});

test("GET /api/v1/traces/{trace_id}/primary-issue does not expose body, payload, or raw metadata", async () => {
  const { baseUrl, close } = await startServer({
    traceStore: {
      async getTraceById() {
        return {
          trace_id: "trace-primary-safe-1",
          primary_issue_id: "issue-primary-safe-1",
        };
      },
    },
    issueStore: {
      async getIssueById() {
        return {
          issue_id: "issue-primary-safe-1",
          title: "Checkout error reported",
          issue_family: "payment_failed_issue",
          severity: 2,
          status: "open",
          source: "zendesk",
          external_id_present: false,
          created_at: "2026-04-22T10:01:00.000Z",
          reporter_present: true,
          affected_variation_present: true,
          keywords_count: 1,
          body_present: true,
          body: "hidden",
          payload: { hidden: true },
          reporter: "hidden",
          created_by: "system",
          updated_by: "system",
        };
      },
    },
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/traces/trace-primary-safe-1/primary-issue`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.issue_id, "issue-primary-safe-1");
    assert.equal(body.summary, "payment_failed_issue");
    assert.equal(body.external_id_present, false);
    assert.equal(body.reporter_present, true);
    assert.equal(body.affected_variation_present, true);
    assert.equal(body.keywords_count, 1);
    assert.equal(body.body_present, true);
    assert.equal("body" in body, false);
    assert.equal("payload" in body, false);
    assert.equal("reporter" in body, false);
    assert.equal("title" in body, false);
    assert.equal("created_by" in body, false);
    assert.equal("updated_by" in body, false);
    assert.equal(JSON.stringify(body).includes("Checkout error reported"), false);
  } finally {
    await close();
  }
});

test("GET /api/v1/traces/{trace_id}/evidences keeps stable ordering", async () => {
  const traceStore = new InMemoryTraceStore();
  const { baseUrl, close } = await startServer({
    traceStore,
  });

  try {
    await postTrace(baseUrl, validPayload({
      evidences: [
        singleEvidence("event_spike", "event-2", "second evidence"),
        singleEvidence("timing", "event-1", "first evidence"),
      ],
    }));

    const listResponse = await fetch(`${baseUrl}/api/v1/traces`);
    const listBody = await listResponse.json();
    const traceId = listBody.items[0].trace_id;
    const storedTrace = traceStore.tracesById.get(traceId);
    storedTrace.evidences[0].created_at = "2026-04-22T10:00:00.000Z";
    storedTrace.evidences[1].created_at = "2026-04-22T10:00:00.000Z";
    storedTrace.evidences[0].evidence_id = "evidence-b";
    storedTrace.evidences[1].evidence_id = "evidence-a";

    const response = await fetch(`${baseUrl}/api/v1/traces/${traceId}/evidences`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.deepEqual(
      body.items.map((item) => item.summary),
      ["first evidence", "second evidence"],
    );
  } finally {
    await close();
  }
});

test("GET /api/v1/traces/{trace_id}/evidences returns 404 for a missing trace", async () => {
  const { baseUrl, close } = await startServer({
    traceStore: {
      async getTraceById() {
        return null;
      },
    },
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/traces/missing-trace/evidences`);
    assert.equal(response.status, 404);

    const body = await response.json();
    assert.equal(body.error.code, "not_found");
    assert.equal(body.error.message, "trace not found");
  } finally {
    await close();
  }
});

test("GET /api/v1/traces/{trace_id}/evidences does not expose payload or raw metadata", async () => {
  const { baseUrl, close } = await startServer({
    traceStore: {
      async getTraceById() {
        return { trace_id: "trace-safe-evd-1", evidence_count: 1 };
      },
      async listTraceEvidences() {
        return {
          items: [
            {
              evidence_id: "evidence-safe-1",
              trace_id: "trace-safe-evd-1",
              evidence_type: "timing",
              strength: "strong",
              summary: "safe summary",
              source_ref: "event-safe-1",
              payload: { secret: true },
              fingerprint: "secret",
              metadata: { internal: true },
            },
          ],
        };
      },
    },
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/traces/trace-safe-evd-1/evidences`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.items[0].payload, undefined);
    assert.equal(body.items[0].fingerprint, undefined);
    assert.equal(body.items[0].metadata, undefined);
  } finally {
    await close();
  }
});

async function startServer({
  traceStore = new InMemoryTraceStore(),
  issueStore = {},
} = {}) {
  const server = createServer({
    traceStore,
    issueStore,
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

function postTrace(baseUrl, payload) {
  return fetch(`${baseUrl}/api/v1/traces`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

function validPayload(overrides = {}) {
  return {
    change_id: "change-1",
    primary_issue_id: "issue-1",
    anomaly_type: "error_spike",
    anomaly_metric: "checkout.error_rate",
    anomaly_window_start: "2026-04-22T10:00:00.000Z",
    anomaly_window_end: "2026-04-22T10:05:00.000Z",
    evidences: [
      singleEvidence("timing", "event-1", "metric spike detected"),
      singleEvidence("event_spike", "event-2", "checkout failures increased"),
    ],
    ...overrides,
  };
}

function singleEvidence(evidenceType, sourceRef, summary) {
  return {
    evidence_type: evidenceType,
    source_ref: sourceRef,
    summary,
    strength: "strong",
    payload: {
      normalized_source_ref: sourceRef,
    },
  };
}
