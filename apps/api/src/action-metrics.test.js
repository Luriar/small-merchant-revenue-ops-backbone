const test = require("node:test");
const assert = require("node:assert/strict");

const { createServer } = require("./server");
const { FORBIDDEN_TAG_KEYS, METRIC_NAMES } = require("./metrics");
const { InMemoryChangeStore } = require("./change-store");
const { InMemoryEventStore } = require("./event-store");
const { InMemoryIssueStore } = require("./issue-store");
const { InMemoryRunStore } = require("./run-store");
const { InMemoryTraceStore } = require("./trace-store");

test("change intake emits created and replay metrics with safe tags", async () => {
  const metricCalls = [];
  const { baseUrl, close } = await startServer({
    metrics: createTestMetrics(metricCalls),
    changeStore: new InMemoryChangeStore(),
  });

  try {
    const payload = {
      idempotency_key: "change-metric-1",
      change_type: "release",
      title: "Release 2026.04.22",
      target_service: "payments",
      source: "deploy-system",
      occurred_at: "2026-04-22T10:00:00.000Z",
    };

    const created = await postJson(`${baseUrl}/api/v1/changes`, payload);
    assert.equal(created.status, 201);
    const replay = await postJson(`${baseUrl}/api/v1/changes`, payload);
    assert.equal(replay.status, 200);

    const intakeMetrics = metricCalls.filter((call) => call.name === METRIC_NAMES.CHANGE_INTAKE_TOTAL);
    assert.equal(intakeMetrics.length, 2);
    assert.deepEqual(intakeMetrics.map((call) => call.tags.outcome), ["created", "replay"]);
    assert.equal(intakeMetrics[0].tags.source, "deploy-system");
    assert.equal(intakeMetrics[0].tags.change_type, "release");
    assert.equal(intakeMetrics[0].tags.target_service, "payments");
    assertSafeTags(intakeMetrics);
  } finally {
    await close();
  }
});

test("issue intake emits replay metric with safe tags", async () => {
  const metricCalls = [];
  const { baseUrl, close } = await startServer({
    metrics: createTestMetrics(metricCalls),
    issueStore: new InMemoryIssueStore(),
  });

  try {
    const payload = {
      idempotency_key: "issue-metric-1",
      external_id: "zendesk-123",
      source: "zendesk",
      title: "Checkout issue",
      issue_family: "payment_failed_issue",
      severity: 2,
      occurred_at: "2026-04-22T10:00:00.000Z",
    };

    const created = await postJson(`${baseUrl}/api/v1/issues/intake`, payload);
    assert.equal(created.status, 201);
    const replay = await postJson(`${baseUrl}/api/v1/issues/intake`, payload);
    assert.equal(replay.status, 200);

    const intakeMetrics = metricCalls.filter((call) => call.name === METRIC_NAMES.ISSUE_INTAKE_TOTAL);
    assert.equal(intakeMetrics.length, 2);
    assert.deepEqual(intakeMetrics.map((call) => call.tags.outcome), ["created", "replay"]);
    assert.equal(intakeMetrics[0].tags.issue_family, "payment_failed_issue");
    assert.equal(intakeMetrics[0].tags.external_id_present, true);
    assertSafeTags(intakeMetrics);
  } finally {
    await close();
  }
});

test("issue status update emits updated conflict and validation_failed metrics with safe tags", async () => {
  const metricCalls = [];
  const { baseUrl, close } = await startServer({
    metrics: createTestMetrics(metricCalls),
    issueStore: new InMemoryIssueStore(),
  });

  try {
    const payload = {
      idempotency_key: "issue-status-metric-1",
      external_id: "zendesk-status-metric-1",
      source: "zendesk",
      title: "Checkout issue",
      issue_family: "payment_failed_issue",
      severity: 2,
      occurred_at: "2026-04-22T10:00:00.000Z",
    };
    const created = await postJson(`${baseUrl}/api/v1/issues/intake`, payload);
    assert.equal(created.status, 201);
    const createdBody = await created.json();

    assert.equal((await patchJson(`${baseUrl}/api/v1/issues/${createdBody.issue_id}/status`, {
      status: "investigating",
      expected_version: 1,
    })).status, 200);
    assert.equal((await patchJson(`${baseUrl}/api/v1/issues/${createdBody.issue_id}/status`, {
      status: "resolved",
      expected_version: 1,
    })).status, 409);
    assert.equal((await patchJson(`${baseUrl}/api/v1/issues/${createdBody.issue_id}/status`, {
      status: "resolved",
    })).status, 400);

    const statusMetrics = metricCalls.filter((call) => call.name === METRIC_NAMES.ISSUE_STATUS_UPDATE_TOTAL);
    assert.deepEqual(statusMetrics.map((call) => call.tags.outcome), ["updated", "conflict", "validation_failed"]);
    assert.equal(statusMetrics[1].tags.error_code, "version_conflict");
    assertSafeTags(statusMetrics);
  } finally {
    await close();
  }
});

