const test = require("node:test");
const assert = require("node:assert/strict");

const { AuroraRunRepository } = require("./aurora-run-repository");

test("AuroraRunRepository accepts retry for retryable failed run", async () => {
  const repository = new AuroraRunRepository({
    db: createMockDb([
      {
        match: "FROM run\n      WHERE run_id = $1",
        rows: [{ run_id: "run-failed-1", run_type: "normalization", target_kind: "event", target_ref: "evt-1", status: "failed", attempt: 1 }],
      },
      { match: "input_ref->>'action' = 'retry'", rows: [] },
      { match: "input_ref->>'action' = 'retry'", rows: [] },
      { match: "INSERT INTO run (", rows: [{ run_id: "run-retry-new-1" }] },
    ]),
  });

  const result = await repository.requestRetry({
    originalRunId: "run-failed-1",
    idempotencyKey: "retry-key-1",
    reason: "retry_requested",
  });

  assert.equal(result.statusCode, 202);
  assert.equal(result.body.new_run_id, "run-retry-new-1");
  assert.equal(result.body.idempotent_replay, false);
});

test("AuroraRunRepository converges retry insert unique conflict to replay", async () => {
  const repository = new AuroraRunRepository({
    db: createMockDb([
      {
        match: "FROM run\n      WHERE run_id = $1",
        rows: [{ run_id: "run-failed-race-1", run_type: "normalization", target_kind: "event", target_ref: "evt-race-1", status: "failed", attempt: 1 }],
      },
      { match: "input_ref->>'action' = 'retry'", rows: [] },
      { match: "status IN ('pending', 'processing')", rows: [] },
      { match: "INSERT INTO run (", error: uniqueViolation("uq_run_retry_request") },
      { match: "input_ref->>'action' = 'retry'", rows: [{ run_id: "run-retry-race-1" }] },
    ]),
  });

  const result = await repository.requestRetry({
    originalRunId: "run-failed-race-1",
    idempotencyKey: "retry-key-race-1",
    reason: "retry_requested",
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.new_run_id, "run-retry-race-1");
  assert.equal(result.body.idempotent_replay, true);
});

test("AuroraRunRepository replays retry by original_run_id + idempotency_key", async () => {
  const repository = new AuroraRunRepository({
    db: createMockDb([
      {
        match: "FROM run\n      WHERE run_id = $1",
        rows: [{ run_id: "run-dlq-1", run_type: "normalization", target_kind: "event", target_ref: "evt-2", status: "dlq", attempt: 2 }],
      },
      { match: "input_ref->>'action' = 'retry'", rows: [{ run_id: "run-retry-existing-1" }] },
    ]),
  });

  const result = await repository.requestRetry({
    originalRunId: "run-dlq-1",
    idempotencyKey: "retry-key-2",
    reason: "retry_requested",
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.new_run_id, "run-retry-existing-1");
  assert.equal(result.body.idempotent_replay, true);
});

test("AuroraRunRepository blocks active retry duplicates", async () => {
  const repository = new AuroraRunRepository({
    db: createMockDb([
      {
        match: "FROM run\n      WHERE run_id = $1",
        rows: [{ run_id: "run-failed-2", run_type: "normalization", target_kind: "event", target_ref: "evt-3", status: "failed", attempt: 0 }],
      },
      { match: "input_ref->>'action' = 'retry'", rows: [] },
      { match: "status IN ('pending', 'processing')", rows: [{ run_id: "run-retry-active-1" }] },
    ]),
  });

  const result = await repository.requestRetry({
    originalRunId: "run-failed-2",
    idempotencyKey: "retry-key-3",
    reason: "retry_requested",
  });

  assert.equal(result.kind, "conflict");
  assert.equal(result.body.error.code, "active_retry_exists");
});

test("AuroraRunRepository accepts reprocess for new target", async () => {
  const repository = new AuroraRunRepository({
    db: createMockDb([
      { match: "run_type = 'reprocess'", rows: [] },
      { match: "status IN ('pending', 'processing')", rows: [] },
      { match: "INSERT INTO run (", rows: [{ run_id: "run-reprocess-new-1" }] },
    ]),
  });

  const result = await repository.requestReprocess({
    idempotencyKey: "reprocess-key-1",
    targetKind: "dlq_batch",
    targetRef: "dlq-2026-04-22",
    reason: "manual_reprocess",
  });

  assert.equal(result.statusCode, 202);
  assert.equal(result.body.new_run_id, "run-reprocess-new-1");
  assert.equal(result.body.idempotent_replay, false);
});

test("AuroraRunRepository converges reprocess insert unique conflict to active conflict", async () => {
  const repository = new AuroraRunRepository({
    db: createMockDb([
      { match: "run_type = 'reprocess'", rows: [] },
      { match: "status IN ('pending', 'processing')", rows: [] },
      { match: "INSERT INTO run (", error: uniqueViolation("uq_run_reprocess_request") },
      { match: "run_type = 'reprocess'", rows: [] },
      { match: "status IN ('pending', 'processing')", rows: [{ run_id: "run-reprocess-active-race-1" }] },
    ]),
  });

  const result = await repository.requestReprocess({
    idempotencyKey: "reprocess-key-race-1",
    targetKind: "dlq_batch",
    targetRef: "dlq-2026-04-22",
    reason: "manual_reprocess",
  });

  assert.equal(result.kind, "conflict");
  assert.equal(result.body.error.code, "active_reprocess_exists");
});

test("AuroraRunRepository replays reprocess by target + idempotency_key", async () => {
  const repository = new AuroraRunRepository({
    db: createMockDb([
      { match: "run_type = 'reprocess'", rows: [{ run_id: "run-reprocess-existing-1" }] },
    ]),
  });

  const result = await repository.requestReprocess({
    idempotencyKey: "reprocess-key-2",
    targetKind: "event_batch",
    targetRef: "events-2026-04-22",
    reason: "manual_reprocess",
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.new_run_id, "run-reprocess-existing-1");
  assert.equal(result.body.idempotent_replay, true);
});

test("AuroraRunRepository blocks active reprocess duplicates", async () => {
  const repository = new AuroraRunRepository({
    db: createMockDb([
      { match: "run_type = 'reprocess'", rows: [] },
      { match: "status IN ('pending', 'processing')", rows: [{ run_id: "run-reprocess-active-1" }] },
    ]),
  });

  const result = await repository.requestReprocess({
    idempotencyKey: "reprocess-key-3",
    targetKind: "dlq_batch",
    targetRef: "dlq-2026-04-22",
    reason: "manual_reprocess",
  });

  assert.equal(result.kind, "conflict");
  assert.equal(result.body.error.code, "active_reprocess_exists");
});

test("AuroraRunRepository lists runs with optional filters", async () => {
  let seenText = "";
  let seenValues = [];
  const repository = new AuroraRunRepository({
    db: {
      async query(text, values) {
        seenText = text;
        seenValues = values;
        return {
          rows: [
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
        };
      },
    },
  });

  const result = await repository.listRuns({ status: "failed", limit: 5 });

  assert.equal(result.runs.length, 1);
  assert.match(seenText, /WHERE status = \$1/);
  assert.match(seenText, /ORDER BY created_at DESC, run_id ASC/);
  assert.match(seenText, /LIMIT \$2/);
  assert.deepEqual(seenValues, ["failed", 6]);
});

test("AuroraRunRepository applies cursor predicate for next page", async () => {
  let seenText = "";
  let seenValues = [];
  const repository = new AuroraRunRepository({
    db: {
      async query(text, values) {
        seenText = text;
        seenValues = values;
        return { rows: [] };
      },
    },
  });

  await repository.listRuns({
    status: null,
    limit: 2,
    cursor: {
      type: "run_list_v1",
      created_at: "2026-04-22T10:01:00.000Z",
      run_id: "run-2",
    },
  });

  assert.match(seenText, /created_at < \$1::timestamptz OR \(created_at = \$1::timestamptz AND run_id > \$2\)/);
  assert.deepEqual(seenValues, ["2026-04-22T10:01:00.000Z", "run-2", 3]);
});

test("AuroraRunRepository gets one run by id with safe retry summary projection", async () => {
  let seenText = "";
  let seenValues = [];
  const repository = new AuroraRunRepository({
    db: {
      async query(text, values) {
        seenText = text;
        seenValues = values;
        return {
          rows: [
            {
              run_id: "run-retry-1",
              run_type: "normalization",
              target_kind: "event",
              target_ref: "evt-1",
              status: "pending",
              attempt: 2,
              created_at: "2026-04-22T10:02:00.000Z",
              retry_action: "retry",
              original_run_id: "run-failed-1",
            },
          ],
        };
      },
    },
  });

  const result = await repository.getRunById("run-retry-1");

  assert.equal(result.run_id, "run-retry-1");
  assert.equal(result.retry_action, "retry");
  assert.equal(result.original_run_id, "run-failed-1");
  assert.match(seenText, /CASE\s+WHEN input_ref->>'action' = 'retry'/);
  assert.doesNotMatch(seenText, /\binput_ref\b(?!->>)/);
  assert.deepEqual(seenValues, ["run-retry-1"]);
});

test("AuroraRunRepository returns null when run is missing", async () => {
  const repository = new AuroraRunRepository({
    db: {
      async query() {
        return { rows: [] };
      },
    },
  });

  const result = await repository.getRunById("missing-run");
  assert.equal(result, null);
});

test("AuroraRunRepository returns overview summary counts", async () => {
  let seenText = "";
  const repository = new AuroraRunRepository({
    db: {
      async query(text) {
        seenText = text;
        return {
          rows: [
            {
              total_runs: 5,
              pending_runs: 1,
              processing_runs: 1,
              failed_runs: 1,
              dlq_runs: 1,
              input_ref: { hidden: true },
            },
          ],
        };
      },
    },
  });

  const result = await repository.getOverviewSummary();

  assert.deepEqual(result, {
    total_runs: 5,
    pending_runs: 1,
    processing_runs: 1,
    failed_runs: 1,
    dlq_runs: 1,
    input_ref: { hidden: true },
  });
  assert.match(seenText, /FROM run/);
  assert.match(seenText, /COUNT\(\*\) FILTER \(WHERE status = 'pending'\)/);
  assert.doesNotMatch(seenText, /\binput_ref\b/);
});

test("AuroraRunRepository lists safe failure groups without raw input_ref", async () => {
  let seenText = "";
  const repository = new AuroraRunRepository({
    db: {
      async query(text) {
        seenText = text;
        return {
          rows: [
            {
              error_class: "normalization_timeout",
              count: 2,
              latest_occurred_at: "2026-04-22T10:05:00.000Z",
              representative_run_type: "normalization",
              retryable: true,
            },
          ],
        };
      },
    },
  });

  const result = await repository.listRunFailures();

  assert.deepEqual(result.groups, [
    {
      error_class: "normalization_timeout",
      count: 2,
      latest_occurred_at: "2026-04-22T10:05:00.000Z",
      representative_run_type: "normalization",
      retryable: true,
    },
  ]);
  assert.match(seenText, /FROM run/);
  assert.match(seenText, /WHERE status IN \('failed', 'dlq'\)/);
  assert.match(seenText, /COALESCE\(NULLIF\(error_class, ''\), 'unknown'\)/);
  assert.doesNotMatch(seenText, /\binput_ref\b/);
  assert.doesNotMatch(seenText, /\berror_detail\b/);
});

test("AuroraRunRepository lists run state log with stable ascending order", async () => {
  let seenText = "";
  let seenValues = [];
  const repository = new AuroraRunRepository({
    db: {
      async query(text, values) {
        seenText = text;
        seenValues = values;
        return {
          rows: [
            {
              state_log_id: 1,
              run_id: "run-log-1",
              from_status: null,
              to_status: "pending",
              changed_at: "2026-04-22T10:00:00.000Z",
              metadata: { hidden: true },
            },
          ],
        };
      },
    },
  });

  const result = await repository.listRunStateLog("run-log-1");

  assert.deepEqual(result.items, [
    {
      state_log_id: 1,
      run_id: "run-log-1",
      from_status: null,
      to_status: "pending",
      changed_at: "2026-04-22T10:00:00.000Z",
      metadata: { hidden: true },
    },
  ]);
  assert.match(seenText, /FROM run_state_log/);
  assert.match(seenText, /ORDER BY occurred_at ASC, log_id ASC/);
  assert.doesNotMatch(seenText, /\bmetadata\b/);
  assert.deepEqual(seenValues, ["run-log-1"]);
});

function createMockDb(expectations) {
  let index = 0;

  return {
    async withTransaction(work) {
      return work({
        query(text, values) {
          const next = expectations[index++];
          assert.ok(next, `unexpected query: ${text}`);
          assert.match(text, new RegExp(escapeRegExp(next.match)));
          if (next.error) {
            return Promise.reject(next.error);
          }
          return Promise.resolve({ rows: next.rows, values });
        },
      });
    },
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function uniqueViolation(constraint) {
  const error = new Error("duplicate key");
  error.code = "23505";
  error.constraint = constraint;
  return error;
}
