const test = require("node:test");
const assert = require("node:assert/strict");

const {
  AuroraCdcRecoveryRepository,
  CdcRecoveryPersistenceError,
} = require("./cdc-recovery-aurora-repository");
const {
  FORBIDDEN_RESPONSE_FIELDS,
  containsForbiddenKeys,
} = require("./cdc-recovery-dto-mapper");
const {
  enforceIdempotency,
  enforceStateTransition,
} = require("./cdc-recovery-service");

test("AuroraCdcRecoveryRepository lists safe failure projections with parameterized filters", async () => {
  const unsafeKey = FORBIDDEN_RESPONSE_FIELDS[0];
  const db = createMockDb([
    {
      match: "FROM public.cdc_failure",
      rows: [{ ...failureRow(), [unsafeKey]: "removed" }],
    },
  ]);
  const repository = new AuroraCdcRecoveryRepository({ db });

  const result = await repository.listFailures({ status: "open", owner: "ops-maintainer" }, { limit: 5 });

  assert.equal(result.length, 1);
  assert.equal(result[0][unsafeKey], undefined);
  assert.equal(containsForbiddenKeys(result), false);
  assert.match(db.calls[0].text, /status = \$1/);
  assert.match(db.calls[0].text, /owner = \$2/);
  assert.match(db.calls[0].text, /LIMIT \$3/);
  assert.deepEqual(db.calls[0].values, ["open", "ops-maintainer", 6]);
});

test("AuroraCdcRecoveryRepository returns found and not found safe detail results", async () => {
  const repository = new AuroraCdcRecoveryRepository({
    db: createMockDb([
      { match: "WHERE failure_id = $1", rows: [failureRow()] },
      { match: "WHERE failure_id = $1", rows: [] },
    ]),
  });

  const found = await repository.getFailureById("cdc_fail_1");
  const missing = await repository.getFailureById("cdc_fail_missing");

  assert.equal(found.failure_id, "cdc_fail_1");
  assert.equal(missing, null);
  assert.equal(containsForbiddenKeys(found), false);
});

test("AuroraCdcRecoveryRepository supports idempotent duplicate and conflict decisions", async () => {
  const repository = new AuroraCdcRecoveryRepository({
    db: createMockDb([
      { match: "WHERE idempotency_key = $1", rows: [replayRow()] },
      { match: "WHERE idempotency_key = $1", rows: [replayRow()] },
    ]),
  });

  const duplicateExisting = await repository.findReplayRequestByIdempotencyKey("idem-existing");
  const duplicate = enforceIdempotency({
    existingRequest: duplicateExisting,
    input: replayIntent(),
  });

  const conflictExisting = await repository.findReplayRequestByIdempotencyKey("idem-existing");
  const conflict = enforceIdempotency({
    existingRequest: conflictExisting,
    input: { ...replayIntent(), target_table: "trace_shadow" },
  });

  assert.equal(duplicate.kind, "duplicate");
  assert.equal(duplicate.statusCode, 200);
  assert.equal(conflict.kind, "conflict");
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.error.code, "idempotency_conflict");
});

