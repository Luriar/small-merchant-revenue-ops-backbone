const test = require("node:test");
const assert = require("node:assert/strict");

const { createServer } = require("./server");
const { TRACE_ID, handleReadPathSkeleton } = require("./read-path-skeleton");
const { createReadPathStaticRepository } = require("./read-path-static-repository");

const CHANGE_ID = "change-release-4872";
const ISSUE_ID = "issue-inc-4872";
const INCIDENT_DISPLAY_ID = "INC-4872";
const RUN_ID = "run-normalization-4872";

test("read-path skeleton returns the OpenAPI-shaped dashboard overview", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/dashboard/overview`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.deepEqual(Object.keys(body), ["scope", "kpis", "chart_context"]);
    assert.equal(body.scope.service, "checkout-service");
    assert.equal(body.kpis.suspected_traces, 1);
    assert.equal(body.chart_context.metric, "checkout.error_rate");
  } finally {
    await close();
  }
});

test("read-path skeleton returns timeline series and markers", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/dashboard/timeline`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.metric, "checkout.error_rate");
    assert.ok(Array.isArray(body.series));
    assert.ok(Array.isArray(body.change_markers));
    assert.ok(Array.isArray(body.anomaly_markers));
  } finally {
    await close();
  }
});

test("read-path skeleton returns trace list and detail shapes", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const listResponse = await fetch(`${baseUrl}/api/v1/traces`);
    assert.equal(listResponse.status, 200);

    const listBody = await listResponse.json();
    assert.equal(listBody.items[0].trace_id, TRACE_ID);
    assert.equal(listBody.items[0].status, "suspected");
    assert.equal(listBody.items[0].anomaly_summary.includes("383%"), true);
    assert.equal(listBody.items[0].evidence_count, 4);
    assert.equal(listBody.next_cursor, null);

    const detailResponse = await fetch(`${baseUrl}/api/v1/traces/${TRACE_ID}`);
    assert.equal(detailResponse.status, 200);

    const detailBody = await detailResponse.json();
    assert.equal(detailBody.trace_id, TRACE_ID);
    assert.equal(detailBody.status, "suspected");
    assert.equal(detailBody.change.type, "release");
    assert.ok(detailBody.anomaly.detail);
    assert.equal(typeof detailBody.anomaly.detail, "object");
    assert.equal(Array.isArray(detailBody.anomaly.detail), false);
    assert.equal(detailBody.anomaly.detail.actual_value, 0.087);
    assert.equal(detailBody.anomaly.detail.delta_pct, 383);
    assert.equal(detailBody.anomaly.detail.affected_users, 23100);
    assert.notEqual(detailBody.anomaly.window_start, detailBody.change.occurred_at);
    assert.notEqual(detailBody.anomaly.window_start, detailBody.anomaly.window_end);
    assert.equal(detailBody.counts.evidence_count, 4);
  } finally {
    await close();
  }
});

test("read-path skeleton returns trace evidence and primary issue shapes", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const evidencesResponse = await fetch(`${baseUrl}/api/v1/traces/${TRACE_ID}/evidences`);
    assert.equal(evidencesResponse.status, 200);

    const evidencesBody = await evidencesResponse.json();
    assert.equal(evidencesBody.items.length, 4);
    assert.equal(evidencesBody.items[0].type, "timing");
    assert.equal(evidencesBody.items[0].summary.includes("nine minutes"), true);
    assert.equal(evidencesBody.items[2].payload.delta_pct, 383);
    assert.equal(evidencesBody.items[3].type, "rule_match");
    assert.equal(evidencesBody.items[3].summary.includes("linked incident family"), true);

    const issueResponse = await fetch(`${baseUrl}/api/v1/traces/${TRACE_ID}/primary-issue`);
    assert.equal(issueResponse.status, 200);

    const issueBody = await issueResponse.json();
    assert.equal(issueBody.issue_id, ISSUE_ID);
    assert.equal(issueBody.external_id, INCIDENT_DISPLAY_ID);
    assert.equal(issueBody.summary.includes(INCIDENT_DISPLAY_ID), true);
    assert.equal(issueBody.issue_family, "checkout_error");
    assert.equal(issueBody.status, "open");

    const issueDetailResponse = await fetch(`${baseUrl}/api/v1/issues/${issueBody.issue_id}`);
    assert.equal(issueDetailResponse.status, 200);
    const issueDetailBody = await issueDetailResponse.json();
    assert.equal(issueDetailBody.issue_id, ISSUE_ID);
    assert.equal(issueDetailBody.external_id, INCIDENT_DISPLAY_ID);

    const issueTracesResponse = await fetch(`${baseUrl}/api/v1/issues/${issueBody.issue_id}/traces`);
    assert.equal(issueTracesResponse.status, 200);
    const issueTracesBody = await issueTracesResponse.json();
    assert.equal(issueTracesBody.items[0].trace_id, TRACE_ID);
  } finally {
    await close();
  }
});

test("read-path skeleton returns changes, run overview, run failures, and issues", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const changesResponse = await fetch(`${baseUrl}/api/v1/changes`);
    assert.equal(changesResponse.status, 200);
    const changesBody = await changesResponse.json();
    assert.equal(changesBody.summary.release_count, 1);
    assert.equal(changesBody.next_cursor, null);

    const runOverviewResponse = await fetch(`${baseUrl}/api/v1/runs/overview`);
    assert.equal(runOverviewResponse.status, 200);
    const runOverviewBody = await runOverviewResponse.json();
    assert.equal(runOverviewBody.kpis.dlq, 1);

    const failuresResponse = await fetch(`${baseUrl}/api/v1/runs/failures`);
    assert.equal(failuresResponse.status, 200);
    const failuresBody = await failuresResponse.json();
    assert.ok(Array.isArray(failuresBody.groups));

    const issuesResponse = await fetch(`${baseUrl}/api/v1/issues`);
    assert.equal(issuesResponse.status, 200);
    const issuesBody = await issuesResponse.json();
    assert.equal(issuesBody.items[0].linked_trace_count, 1);
  } finally {
    await close();
  }
});

