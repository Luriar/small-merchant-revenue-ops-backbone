const test = require("node:test");
const assert = require("node:assert/strict");

const { createServer } = require("./server");

test("POST /api/v1/issues/intake returns 201 for a new issue", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const response = await postIssue(baseUrl, validPayload());
    assert.equal(response.status, 201);

    const body = await response.json();
    assert.equal(body.created, true);
    assert.equal(body.idempotent_replay, false);
    assert.ok(body.issue_id);
  } finally {
    await close();
  }
});

test("POST /api/v1/issues/intake returns 200 replay by source + external_id", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const created = await postIssue(baseUrl, validPayload({
      external_id: "zendesk-100",
      idempotency_key: "issue-key-1",
    }));
    const createdBody = await created.json();

    const replay = await postIssue(baseUrl, validPayload({
      external_id: "zendesk-100",
      idempotency_key: "issue-key-2",
    }));
    assert.equal(replay.status, 200);

    const replayBody = await replay.json();
    assert.equal(replayBody.created, false);
    assert.equal(replayBody.idempotent_replay, true);
    assert.equal(replayBody.issue_id, createdBody.issue_id);
  } finally {
    await close();
  }
});

test("POST /api/v1/issues/intake returns 200 replay by idempotency_key fallback", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const created = await postIssue(baseUrl, validPayload({
      idempotency_key: "issue-key-3",
      external_id: null,
    }));
    const createdBody = await created.json();

    const replay = await postIssue(baseUrl, validPayload({
      idempotency_key: "issue-key-3",
      external_id: null,
    }));
    assert.equal(replay.status, 200);

    const replayBody = await replay.json();
    assert.equal(replayBody.created, false);
    assert.equal(replayBody.idempotent_replay, true);
    assert.equal(replayBody.issue_id, createdBody.issue_id);
  } finally {
    await close();
  }
});

test("POST /api/v1/issues/intake returns 400 for severity out of range", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const response = await postIssue(baseUrl, validPayload({
      severity: 6,
    }));
    assert.equal(response.status, 400);

    const body = await response.json();
    assert.ok(body.error.details.includes("severity must be an integer between 1 and 5"));
  } finally {
    await close();
  }
});

