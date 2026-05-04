const test = require("node:test");
const assert = require("node:assert/strict");

const { createServer } = require("./server");
const { InMemoryChangeStore } = require("./change-store");
const { InMemoryIssueStore } = require("./issue-store");
const { InMemoryRunStore } = require("./run-store");
const { InMemoryTraceStore } = require("./trace-store");

test("GET /api/v1/dashboard/overview returns OpenAPI-shaped overview data", async () => {
  const { baseUrl, close } = await startServer({
    runStore: new InMemoryRunStore({
      seedRuns: [
        { run_id: "run-1", status: "pending" },
        { run_id: "run-2", status: "processing" },
        { run_id: "run-3", status: "failed" },
        { run_id: "run-4", status: "dlq" },
        { run_id: "run-5", status: "completed" },
      ],
    }),
    traceStore: createTraceStoreWithSeed([
      {
        trace_id: "trace-1",
        change_id: "change-1",
        primary_issue_id: "issue-1",
        status: "suspected",
        anomaly_metric: "checkout.error_rate",
        anomaly_window_start: "2026-04-22T10:00:00.000Z",
        anomaly_window_end: "2026-04-22T10:05:00.000Z",
      },
      {
        trace_id: "trace-2",
        change_id: "change-2",
        primary_issue_id: "issue-1",
        status: "confirmed",
        anomaly_metric: "checkout.error_rate",
        anomaly_window_start: "2026-04-22T10:10:00.000Z",
        anomaly_window_end: "2026-04-22T10:15:00.000Z",
      },
      {
        trace_id: "trace-3",
        change_id: "change-1",
        primary_issue_id: "issue-2",
        status: "dismissed",
        anomaly_metric: "checkout.error_rate",
        anomaly_window_start: "2026-04-22T10:20:00.000Z",
        anomaly_window_end: "2026-04-22T10:25:00.000Z",
      },
      {
        trace_id: "trace-4",
        status: "suspected",
        anomaly_metric: "checkout.error_rate",
        anomaly_window_start: "2026-04-22T10:30:00.000Z",
        anomaly_window_end: "2026-04-22T10:35:00.000Z",
      },
    ]),
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/dashboard/overview`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.deepEqual(body, {
      scope: {
        from: "2026-04-22T10:00:00.000Z",
        to: "2026-04-22T10:35:00.000Z",
      },
      kpis: {
        changes: 2,
        detected_anomaly_patterns: 4,
        linked_issues: 2,
        suspected_traces: 2,
      },
      chart_context: {
        metric: "checkout.error_rate",
      },
    });
  } finally {
    await close();
  }
});

test("GET /api/v1/dashboard/overview returns zero values for empty stores", async () => {
  const { baseUrl, close } = await startServer({
    runStore: new InMemoryRunStore(),
    traceStore: new InMemoryTraceStore(),
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/dashboard/overview`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.deepEqual(body, {
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

test("GET /api/v1/dashboard/overview does not expose raw internal metadata", async () => {
  const { baseUrl, close } = await startServer({
    runStore: {
      async getOverviewSummary() {
        return {
          total_runs: 1,
          pending_runs: 0,
          processing_runs: 0,
          failed_runs: 1,
          dlq_runs: 0,
          input_ref: { hidden: true },
        };
      },
    },
    traceStore: {
      async getOverviewSummary() {
        return {
          suspected_traces: 1,
          confirmed_traces: 0,
          dismissed_traces: 0,
          anomaly_detail: { hidden: true },
          payload: { hidden: true },
          fingerprint: "secret",
        };
      },
    },
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/dashboard/overview`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.input_ref, undefined);
    assert.equal(body.error_detail, undefined);
    assert.equal(body.kpis.input_ref, undefined);
    assert.equal(body.kpis.anomaly_detail, undefined);
    assert.equal(body.kpis.payload, undefined);
    assert.equal(body.kpis.reporter, undefined);
    assert.equal(body.kpis.body, undefined);
    assert.equal(body.kpis.fingerprint, undefined);
  } finally {
    await close();
  }
});

test("GET /api/v1/dashboard/timeline returns OpenAPI-shaped chart timeline data", async () => {
  const { baseUrl, close } = await startServer({
    changeStore: createChangeStoreWithSeed([
      {
        idempotency_key: "change-key-1",
        change_type: "release",
        title: "Release 2026.04.22",
        target_service: "payments",
        source: "deploy-system",
        occurred_at: "2026-04-22T10:00:00.000Z",
      },
    ]),
    issueStore: createIssueStoreWithSeed([
      {
        idempotency_key: "issue-key-1",
        source: "zendesk",
        title: "Checkout error reported should not appear in dashboard timeline",
        issue_family: "payment_failed_issue",
        severity: 2,
        occurred_at: "2026-04-22T11:00:00.000Z",
      },
    ]),
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/dashboard/timeline?metric=checkout.error_rate`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.deepEqual(body, {
      metric: "checkout.error_rate",
      series: [],
      change_markers: [
        {
          change_id: body.change_markers[0].change_id,
          title: "Release 2026.04.22",
          occurred_at: "2026-04-22T10:00:00.000Z",
        },
      ],
      anomaly_markers: [],
    });
    assert.deepEqual(Object.keys(body.change_markers[0]), ["change_id", "title", "occurred_at"]);
    assert.equal(body.items, undefined);
    assert.equal(body.page, undefined);
  } finally {
    await close();
  }
});

test("GET /api/v1/dashboard/timeline filters change markers by service and time range", async () => {
  const { baseUrl, close } = await startServer({
    changeStore: createChangeStoreWithSeed([
      {
        idempotency_key: "change-key-1",
        change_type: "release",
        title: "Payments release",
        target_service: "payments",
        source: "deploy-system",
        occurred_at: "2026-04-22T10:00:00.000Z",
      },
      {
        idempotency_key: "change-key-2",
        change_type: "flag",
        title: "Checkout flag rollout",
        target_service: "checkout",
        source: "flag-service",
        occurred_at: "2026-04-22T11:00:00.000Z",
      },
      {
        idempotency_key: "change-key-3",
        change_type: "rule",
        title: "Late checkout rule",
        target_service: "checkout",
        source: "rules",
        occurred_at: "2026-04-22T12:00:00.000Z",
      },
    ]),
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/dashboard/timeline?metric=checkout.error_rate&service=checkout&from=2026-04-22T10%3A30%3A00.000Z&to=2026-04-22T11%3A30%3A00.000Z&granularity=5m`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.deepEqual(body.change_markers.map((marker) => marker.title), [
      "Checkout flag rollout",
    ]);
    assert.deepEqual(body.series, []);
    assert.deepEqual(body.anomaly_markers, []);
  } finally {
    await close();
  }
});

test("GET /api/v1/dashboard/timeline does not read issue rows or expose raw fields", async () => {
  const { baseUrl, close } = await startServer({
    changeStore: createChangeStoreWithSeed([
      {
        idempotency_key: "change-key-1",
        change_type: "release",
        title: "Release 2026.04.22",
        target_service: "payments",
        source: "deploy-system",
        occurred_at: "2026-04-22T10:00:00.000Z",
      },
    ]),
    issueStore: {
      async listDashboardTimelineItems() {
        throw new Error("dashboard timeline must not read issue timeline items");
      },
      async listIssues() {
        throw new Error("dashboard timeline must not read issues");
      },
      async getIssueById() {
        throw new Error("dashboard timeline must not read issue detail");
      },
      async createOrReplay() {
        throw new Error("unexpected createOrReplay call");
      },
    },
    runStore: {
      async getOverviewSummary() {
        return {
          input_ref: { hidden: true },
        };
      },
      async listRuns() {
        throw new Error("dashboard timeline must not read runs");
      },
      async getRunById() {
        throw new Error("dashboard timeline must not read run detail");
      },
      async listRunStateLog() {
        throw new Error("dashboard timeline must not read run state log");
      },
    },
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/dashboard/timeline?metric=checkout.error_rate`);
    assert.equal(response.status, 200);

    const body = await response.json();
    const serialized = JSON.stringify(body);
    assert.equal(serialized.includes("body"), false);
    assert.equal(serialized.includes("payload"), false);
    assert.equal(serialized.includes("reporter"), false);
    assert.equal(serialized.includes("input_ref"), false);
    assert.equal(serialized.includes("Checkout error reported"), false);
    assert.equal(body.items, undefined);
    assert.equal(body.page, undefined);
  } finally {
    await close();
  }
});

test("GET /api/v1/dashboard/timeline returns wrapped 400 when metric is missing", async () => {
  const { baseUrl, close } = await startServer({
    changeStore: createChangeStoreWithSeed([]),
    issueStore: createIssueStoreWithSeed([]),
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/dashboard/timeline`);
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.code, "bad_request");
    assert.equal(body.error.message, "validation failed");
    assert.ok(body.error.details.includes("metric is required"));
  } finally {
    await close();
  }
});

async function startServer({ changeStore, issueStore, runStore, traceStore }) {
  const server = createServer({ changeStore, issueStore, runStore, traceStore });

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

function createTraceStoreWithSeed(traces) {
  const store = new InMemoryTraceStore();

  for (const trace of traces) {
    store.tracesById.set(trace.trace_id, {
      trace_id: trace.trace_id,
      change_id: trace.change_id ?? null,
      primary_issue_id: trace.primary_issue_id ?? null,
      status: trace.status,
      confidence: trace.confidence ?? "weak",
      anomaly_type: trace.anomaly_type ?? "error",
      anomaly_metric: trace.anomaly_metric ?? "metric",
      anomaly_window_start: trace.anomaly_window_start ?? "2026-04-22T10:00:00.000Z",
      anomaly_window_end: trace.anomaly_window_end ?? "2026-04-22T10:05:00.000Z",
      created_at: trace.created_at ?? "2026-04-22T10:06:00.000Z",
      evidences: [],
      evidenceFingerprints: new Set(),
    });
  }

  return store;
}

function createChangeStoreWithSeed(changes) {
  const store = new InMemoryChangeStore();

  for (const change of changes) {
    store.createOrReplay(change);
  }

  return store;
}

function createIssueStoreWithSeed(issues) {
  const store = new InMemoryIssueStore();

  for (const issue of issues) {
    store.createOrReplay(issue);
  }

  return store;
}
