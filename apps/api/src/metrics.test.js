const test = require("node:test");
const assert = require("node:assert/strict");

const { createServer } = require("./server");
const { createNoopMetricsEmitter, resolveMetricRouteLabel, sanitizeMetricTags } = require("./metrics");

test("noop metrics emitter accepts counter histogram and gauge calls", () => {
  const emitter = createNoopMetricsEmitter();
  assert.doesNotThrow(() => {
    emitter.count("metric.count", 1, {});
    emitter.histogram("metric.histogram", 5, {});
    emitter.gauge("metric.gauge", 7, {});
  });
});

test("sanitizeMetricTags removes forbidden identifiers and raw fields", () => {
  assert.deepEqual(
    sanitizeMetricTags({
      method: "GET",
      path: "/api/v1/changes",
      request_id: "req-1",
      change_id: "change-1",
      payload: { hidden: true },
      title: "secret title",
      status_code: 200,
      has_more: false,
    }),
    {
      method: "GET",
      path: "/api/v1/changes",
      status_code: 200,
      has_more: false,
    },
  );
});

test("list retrieval emits metrics without raw identifiers", async () => {
  const calls = [];
  const { baseUrl, close } = await startServer({
    metrics: createTestMetrics(calls),
  });

  try {
    const response = await fetch(`${baseUrl}/api/v1/changes?limit=1`);
    assert.equal(response.status, 200);

    const metric = calls.find((call) => call.name === "change_list_retrieved_total");
    assert.ok(metric);
    assert.equal(metric.tags.limit_present, true);
    assert.equal(metric.tags.source, null);
    assert.equal("change_id" in metric.tags, false);
    assert.equal("request_id" in metric.tags, false);
  } finally {
    await close();
  }
});

test("issue status update route label hides raw issue id", () => {
  assert.equal(
    resolveMetricRouteLabel("PATCH", "/api/v1/issues/issue-secret-1/status"),
    "/api/v1/issues/{issue_id}/status",
  );
});

async function startServer(options = {}) {
  const server = createServer({
    env: {},
    changeStore: {
      async listChanges() {
        return {
          items: [
            {
              change_id: "change-1",
              change_type: "release",
              title: "Release 1",
              target_service: "payments",
              source: "deploy-system",
              occurred_at: "2026-04-22T10:00:00.000Z",
              created_at: "2026-04-22T10:01:00.000Z",
            },
          ],
        };
      },
      async getChangeById() {
        return null;
      },
      async createOrReplay() {
        throw new Error("unexpected createOrReplay call");
      },
      async listDashboardTimelineItems() {
        return { items: [] };
      },
    },
    eventStore: {},
    issueStore: {
      async listIssues() {
        return { items: [] };
      },
      async getIssueById() {
        return null;
      },
      async createOrReplay() {
        throw new Error("unexpected createOrReplay call");
      },
      async listDashboardTimelineItems() {
        return { items: [] };
      },
    },
    runStore: {
      async listRuns() {
        return { runs: [] };
      },
      async getRunById() {
        return null;
      },
      async listRunStateLog() {
        return { items: [] };
      },
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
      async listTraces() {
        return { items: [] };
      },
      async getTraceById() {
        return null;
      },
      async listTraceEvidences() {
        return { items: [] };
      },
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

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    baseUrl: `http://${address.address}:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
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