test("trace create emits created reused and validation_failed metrics with safe tags", async () => {
  const metricCalls = [];
  const { baseUrl, close } = await startServer({
    metrics: createTestMetrics(metricCalls),
    traceStore: new InMemoryTraceStore(),
  });

  try {
    const validPayload = {
      change_id: "change-secret-1",
      primary_issue_id: "issue-secret-1",
      anomaly_type: "latency",
      anomaly_metric: "p95_ms",
      anomaly_window_start: "2026-04-22T10:00:00.000Z",
      anomaly_window_end: "2026-04-22T10:05:00.000Z",
      evidences: [
        {
          evidence_type: "metric_snapshot",
          source_ref: "dash://metric/1",
          summary: "latency spike",
        },
      ],
    };

    const invalidPayload = {
      change_id: "change-secret-1",
      primary_issue_id: "issue-secret-1",
      anomaly_type: "latency",
      anomaly_metric: "p95_ms",
      anomaly_window_start: "2026-04-22T10:00:00.000Z",
      anomaly_window_end: "2026-04-22T10:05:00.000Z",
      evidences: [],
    };

    const created = await postJson(`${baseUrl}/api/v1/traces`, validPayload);
    assert.equal(created.status, 201);
    const reused = await postJson(`${baseUrl}/api/v1/traces`, validPayload);
    assert.equal(reused.status, 200);
    const invalid = await postJson(`${baseUrl}/api/v1/traces`, invalidPayload);
    assert.equal(invalid.status, 400);

    const traceMetrics = metricCalls.filter((call) => call.name === METRIC_NAMES.TRACE_CREATE_TOTAL);
    assert.deepEqual(traceMetrics.map((call) => call.tags.outcome), ["created", "reused", "validation_failed"]);
    assert.equal(traceMetrics[2].tags.change_id_present, true);
    assert.equal(traceMetrics[2].tags.primary_issue_id_present, true);
    assert.equal("change_id" in traceMetrics[2].tags, false);
    assertSafeTags(traceMetrics);

    const evidenceHistograms = metricCalls.filter((call) => call.name === METRIC_NAMES.TRACE_CREATE_EVIDENCE_COUNT);
    assert.equal(evidenceHistograms.length, 2);
    assert.deepEqual(evidenceHistograms.map((call) => call.value), [1, 1]);
    assert.deepEqual(evidenceHistograms.map((call) => call.tags.outcome), ["created", "reused"]);
    assertSafeTags(evidenceHistograms);
  } finally {
    await close();
  }
});

test("event intake emits created replay and validation_failed metrics with safe tags", async () => {
  const metricCalls = [];
  const { baseUrl, close } = await startServer({
    metrics: createTestMetrics(metricCalls),
    eventStore: new InMemoryEventStore(),
  });

  try {
    const payload = {
      event_id: "evt-metric-1",
      occurred_at: "2026-04-22T10:00:00.000Z",
      target_service: "payments",
      event_type: "product",
      event_subtype: "checkout_failed",
      retry_count: 1,
      is_error: true,
      user_id: "usr_12345",
      session_id: "sess_12345",
      request_id: "req_12345",
      payload: {
        metric: "checkout.error_rate",
      },
      source: "app-metrics",
    };

    assert.equal((await postJson(`${baseUrl}/api/v1/events/intake`, payload)).status, 202);
    assert.equal((await postJson(`${baseUrl}/api/v1/events/intake`, payload)).status, 200);
    assert.equal((await postJson(`${baseUrl}/api/v1/events/intake`, {
      ...payload,
      event_id: "evt-metric-2",
      event_type: "invalid",
    })).status, 400);

    const eventMetrics = metricCalls.filter((call) => call.name === METRIC_NAMES.EVENT_INTAKE_TOTAL);
    assert.deepEqual(eventMetrics.map((call) => call.tags.outcome), ["created", "replay", "validation_failed"]);
    assert.equal(eventMetrics[0].tags.source, "app-metrics");
    assert.equal(eventMetrics[0].tags.target_service, "payments");
    assert.equal(eventMetrics[0].tags.event_type, "product");
    assert.equal(eventMetrics[0].tags.is_error, true);
    assert.equal("event_id" in eventMetrics[0].tags, false);
    assertSafeTags(eventMetrics);
  } finally {
    await close();
  }
});

