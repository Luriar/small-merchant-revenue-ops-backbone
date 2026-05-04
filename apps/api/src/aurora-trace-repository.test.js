const test = require("node:test");
const assert = require("node:assert/strict");

const { AuroraTraceRepository } = require("./aurora-trace-repository");

test("AuroraTraceRepository creates a new trace and evidences", async () => {
  const repository = new AuroraTraceRepository({
    db: createMockDb([
      { match: "FROM trace", rows: [] },
      { match: "INSERT INTO trace", rows: [{ trace_id: "trace-new-1" }] },
      { match: "FROM evidence", rows: [] },
      { match: "INSERT INTO evidence", rows: [] },
      { match: "FROM evidence", rows: [] },
      { match: "INSERT INTO evidence", rows: [] },
      { match: "SELECT COUNT\\(\\*\\)::integer AS evidence_count", rows: [{ evidence_count: 2 }] },
    ]),
  });

  const result = await repository.createOrReuseTraceWithEvidence(validInput());

  assert.equal(result.trace_id, "trace-new-1");
  assert.equal(result.trace_created, true);
  assert.equal(result.trace_reused, false);
  assert.equal(result.evidence_count, 2);
  assert.equal(result.evidence_created_count, 2);
  assert.equal(result.evidence_skipped_count, 0);
});

test("AuroraTraceRepository reuses duplicate trace", async () => {
  const repository = new AuroraTraceRepository({
    db: createMockDb([
      { match: "FROM trace", rows: [{ trace_id: "trace-existing-1" }] },
      { match: "FROM evidence", rows: [] },
      { match: "INSERT INTO evidence", rows: [] },
      { match: "SELECT COUNT\\(\\*\\)::integer AS evidence_count", rows: [{ evidence_count: 3 }] },
    ]),
  });

  const result = await repository.createOrReuseTraceWithEvidence(validInput({
    evidences: [singleEvidence("timing", "event-3", "metric spike detected")],
  }));

  assert.equal(result.trace_id, "trace-existing-1");
  assert.equal(result.trace_created, false);
  assert.equal(result.trace_reused, true);
  assert.equal(result.evidence_created_count, 1);
});

test("AuroraTraceRepository skips duplicate evidence fingerprints", async () => {
  const repository = new AuroraTraceRepository({
    db: createMockDb([
      { match: "FROM trace", rows: [{ trace_id: "trace-existing-2" }] },
      { match: "FROM evidence", rows: [{ evidence_id: "evidence-existing-1" }] },
      { match: "SELECT COUNT\\(\\*\\)::integer AS evidence_count", rows: [{ evidence_count: 1 }] },
    ]),
  });

  const result = await repository.createOrReuseTraceWithEvidence(validInput({
    evidences: [singleEvidence("timing", "event-1", "metric spike detected")],
  }));

  assert.equal(result.trace_id, "trace-existing-2");
  assert.equal(result.trace_created, false);
  assert.equal(result.evidence_created_count, 0);
  assert.equal(result.evidence_skipped_count, 1);
  assert.equal(result.evidence_count, 1);
});

test("AuroraTraceRepository lists traces with filters and limit", async () => {
  let seenText = "";
  let seenValues = [];
  const repository = new AuroraTraceRepository({
    db: {
      async query(text, values) {
        seenText = text;
        seenValues = values;
        return {
          rows: [
            {
              trace_id: "trace-1",
              change_id: "change-1",
              primary_issue_id: "issue-1",
              status: "suspected",
              confidence: "strong",
              anomaly_type: "error",
              anomaly_metric: "checkout.error_rate",
              anomaly_window_start: "2026-04-22T10:00:00.000Z",
              anomaly_window_end: "2026-04-22T10:05:00.000Z",
              created_at: "2026-04-22T10:06:00.000Z",
              anomaly_detail: { hidden: true },
            },
          ],
        };
      },
    },
  });

  const result = await repository.listTraces({
    status: "suspected",
    changeId: "change-1",
    primaryIssueId: "issue-1",
    limit: 10,
  });

  assert.equal(result.items.length, 1);
  assert.match(seenText, /FROM trace/);
  assert.match(seenText, /WHERE status = \$1 AND change_id = \$2 AND primary_issue_id = \$3/);
  assert.match(seenText, /ORDER BY created_at DESC, trace_id ASC/);
  assert.match(seenText, /LIMIT \$4/);
  assert.doesNotMatch(seenText, /\banomaly_detail\b/);
  assert.deepEqual(seenValues, ["suspected", "change-1", "issue-1", 11]);
});