test("AuroraCdcRecoveryRepository creates replay request inside injected transaction", async () => {
  const db = createMockDb(
    [{ match: "INSERT INTO public.cdc_replay_request", rows: [replayRow({ replay_request_id: "cdc_replay_req_created" })] }],
    { withTransaction: true },
  );
  const repository = new AuroraCdcRecoveryRepository({ db });

  const result = await repository.createReplayRequest({
    ...replayIntent(),
    replay_request_id: "cdc_replay_req_created",
    failure_id: "cdc_fail_1",
  });

  assert.equal(result.replay_request_id, "cdc_replay_req_created");
  assert.equal(db.transactionCount, 1);
  assert.match(db.calls[0].text, /VALUES \(\$1, \$2, \$3/);
  assert.equal(db.calls[0].values[0], "cdc_replay_req_created");
});

test("AuroraCdcRecoveryRepository appends state log without update or delete statements", async () => {
  const db = createMockDb(
    [{ match: "INSERT INTO public.cdc_failure_state_log", rows: [stateLogRow()] }],
    { withTransaction: true },
  );
  const repository = new AuroraCdcRecoveryRepository({ db });

  const result = await repository.appendFailureStateLog({
    failure_id: "cdc_fail_1",
    replay_request_id: "cdc_replay_req_existing",
    from_status: "open",
    to_status: "replay_requested",
    reason_code: "safe_replay_requested",
    owner: "ops-maintainer",
    safe_metadata: { action_label: "create_replay_request" },
    evidence_report_ref: "ops/evidence/repository-test.md",
  });

  assert.equal(result.state_log_id, "cdc_state_log_1");
  assert.equal(db.transactionCount, 1);
  assert.doesNotMatch(db.calls[0].text, /\bUPDATE\b/i);
  assert.doesNotMatch(db.calls[0].text, /\bDELETE\b/i);
});

test("AuroraCdcRecoveryRepository handles valid and invalid state transitions safely", async () => {
  const approve = enforceStateTransition("requested", "approve");
  const invalid = enforceStateTransition("succeeded", "approve");
  const repository = new AuroraCdcRecoveryRepository({
    db: createMockDb([
      { match: "UPDATE public.cdc_replay_request", rows: [replayRow({ status: "approved" })] },
      { match: "UPDATE public.cdc_replay_request", rows: [] },
    ]),
  });

  const updated = await repository.updateReplayRequestStatus("cdc_replay_req_existing", {
    from_status: "requested",
    to_status: approve.to_status,
  });
  const blocked = await repository.updateReplayRequestStatus("cdc_replay_req_existing", {
    from_status: "succeeded",
    to_status: "approved",
  });

  assert.equal(approve.ok, true);
  assert.equal(invalid.ok, false);
  assert.equal(updated.status, "approved");
  assert.equal(blocked, null);
});

test("AuroraCdcRecoveryRepository preserves original failure and original run identity on status update", async () => {
  const db = createMockDb([
    { match: "UPDATE public.cdc_failure", rows: [failureRow({ status: "replay_requested" })] },
  ]);
  const repository = new AuroraCdcRecoveryRepository({ db });

  const result = await repository.updateFailureStatus("cdc_fail_1", {
    from_status: "open",
    to_status: "replay_requested",
    replay_request_id: "cdc_replay_req_existing",
  });

  assert.equal(result.source_run_id, "run_source_1");
  assert.doesNotMatch(db.calls[0].text, /source_run_id\s*=/i);
  assert.match(db.calls[0].text, /latest_replay_request_id = COALESCE/);
});

test("AuroraCdcRecoveryRepository links new run only for future worker eligible statuses", async () => {
  const db = createMockDb([
    { match: "status IN ('approved', 'running')", rows: [replayRow({ new_run_id: "run_new_1" })] },
  ]);
  const repository = new AuroraCdcRecoveryRepository({ db });

  const result = await repository.linkNewRunId("cdc_replay_req_existing", "run_new_1");

  assert.equal(result.new_run_id, "run_new_1");
  assert.match(db.calls[0].text, /status IN \('approved', 'running'\)/);
  assert.deepEqual(db.calls[0].values, ["run_new_1", "cdc_replay_req_existing"]);
});

test("AuroraCdcRecoveryRepository redacts persistence failures", async () => {
  const repository = new AuroraCdcRecoveryRepository({
    db: createMockDb([{ match: "FROM public.cdc_failure", failure: new Error("unsafe persistence detail") }]),
  });

  await assert.rejects(
    () => repository.listFailures(),
    (error) => {
      assert.equal(error instanceof CdcRecoveryPersistenceError, true);
      assert.equal(error.message, "persistence operation failed");
      assert.equal(error.code, "internal_error");
      assert.equal(String(error).includes("unsafe persistence detail"), false);
      return true;
    },
  );
});

test("AuroraCdcRecoveryRepository requires an injected DB client and creates no real client", () => {
  assert.throws(
    () => new AuroraCdcRecoveryRepository(),
    /injected db client/,
  );
});

function createMockDb(responses, { withTransaction = false } = {}) {
  const pending = [...responses];
  const db = {
    calls: [],
    transactionCount: 0,
    async query(text, values = []) {
      const next = pending.shift();
      db.calls.push({ text, values });
      assert.ok(next, `unexpected statement: ${compact(text)}`);
      assert.match(text, new RegExp(escapeRegExp(next.match)));
      if (next.failure) {
        throw next.failure;
      }
      return { rows: next.rows ?? [] };
    },
  };
  if (withTransaction) {
    db.withTransaction = async (work) => {
      db.transactionCount += 1;
      return work(db);
    };
  }
  return db;
}

function failureRow(overrides = {}) {
  return {
    failure_id: "cdc_fail_1",
    failure_type: "source_write_failure",
    source_topic: "cdc.safe.trace",
    source_table: "trace",
    primary_key: { trace_id: "tr_safe_1" },
    op: "u",
    ts_ms: 1710000000000,
    observed_field_names: ["trace_id", "run_id", "status"],
    missing_required_fields: ["evidence_ref"],
    unexpected_fields: [],
    forbidden_field_names_detected: [],
    parser_error_class: "SafeParserError",
    parser_error_summary: "safe parser summary",
    first_seen_at: "2026-05-01T00:00:00Z",
    last_seen_at: "2026-05-01T00:01:00Z",
    attempt_count: 1,
    status: "open",
    owner: "ops-maintainer",
    evidence_report_ref: "ops/evidence/cdc-fail-1.md",
    source_run_id: "run_source_1",
    latest_replay_request_id: null,
    ...overrides,
  };
}

function replayRow(overrides = {}) {
  return {
    failure_id: "cdc_fail_1",
    replay_request_id: "cdc_replay_req_existing",
    requested_action: "replay",
    status: "requested",
    idempotency_key: "idem-existing",
    bounded_scope: {
      scope_kind: "single_failure",
      primary_key_ref: "trace:tr_safe_1",
      max_records: 1,
    },
    target_topic: "cdc.safe.trace",
    target_table: "trace",
    attempt_count: 1,
    owner: "ops-maintainer",
    requester_ref: "operator-ref",
    reason_summary: "safe replay reason",
    source_run_id: "run_source_1",
    new_run_id: null,
    cleanup_status: "not_started",
    evidence_report_ref: "ops/evidence/cdc-replay-existing.md",
    requested_at: "2026-05-01T00:02:00Z",
    approved_at: null,
    completed_at: null,
    created_at: "2026-05-01T00:02:00Z",
    updated_at: "2026-05-01T00:02:00Z",
    ...overrides,
  };
}

function replayIntent() {
  return {
    idempotency_key: "idem-existing",
    requested_action: "replay",
    bounded_scope: {
      scope_kind: "single_failure",
      primary_key_ref: "trace:tr_safe_1",
      max_records: 1,
    },
    target_topic: "cdc.safe.trace",
    target_table: "trace",
    attempt_count: 1,
    owner: "ops-maintainer",
    requester_ref: "operator-ref",
    reason_summary: "safe replay reason",
    source_run_id: "run_source_1",
    evidence_report_ref: "ops/evidence/cdc-replay-existing.md",
  };
}

function stateLogRow() {
  return {
    state_log_id: "cdc_state_log_1",
    failure_id: "cdc_fail_1",
    replay_request_id: "cdc_replay_req_existing",
    from_status: "open",
    to_status: "replay_requested",
    reason_code: "safe_replay_requested",
    owner: "ops-maintainer",
    safe_metadata: {
      action_label: "create_replay_request",
    },
    evidence_report_ref: "ops/evidence/cdc-state-log-1.md",
    created_at: "2026-05-01T00:03:00Z",
  };
}

function compact(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