test("retry and reprocess emit created replay conflict and validation_failed metrics with safe tags", async () => {
  const metricCalls = [];
  const { baseUrl, close } = await startServer({
    metrics: createTestMetrics(metricCalls),
    runStore: new InMemoryRunStore({
      seedRuns: [
        { run_id: "run-failed-1", status: "failed", attempt: 0 },
        {
          run_id: "reprocess-active-1",
          run_type: "reprocess",
          status: "processing",
          attempt: 0,
          target_kind: "dlq_batch",
          target_ref: "dlq-secret-1",
          idempotency_key: "reprocess-key-existing",
        },
      ],
    }),
  });

  try {
    const retryPayload = {
      idempotency_key: "retry-metric-1",
      reason: "retry_requested",
    };
    assert.equal((await postJson(`${baseUrl}/api/v1/runs/run-failed-1/retry`, retryPayload)).status, 202);
    assert.equal((await postJson(`${baseUrl}/api/v1/runs/run-failed-1/retry`, retryPayload)).status, 200);
    assert.equal((await postJson(`${baseUrl}/api/v1/runs/run-failed-1/retry`, {
      idempotency_key: "",
      reason: "retry_requested",
    })).status, 400);

    assert.equal((await postJson(`${baseUrl}/api/v1/reprocess`, {
      idempotency_key: "reprocess-key-1",
      target_kind: "dlq_batch",
      target_ref: "dlq-secret-2",
      reason: "manual_reprocess",
    })).status, 202);
    assert.equal((await postJson(`${baseUrl}/api/v1/reprocess`, {
      idempotency_key: "reprocess-key-existing-2",
      target_kind: "dlq_batch",
      target_ref: "dlq-secret-1",
      reason: "manual_reprocess",
    })).status, 409);
    assert.equal((await postJson(`${baseUrl}/api/v1/reprocess`, {
      idempotency_key: "reprocess-key-invalid",
      target_kind: "",
      target_ref: "dlq-secret-3",
      reason: "manual_reprocess",
    })).status, 400);

    const retryMetrics = metricCalls.filter((call) => call.name === METRIC_NAMES.RETRY_RUN_TOTAL);
    assert.deepEqual(retryMetrics.map((call) => call.tags.outcome), ["created", "replay", "validation_failed"]);
    assertSafeTags(retryMetrics);

    const reprocessMetrics = metricCalls.filter((call) => call.name === METRIC_NAMES.REPROCESS_RUN_TOTAL);
    assert.deepEqual(reprocessMetrics.map((call) => call.tags.outcome), ["created", "conflict", "validation_failed"]);
    assert.equal(reprocessMetrics[0].tags.target_kind, "dlq_batch");
    assert.equal(reprocessMetrics[1].tags.error_code, "active_reprocess_exists");
    assert.equal("target_ref" in reprocessMetrics[0].tags, false);
    assertSafeTags(reprocessMetrics);
  } finally {
    await close();
  }
});

async function startServer(options = {}) {
  const server = createServer({
    env: {},
    changeStore: new InMemoryChangeStore(),
    eventStore: new InMemoryEventStore(),
    issueStore: new InMemoryIssueStore(),
    runStore: new InMemoryRunStore(),
    traceStore: new InMemoryTraceStore(),
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

function assertSafeTags(metricCalls) {
  for (const call of metricCalls) {
    assert.equal("request_id" in call.tags, false);
    for (const key of Object.keys(call.tags)) {
      assert.equal(FORBIDDEN_TAG_KEYS.has(key), false);
    }
    const serialized = JSON.stringify(call.tags);
    assert.equal(serialized.includes("secret"), false);
  }
}

function postJson(url, body) {
  return fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function patchJson(url, body) {
  return fetch(url, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