test("read-path skeleton returns change detail and linked traces", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const detailResponse = await fetch(`${baseUrl}/api/v1/changes/${CHANGE_ID}`);
    assert.equal(detailResponse.status, 200);

    const detailBody = await detailResponse.json();
    assert.equal(detailBody.change_id, CHANGE_ID);
    assert.equal(detailBody.type, "release");
    assert.equal(detailBody.target_service, "checkout-service");

    const tracesResponse = await fetch(`${baseUrl}/api/v1/changes/${CHANGE_ID}/traces`);
    assert.equal(tracesResponse.status, 200);

    const tracesBody = await tracesResponse.json();
    assert.equal(tracesBody.items[0].trace_id, TRACE_ID);
    assert.equal(tracesBody.items[0].change.change_id, CHANGE_ID);
    assert.equal(tracesBody.next_cursor, null);
  } finally {
    await close();
  }
});

test("read-path skeleton returns run list detail and state log", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const listResponse = await fetch(`${baseUrl}/api/v1/runs`);
    assert.equal(listResponse.status, 200);

    const listBody = await listResponse.json();
    assert.equal(listBody.items[0].run_id, RUN_ID);
    assert.equal(listBody.next_cursor, null);

    const detailResponse = await fetch(`${baseUrl}/api/v1/runs/${RUN_ID}`);
    assert.equal(detailResponse.status, 200);

    const detailBody = await detailResponse.json();
    assert.equal(detailBody.run_id, RUN_ID);
    assert.equal(detailBody.status, "failed");
    assert.equal(detailBody.error_class, "normalization_timeout");

    const stateLogResponse = await fetch(`${baseUrl}/api/v1/runs/${RUN_ID}/state-log`);
    assert.equal(stateLogResponse.status, 200);

    const stateLogBody = await stateLogResponse.json();
    assert.equal(stateLogBody.items.length, 2);
    assert.equal(stateLogBody.items[0].from_status, null);
    assert.equal(stateLogBody.items[1].to_status, "failed");
  } finally {
    await close();
  }
});

test("read-path skeleton returns issue detail and linked traces", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const detailResponse = await fetch(`${baseUrl}/api/v1/issues/${ISSUE_ID}`);
    assert.equal(detailResponse.status, 200);

    const detailBody = await detailResponse.json();
    assert.equal(detailBody.issue_id, ISSUE_ID);
    assert.equal(detailBody.issue_family, "checkout_error");
    assert.equal(detailBody.status, "open");

    const tracesResponse = await fetch(`${baseUrl}/api/v1/issues/${ISSUE_ID}/traces`);
    assert.equal(tracesResponse.status, 200);

    const tracesBody = await tracesResponse.json();
    assert.equal(tracesBody.items[0].trace_id, TRACE_ID);
    assert.equal(tracesBody.next_cursor, null);
  } finally {
    await close();
  }
});

test("read-path skeleton returns wrapped 404 for missing change run and issue IDs", async () => {
  const { baseUrl, close } = await startServer();

  try {
    await assertWrappedNotFound(`${baseUrl}/api/v1/changes/missing-change`, "change not found");
    await assertWrappedNotFound(`${baseUrl}/api/v1/runs/missing-run`, "run not found");
    await assertWrappedNotFound(`${baseUrl}/api/v1/issues/missing-issue`, "issue not found");
  } finally {
    await close();
  }
});

test("read-path skeleton returns 404 for a missing trace", async () => {
  const { baseUrl, close } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/traces/missing-trace`);
    assert.equal(response.status, 404);

    const body = await response.json();
    assert.deepEqual(body, {
      error: {
        code: "not_found",
        message: "trace not found",
      },
    });
  } finally {
    await close();
  }
});

test("read-path skeleton returns wrapped 404 for defensive route fallback", () => {
  const response = createMockResponse();

  handleReadPathSkeleton({
    request: {
      method: "GET",
      url: "/api/v1/read-path-skeleton-unknown",
    },
    response,
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, {
    error: {
      code: "not_found",
      message: "route not found",
    },
  });
});

test("static read repository returns null for missing trace-scoped reads", () => {
  const repository = createReadPathStaticRepository();

  assert.equal(repository.getTraceDetail("missing-trace"), null);
  assert.equal(repository.listTraceEvidences("missing-trace"), null);
  assert.equal(repository.getTracePrimaryIssue("missing-trace"), null);
  assert.equal(repository.getChangeDetail("missing-change"), null);
  assert.equal(repository.listChangeTraces("missing-change"), null);
  assert.equal(repository.getRunDetail("missing-run"), null);
  assert.equal(repository.listRunStateLog("missing-run"), null);
  assert.equal(repository.getIssueDetail("missing-issue"), null);
  assert.equal(repository.listIssueTraces("missing-issue"), null);
});

async function assertWrappedNotFound(url, message) {
  const response = await fetch(url);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: {
      code: "not_found",
      message,
    },
  });
}

function createMockResponse() {
  return {
    statusCode: null,
    headers: null,
    body: null,
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body) {
      this.body = JSON.parse(body);
    },
  };
}

async function startServer() {
  const server = createServer({ readPathSkeleton: true });
  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