test("AuroraTraceRepository gets one trace by id with safe detail projection", async () => {
  let seenText = "";
  let seenValues = [];
  const repository = new AuroraTraceRepository({
    db: {
      async query(text, values) {
        seenText = text;
        seenValues = values;
        return {
          rows: [
            {
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
            },
          ],
        };
      },
    },
  });

  const result = await repository.getTraceById("trace-detail-1");

  assert.equal(result.trace_id, "trace-detail-1");
  assert.equal(result.evidence_count, 2);
  assert.match(seenText, /FROM trace/);
  assert.match(seenText, /WHERE trace_id = \$1/);
  assert.doesNotMatch(seenText, /\banomaly_detail\b/);
  assert.deepEqual(seenValues, ["trace-detail-1"]);
});

test("AuroraTraceRepository applies cursor predicate for next page", async () => {
  let seenText = "";
  let seenValues = [];
  const repository = new AuroraTraceRepository({
    db: {
      async query(text, values) {
        seenText = text;
        seenValues = values;
        return { rows: [] };
      },
    },
  });

  await repository.listTraces({
    status: null,
    changeId: null,
    primaryIssueId: null,
    limit: 2,
    cursor: {
      type: "trace_list_v1",
      created_at: "2026-04-22T11:01:00.000Z",
      trace_id: "trace-2",
    },
  });

  assert.match(seenText, /created_at < \$1::timestamptz OR \(created_at = \$1::timestamptz AND trace_id > \$2\)/);
  assert.deepEqual(seenValues, ["2026-04-22T11:01:00.000Z", "trace-2", 3]);
});

test("AuroraTraceRepository returns null when trace is missing", async () => {
  const repository = new AuroraTraceRepository({
    db: {
      async query() {
        return { rows: [] };
      },
    },
  });

  const result = await repository.getTraceById("missing-trace");
  assert.equal(result, null);
});

test("AuroraTraceRepository returns overview summary counts", async () => {
  let seenText = "";
  const repository = new AuroraTraceRepository({
    db: {
      async query(text) {
        seenText = text;
        return {
          rows: [
            {
              changes: 2,
              detected_anomaly_patterns: 3,
              linked_issues: 1,
              suspected_traces: 2,
              confirmed_traces: 1,
              dismissed_traces: 1,
              scope_from: "2026-04-22T10:00:00.000Z",
              scope_to: "2026-04-22T10:30:00.000Z",
              primary_metric: "checkout.error_rate",
              anomaly_detail: { hidden: true },
            },
          ],
        };
      },
    },
  });

  const result = await repository.getOverviewSummary();

  assert.deepEqual(result, {
    changes: 2,
    detected_anomaly_patterns: 3,
    linked_issues: 1,
    suspected_traces: 2,
    confirmed_traces: 1,
    dismissed_traces: 1,
    scope_from: "2026-04-22T10:00:00.000Z",
    scope_to: "2026-04-22T10:30:00.000Z",
    primary_metric: "checkout.error_rate",
    anomaly_detail: { hidden: true },
  });
  assert.match(seenText, /FROM trace/);
  assert.match(seenText, /COUNT\(DISTINCT change_id\)/);
  assert.match(seenText, /COUNT\(DISTINCT primary_issue_id\)/);
  assert.match(seenText, /COUNT\(\*\) FILTER \(WHERE status = 'suspected'\)/);
  assert.doesNotMatch(seenText, /\banomaly_detail\b/);
});

test("AuroraTraceRepository lists evidences with stable ordering and safe projection", async () => {
  let seenText = "";
  let seenValues = [];
  const repository = new AuroraTraceRepository({
    db: {
      async query(text, values) {
        seenText = text;
        seenValues = values;
        return {
          rows: [
            {
              evidence_id: "evidence-1",
              trace_id: "trace-1",
              evdt_cd: "EVDT001",
              evds_cd: "EVDS001",
              summary: "metric spike detected",
              source_ref: "event-1",
              created_at: "2026-04-22T10:00:00.000Z",
              payload: { hidden: true },
            },
          ],
        };
      },
    },
  });

  const result = await repository.listTraceEvidences("trace-1");

  assert.deepEqual(result.items, [
    {
      evidence_id: "evidence-1",
      trace_id: "trace-1",
      evidence_type: "timing",
      strength: "strong",
      summary: "metric spike detected",
      source_ref: "event-1",
    },
  ]);
  assert.match(seenText, /FROM evidence/);
  assert.match(seenText, /WHERE trace_id = \$1/);
  assert.match(seenText, /ORDER BY created_at ASC, evidence_id ASC/);
  assert.doesNotMatch(seenText, /\bpayload\b(?!->>)/);
  assert.deepEqual(seenValues, ["trace-1"]);
});

function createMockDb(expectations) {
  let index = 0;

  return {
    async withTransaction(work) {
      return work({
        query(text) {
          const next = expectations[index++];
          assert.ok(next, `unexpected query: ${text}`);
          assert.match(text, new RegExp(next.match));
          return Promise.resolve({ rows: next.rows });
        },
      });
    },
  };
}

function validInput(overrides = {}) {
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