test("POST /api/v1/issues/intake returns 400 for an unknown top-level field", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const response = await postIssue(baseUrl, {
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

test("POST /api/v1/issues/intake returns 400 when title is missing", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const payload = validPayload();
    delete payload.title;

    const response = await postIssue(baseUrl, payload);
    assert.equal(response.status, 400);

    const body = await response.json();
    assert.ok(body.error.details.includes("title is required"));
  } finally {
    await close();
  }
});

async function startServer() {
  return startServerWithOptions();
}

test("GET /api/v1/issues returns the default issue list", async () => {
  const { baseUrl, close } = await startServer();

  try {
    await postIssue(baseUrl, validPayload({
      idempotency_key: "issue-list-1",
      external_id: "zendesk-201",
      title: "Older issue",
      issue_family: "payment_failed_issue",
      severity: 2,
      occurred_at: "2026-04-22T10:00:00.000Z",
    }));

    await postIssue(baseUrl, validPayload({
      idempotency_key: "issue-list-2",
      external_id: null,
      title: "Newer issue",
      issue_family: "checkout_bug_issue",
      severity: 4,
      source: "intercom",
      occurred_at: "2026-04-22T11:00:00.000Z",
    }));

    const response = await fetch(`${baseUrl}/api/v1/issues`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.items.length, 2);
    assert.deepEqual(body.page, {
      limit: null,
      has_more: false,
      next_cursor: null,
    });
    assert.deepEqual(body.items.map((item) => ({
      summary: item.summary,
      issue_family: item.issue_family,
      severity: item.severity,
      status: item.status,
      source: item.source,
      external_id_present: item.external_id_present,
    })), [
      {
        summary: "checkout_bug_issue",
        issue_family: "checkout_bug_issue",
        severity: 4,
        status: "open",
        source: "intercom",
        external_id_present: false,
      },
      {
        summary: "payment_failed_issue",
        issue_family: "payment_failed_issue",
        severity: 2,
        status: "open",
        source: "zendesk",
        external_id_present: true,
      },
    ]);
    assert.equal(typeof body.items[0].issue_id, "string");
    assert.equal(typeof body.items[0].created_at, "string");
    assert.equal(typeof body.items[1].issue_id, "string");
    assert.equal(typeof body.items[1].created_at, "string");
    assert.equal("title" in body.items[0], false);
    assert.equal("title" in body.items[1], false);
    assert.equal(JSON.stringify(body).includes("Newer issue"), false);
    assert.equal(JSON.stringify(body).includes("Older issue"), false);
  } finally {
    await close();
  }
});

test("GET /api/v1/issues applies the issue_family filter", async () => {
  let seenIssueFamily = null;
  const { baseUrl, close } = await startServerWithOptions({
    issueStore: {
      async listIssues({ issueFamily }) {
        seenIssueFamily = issueFamily;
        return { items: [] };
      },
      async createOrReplay() {
        throw new Error("unexpected createOrReplay call");
      },
    },
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/issues?issue_family=payment_failed_issue`);
    assert.equal(response.status, 200);
    assert.equal(seenIssueFamily, "payment_failed_issue");
  } finally {
    await close();
  }
});

test("GET /api/v1/issues applies the severity filter", async () => {
  let seenSeverity = null;
  const { baseUrl, close } = await startServerWithOptions({
    issueStore: {
      async listIssues({ severity }) {
        seenSeverity = severity;
        return { items: [] };
      },
      async createOrReplay() {
        throw new Error("unexpected createOrReplay call");
      },
    },
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/issues?severity=2`);
    assert.equal(response.status, 200);
    assert.equal(seenSeverity, 2);
  } finally {
    await close();
  }
});

test("GET /api/v1/issues applies the status filter", async () => {
  let seenStatus = null;
  const { baseUrl, close } = await startServerWithOptions({
    issueStore: {
      async listIssues({ status }) {
        seenStatus = status;
        return { items: [] };
      },
      async createOrReplay() {
        throw new Error("unexpected createOrReplay call");
      },
    },
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/issues?status=investigating`);
    assert.equal(response.status, 200);
    assert.equal(seenStatus, "investigating");
  } finally {
    await close();
  }
});

test("GET /api/v1/issues applies the limit query param", async () => {
  let seenLimit = null;
  const { baseUrl, close } = await startServerWithOptions({
    issueStore: {
      async listIssues({ limit }) {
        seenLimit = limit;
        return { items: [] };
      },
      async createOrReplay() {
        throw new Error("unexpected createOrReplay call");
      },
    },
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/issues?limit=5`);
    assert.equal(response.status, 200);
    assert.equal(seenLimit, 5);
  } finally {
    await close();
  }
});

test("GET /api/v1/issues returns page metadata with has_more", async () => {
  const { baseUrl, close } = await startServerWithOptions({
    issueStore: {
      async listIssues() {
        return {
          items: [
            {
              issue_id: "issue-3",
              title: "Third issue",
              issue_family: "rule_bug_issue",
              severity: 4,
              status: "open",
              source: "zendesk",
              external_id_present: true,
              created_at: "2026-04-22T12:01:00.000Z",
            },
            {
              issue_id: "issue-2",
              title: "Second issue",
              issue_family: "checkout_bug_issue",
              severity: 3,
              status: "investigating",
              source: "intercom",
              external_id_present: false,
              created_at: "2026-04-22T11:01:00.000Z",
            },
            {
              issue_id: "issue-1",
              title: "First issue",
              issue_family: "payment_failed_issue",
              severity: 2,
              status: "open",
              source: "zendesk",
              external_id_present: true,
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
    const response = await fetch(`${baseUrl}/api/v1/issues?limit=2`);
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

test("GET /api/v1/issues returns next_cursor and fetches the next page", async () => {
  const { baseUrl, close } = await startServer();

  try {
    await postIssue(baseUrl, validPayload({
      idempotency_key: "issue-cursor-1",
      external_id: "zendesk-401",
      title: "First issue",
      issue_family: "payment_failed_issue",
      severity: 2,
      occurred_at: "2026-04-22T10:00:00.000Z",
    }));
    await postIssue(baseUrl, validPayload({
      idempotency_key: "issue-cursor-2",
      external_id: "zendesk-402",
      title: "Second issue",
      issue_family: "checkout_bug_issue",
      severity: 3,
      occurred_at: "2026-04-22T11:00:00.000Z",
    }));
    await postIssue(baseUrl, validPayload({
      idempotency_key: "issue-cursor-3",
      external_id: "zendesk-403",
      title: "Third issue",
      issue_family: "rule_bug_issue",
      severity: 4,
      occurred_at: "2026-04-22T12:00:00.000Z",
    }));

    const firstResponse = await fetch(`${baseUrl}/api/v1/issues?limit=2`);
    assert.equal(firstResponse.status, 200);
    const firstBody = await firstResponse.json();
    assert.equal(firstBody.items.length, 2);
    assert.equal(firstBody.page.has_more, true);
    assert.equal(typeof firstBody.page.next_cursor, "string");

    const secondResponse = await fetch(`${baseUrl}/api/v1/issues?limit=2&cursor=${encodeURIComponent(firstBody.page.next_cursor)}`);
    assert.equal(secondResponse.status, 200);
    const secondBody = await secondResponse.json();
    assert.deepEqual(secondBody.items.map((item) => item.summary), ["payment_failed_issue"]);
    assert.equal(JSON.stringify(secondBody).includes("First issue"), false);
    assert.deepEqual(secondBody.page, {
      limit: 2,
      has_more: false,
      next_cursor: null,
    });
  } finally {
    await close();
  }
});

test("GET /api/v1/issues returns 400 for an invalid cursor", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/issues?cursor=not-a-valid-cursor`);
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.code, "bad_request");
    assert.ok(body.error.details.includes("cursor is invalid"));
  } finally {
    await close();
  }
});

test("GET /api/v1/issues/{issue_id} returns 200 for an existing issue", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const createResponse = await postIssue(baseUrl, validPayload({
      idempotency_key: "issue-detail-1",
      external_id: "zendesk-301",
      title: "Issue detail target",
      issue_family: "payment_failed_issue",
      severity: 2,
      body: "Customer reports checkout failure",
      keywords: ["checkout", "payment", "incident"],
      affected_variation: "web",
      reporter: "reporter@example.invalid",
    }));
    const created = await createResponse.json();

    const response = await fetch(`${baseUrl}/api/v1/issues/${created.issue_id}`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.deepEqual({
      issue_id: body.issue_id,
      summary: body.summary,
      issue_family: body.issue_family,
      severity: body.severity,
      status: body.status,
      source: body.source,
      external_id_present: body.external_id_present,
      reporter_present: body.reporter_present,
      affected_variation_present: body.affected_variation_present,
      keywords_count: body.keywords_count,
      body_present: body.body_present,
    }, {
      issue_id: created.issue_id,
      summary: "payment_failed_issue",
      issue_family: "payment_failed_issue",
      severity: 2,
      status: "open",
      source: "zendesk",
      external_id_present: true,
      reporter_present: true,
      affected_variation_present: true,
      keywords_count: 3,
      body_present: true,
    });
    assert.equal(typeof body.created_at, "string");
    assert.equal("title" in body, false);
    assert.equal(JSON.stringify(body).includes("Issue detail target"), false);
  } finally {
    await close();
  }
});

test("GET /api/v1/issues/{issue_id}/traces returns traces linked by primary_issue_id", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const createResponse = await postIssue(baseUrl, validPayload({
      idempotency_key: "issue-traces-1",
      external_id: "zendesk-issue-traces-1",
      title: "Issue trace target",
      issue_family: "checkout_error",
      severity: 2,
    }));
    const created = await createResponse.json();

    const traceResponse = await postTrace(baseUrl, {
      change_id: "change-issue-traces-1",
      primary_issue_id: created.issue_id,
      anomaly_type: "error",
      anomaly_metric: "checkout.error_rate",
      anomaly_window_start: "2026-04-22T12:31:00.000Z",
      anomaly_window_end: "2026-04-22T12:36:00.000Z",
      evidences: [
        {
          evidence_type: "rule_match",
          source_ref: "event-issue-traces-1",
          summary: "issue family matched checkout error trace",
          strength: "medium",
        },
      ],
    });
    const trace = await traceResponse.json();

    const response = await fetch(`${baseUrl}/api/v1/issues/${created.issue_id}/traces`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].trace_id, trace.trace_id);
    assert.equal(body.items[0].change_id, "change-issue-traces-1");
    assert.equal(body.items[0].primary_issue_id, created.issue_id);
    assert.equal(body.items[0].status, "suspected");
    assert.equal(body.items[0].confidence, "medium");
    assert.equal(body.items[0].anomaly_type, "error");
    assert.deepEqual(body.page, {
      limit: null,
      has_more: false,
      next_cursor: null,
    });
    assert.equal("items" in body, true);
    assert.equal("issue_id" in body, false);
  } finally {
    await close();
  }
});

test("GET /api/v1/issues/{issue_id}/traces returns wrapped 404 for a missing issue", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/issues/missing-issue/traces`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: {
        code: "not_found",
        message: "issue not found",
      },
    });
  } finally {
    await close();
  }
});

test("GET /api/v1/issues/{issue_id} returns 404 for a missing issue", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/issues/missing-issue`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: {
        code: "not_found",
        message: "issue not found",
      },
    });
  } finally {
    await close();
  }
});

test("GET /api/v1/issues/{issue_id} does not expose body, payload, or raw internal metadata", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const createResponse = await postIssue(baseUrl, validPayload({
      idempotency_key: "issue-detail-safe-1",
      external_id: null,
      title: "Safe detail target",
      body: "Sensitive body text",
      payload: {
        customer_email: "hidden@example.invalid",
      },
      reporter: "reporter@example.invalid",
      keywords: ["checkout"],
      affected_variation: "app",
    }));
    const created = await createResponse.json();

    const response = await fetch(`${baseUrl}/api/v1/issues/${created.issue_id}`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.issue_id, created.issue_id);
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
    assert.equal("keywords" in body, false);
    assert.equal("affected_variation" in body, false);
    assert.equal("created_by" in body, false);
    assert.equal("updated_by" in body, false);
    assert.equal(JSON.stringify(body).includes("Safe detail target"), false);
  } finally {
    await close();
  }
});

test("PATCH /api/v1/issues/{issue_id}/status updates open -> investigating and increments version", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const created = await postIssue(baseUrl, validPayload({
      idempotency_key: "issue-status-1",
      external_id: "zendesk-status-1",
    }));
    const createdBody = await created.json();

    const response = await patchIssueStatus(baseUrl, createdBody.issue_id, {
      status: "investigating",
      expected_version: 1,
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.issue_id, createdBody.issue_id);
    assert.equal(body.previous_status, "open");
    assert.equal(body.current_status, "investigating");
    assert.equal(body.previous_version, 1);
    assert.equal(body.current_version, 2);
  } finally {
    await close();
  }
});

test("PATCH /api/v1/issues/{issue_id}/status investigating -> resolved is accepted", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const created = await postIssue(baseUrl, validPayload({
      idempotency_key: "issue-status-2",
      external_id: "zendesk-status-2",
    }));
    const createdBody = await created.json();

    const firstResponse = await patchIssueStatus(baseUrl, createdBody.issue_id, {
      status: "investigating",
      expected_version: 1,
    });
    assert.equal(firstResponse.status, 200);
    const firstBody = await firstResponse.json();
    assert.equal(firstBody.current_version, 2);

    const secondResponse = await patchIssueStatus(baseUrl, createdBody.issue_id, {
      status: "resolved",
      expected_version: 2,
    });
    assert.equal(secondResponse.status, 200);
    const secondBody = await secondResponse.json();
    assert.equal(secondBody.previous_status, "investigating");
    assert.equal(secondBody.current_status, "resolved");
    assert.equal(secondBody.previous_version, 2);
    assert.equal(secondBody.current_version, 3);
  } finally {
    await close();
  }
});

test("PATCH /api/v1/issues/{issue_id}/status returns 409 on expected_version mismatch", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const created = await postIssue(baseUrl, validPayload({
      idempotency_key: "issue-status-conflict-1",
      external_id: "zendesk-conflict-1",
    }));
    const createdBody = await created.json();

    const response = await patchIssueStatus(baseUrl, createdBody.issue_id, {
      status: "investigating",
      expected_version: 99,
    });

    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.error.code, "version_conflict");
    assert.match(body.error.message, /expected_version/);
  } finally {
    await close();
  }
});

test("PATCH /api/v1/issues/{issue_id}/status returns 400 when expected_version is missing", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const response = await patchIssueStatus(baseUrl, "issue-x", {
      status: "investigating",
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.code, "bad_request");
    assert.ok(body.error.details.includes("expected_version is required"));
  } finally {
    await close();
  }
});

test("PATCH /api/v1/issues/{issue_id}/status returns 400 when expected_version is not a positive integer", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const responseZero = await patchIssueStatus(baseUrl, "issue-x", {
      status: "investigating",
      expected_version: 0,
    });
    assert.equal(responseZero.status, 400);
    const zeroBody = await responseZero.json();
    assert.ok(zeroBody.error.details.includes("expected_version must be a positive integer"));

    const responseFloat = await patchIssueStatus(baseUrl, "issue-x", {
      status: "investigating",
      expected_version: 1.5,
    });
    assert.equal(responseFloat.status, 400);
    const floatBody = await responseFloat.json();
    assert.ok(floatBody.error.details.includes("expected_version must be a positive integer"));
  } finally {
    await close();
  }
});

test("PATCH /api/v1/issues/{issue_id}/status returns 400 for an invalid status value", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const response = await patchIssueStatus(baseUrl, "issue-x", {
      status: "approved",
      expected_version: 1,
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.ok(body.error.details.includes("status must be one of: open, investigating, resolved, ignored"));
  } finally {
    await close();
  }
});

test("PATCH /api/v1/issues/{issue_id}/status returns 400 for an unknown top-level field", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const response = await patchIssueStatus(baseUrl, "issue-x", {
      status: "investigating",
      expected_version: 1,
      reason: "should-be-rejected",
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.ok(body.error.details.includes("unknown field: reason"));
  } finally {
    await close();
  }
});

test("PATCH /api/v1/issues/{issue_id}/status returns 404 for a missing issue", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const response = await patchIssueStatus(baseUrl, "missing-issue", {
      status: "investigating",
      expected_version: 1,
    });

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: {
        code: "not_found",
        message: "issue not found",
      },
    });
  } finally {
    await close();
  }
});

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

function postIssue(baseUrl, payload) {
  return fetch(`${baseUrl}/api/v1/issues/intake`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

function patchIssueStatus(baseUrl, issueId, payload) {
  return fetch(`${baseUrl}/api/v1/issues/${encodeURIComponent(issueId)}/status`, {
    method: "PATCH",
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

function validPayload(overrides = {}) {
  return {
    idempotency_key: "issue-key-default",
    external_id: "zendesk-1",
    source: "zendesk",
    title: "Checkout error reported",
    body: "Customer reports checkout failure on web flow",
    issue_family: "payment_failed_issue",
    severity: 2,
    keywords: ["checkout", "payment"],
    affected_variation: "web",
    payload: {
      channel: "support",
    },
    reporter: "reporter@example.invalid",
    occurred_at: new Date().toISOString(),
    ...overrides,
  };
}
