const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  FAILURE_RESPONSE_FIELDS,
  REPLAY_REQUEST_RESPONSE_FIELDS,
  STATE_LOG_RESPONSE_FIELDS,
} = require("./cdc-recovery-dto-mapper");
const { createCdcRecoveryTestHarness } = require("./test-support/cdc-recovery-test-harness");
const { createCdcRecoveryStubRepository } = require("./test-support/cdc-recovery-stub-repository");

const ROUTES = Object.freeze({
  listFailures: "/api/v1/cdc/failures",
  failureDetail: "/api/v1/cdc/failures/cdc_fail_1",
  failureDetailMissing: "/api/v1/cdc/failures/cdc_fail_missing",
  stateLog: "/api/v1/cdc/failures/cdc_fail_1/state-log",
  createReplayRequest: "/api/v1/cdc/failures/cdc_fail_1/replay-requests",
  listReplayRequests: "/api/v1/cdc/replay-requests",
  replayRequestDetail: "/api/v1/cdc/replay-requests/cdc_replay_req_existing",
  approveReplayRequest: "/api/v1/cdc/replay-requests/cdc_replay_req_existing/approve",
  cancelReplayRequest: "/api/v1/cdc/replay-requests/cdc_replay_req_existing/cancel",
});

const FORBIDDEN_KEYS = Object.freeze([
  "payload",
  "body",
  "title",
  "reporter",
  "actor",
  "raw_message",
  "message_body",
  "full_message",
  "secret",
  "password",
  "token",
  "endpoint",
  "db_url",
  "connection_string",
  "stack",
  "sql",
  "query",
  "persistence_error",
  "raw_record",
  "compared_body",
  "compared_payload",
]);

test("auth missing safe 401", async () => {
  const harness = createCdcRecoveryTestHarness();

  const result = await harness.dispatchTestRoute({
    method: "GET",
    path: ROUTES.listFailures,
  });

  assertSafeError(result, 401, "unauthorized");
});

test("readonly_role can read every M2-5 read route", async () => {
  const harness = createCdcRecoveryTestHarness();
  const readRoutes = [
    ROUTES.listFailures,
    ROUTES.failureDetail,
    ROUTES.stateLog,
    ROUTES.listReplayRequests,
    ROUTES.replayRequestDetail,
  ];

  for (const routePath of readRoutes) {
    const result = await harness.dispatchTestRoute({
      method: "GET",
      path: routePath,
      role: "readonly_role",
    });
    assert.equal(result.statusCode, 200);
    assertNoForbiddenKeys(result.value);
  }
});

test("readonly_role cannot mutate and returns safe 403", async () => {
  const harness = createCdcRecoveryTestHarness();

  const result = await harness.dispatchTestRoute({
    method: "POST",
    path: ROUTES.createReplayRequest,
    role: "readonly_role",
    input: validCreateInput("idem-readonly-denied"),
  });

  assertSafeError(result, 403, "forbidden");
  assert.equal(harness.repository.getObservations().service_mutation_count, 0);
});

test("operator can create replay request and route output stays safe", async () => {
  const harness = createCdcRecoveryTestHarness();

  const result = await harness.dispatchTestRoute({
    method: "POST",
    path: ROUTES.createReplayRequest,
    role: "operator",
    input: validCreateInput("idem-operator-create"),
  });

  assert.equal(result.statusCode, 201);
  assert.equal(result.value.status, "requested");
  assert.equal(result.value.evidence_report_ref, "ops/evidence/route-test.md");
  assertNoForbiddenKeys(result.value);
  const observations = harness.repository.getObservations();
  assert.equal(observations.state_log_appended_count, 1);
  assert.equal(observations.original_failure_immutable, true);
  assert.equal(observations.original_run_immutable, true);
});

test("operator cannot approve/cancel and returns safe 403", async () => {
  const harness = createCdcRecoveryTestHarness();

  const approveResult = await harness.dispatchTestRoute({
    method: "POST",
    path: ROUTES.approveReplayRequest,
    role: "operator",
    input: approvalInput(),
  });
  const cancelResult = await harness.dispatchTestRoute({
    method: "POST",
    path: ROUTES.cancelReplayRequest,
    role: "operator",
    input: approvalInput(),
  });

  assertSafeError(approveResult, 403, "forbidden");
  assertSafeError(cancelResult, 403, "forbidden");
  assert.equal(harness.repository.getObservations().service_mutation_count, 0);
});

test("maintainer can approve/cancel with append observation", async () => {
  const approveHarness = createCdcRecoveryTestHarness();
  const approveResult = await approveHarness.dispatchTestRoute({
    method: "POST",
    path: ROUTES.approveReplayRequest,
    role: "maintainer",
    input: approvalInput(),
  });

  assert.equal(approveResult.statusCode, 200);
  assert.equal(approveResult.value.status, "approved");
  assertNoForbiddenKeys(approveResult.value);
  assert.equal(approveHarness.repository.getObservations().state_log_appended_count, 1);

  const cancelHarness = createCdcRecoveryTestHarness();
  const cancelResult = await cancelHarness.dispatchTestRoute({
    method: "POST",
    path: ROUTES.cancelReplayRequest,
    role: "maintainer",
    input: approvalInput(),
  });

  assert.equal(cancelResult.statusCode, 200);
  assert.equal(cancelResult.value.status, "cancelled");
  assertNoForbiddenKeys(cancelResult.value);
  assert.equal(cancelHarness.repository.getObservations().state_log_appended_count, 1);
});

test("system_worker cannot create arbitrary replay request", async () => {
  const harness = createCdcRecoveryTestHarness();

  const result = await harness.dispatchTestRoute({
    method: "POST",
    path: ROUTES.createReplayRequest,
    role: "system_worker",
    input: validCreateInput("idem-worker-denied"),
  });

  assertSafeError(result, 403, "forbidden");
  assert.equal(harness.repository.getObservations().service_mutation_count, 0);
});

test("list failures returns safe DTO list and DTO mapper safety marker", async () => {
  const harness = createCdcRecoveryTestHarness();

  const result = await harness.dispatchTestRoute({
    method: "GET",
    path: ROUTES.listFailures,
    role: "readonly_role",
  });

  assert.equal(result.statusCode, 200);
  assert.equal(Array.isArray(result.value.items), true);
  assertSafeFieldSet(result.value.items[0], FAILURE_RESPONSE_FIELDS);
  assertNoForbiddenKeys(result.value);
});

test("failure detail not found returns safe 404", async () => {
  const harness = createCdcRecoveryTestHarness();

  const result = await harness.dispatchTestRoute({
    method: "GET",
    path: ROUTES.failureDetailMissing,
    role: "readonly_role",
  });

  assertSafeError(result, 404, "not_found");
});

test("state log returns safe DTO list", async () => {
  const harness = createCdcRecoveryTestHarness();

  const result = await harness.dispatchTestRoute({
    method: "GET",
    path: ROUTES.stateLog,
    role: "readonly_role",
  });

  assert.equal(result.statusCode, 200);
  assert.equal(Array.isArray(result.value.items), true);
  assertSafeFieldSet(result.value.items[0], STATE_LOG_RESPONSE_FIELDS);
  assertNoForbiddenKeys(result.value);
});

test("create replay request validation error returns safe 400", async () => {
  const harness = createCdcRecoveryTestHarness();

  const result = await harness.dispatchTestRoute({
    method: "POST",
    path: ROUTES.createReplayRequest,
    role: "operator",
    input: {
      requested_action: "replay",
      bounded_scope: {
        scope_kind: "single_failure",
      },
      evidence_report_ref: "ops/evidence/route-test.md",
    },
  });

  assertSafeError(result, 400, "validation_error");
});

test("create replay request success returns safe 201", async () => {
  const harness = createCdcRecoveryTestHarness();

  const result = await harness.dispatchTestRoute({
    method: "POST",
    path: ROUTES.createReplayRequest,
    role: "operator",
    input: validCreateInput("idem-create-201"),
  });

  assert.equal(result.statusCode, 201);
  assertSafeFieldSet(result.value, REPLAY_REQUEST_RESPONSE_FIELDS);
  assertNoForbiddenKeys(result.value);
});

test("exact idempotent duplicate returns safe 200", async () => {
  const harness = createCdcRecoveryTestHarness();

  const result = await harness.dispatchTestRoute({
    method: "POST",
    path: ROUTES.createReplayRequest,
    role: "operator",
    input: existingCreateInput(),
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.value.replay_request_id, "cdc_replay_req_existing");
  assertNoForbiddenKeys(result.value);
});

test("idempotency conflict returns safe 409", async () => {
  const harness = createCdcRecoveryTestHarness();

  const result = await harness.dispatchTestRoute({
    method: "POST",
    path: ROUTES.createReplayRequest,
    role: "operator",
    input: {
      ...existingCreateInput(),
      bounded_scope: {
        scope_kind: "single_failure",
        primary_key_ref: "trace:tr_different",
        max_records: 1,
      },
    },
  });

  assertSafeError(result, 409, "idempotency_conflict");
});

test("approve invalid state transition returns safe 409", async () => {
  const repository = createCdcRecoveryStubRepository();
  repository.updateReplayRequestStatus("cdc_replay_req_existing", { to_status: "succeeded" });
  const beforeCount = repository.getObservations().state_log_appended_count;
  const harness = createCdcRecoveryTestHarness({ repository });

  const result = await harness.dispatchTestRoute({
    method: "POST",
    path: ROUTES.approveReplayRequest,
    role: "maintainer",
    input: approvalInput(),
  });

  assertSafeError(result, 409, "invalid_state_transition");
  assert.equal(repository.getObservations().state_log_appended_count, beforeCount);
});

test("cancel invalid state transition returns safe 409", async () => {
  const repository = createCdcRecoveryStubRepository();
  repository.updateReplayRequestStatus("cdc_replay_req_existing", { to_status: "succeeded" });
  const beforeCount = repository.getObservations().state_log_appended_count;
  const harness = createCdcRecoveryTestHarness({ repository });

  const result = await harness.dispatchTestRoute({
    method: "POST",
    path: ROUTES.cancelReplayRequest,
    role: "maintainer",
    input: approvalInput(),
  });

  assertSafeError(result, 409, "invalid_state_transition");
  assert.equal(repository.getObservations().state_log_appended_count, beforeCount);
});

test("unknown internal error returns safe 500", async () => {
  const repository = createCdcRecoveryStubRepository({ failMethods: ["listFailures"] });
  const harness = createCdcRecoveryTestHarness({ repository });

  const result = await harness.dispatchTestRoute({
    method: "GET",
    path: ROUTES.listFailures,
    role: "maintainer",
  });

  assertSafeError(result, 500, "internal_error");
});

test("success responses contain no forbidden raw keys", async () => {
  const harness = createCdcRecoveryTestHarness();
  const successCases = [
    { method: "GET", path: ROUTES.listFailures, role: "readonly_role" },
    { method: "GET", path: ROUTES.failureDetail, role: "readonly_role" },
    { method: "GET", path: ROUTES.stateLog, role: "readonly_role" },
    { method: "GET", path: ROUTES.listReplayRequests, role: "readonly_role" },
    { method: "GET", path: ROUTES.replayRequestDetail, role: "readonly_role" },
  ];

  for (const safeCase of successCases) {
    const result = await harness.dispatchTestRoute(safeCase);
    assert.equal(result.statusCode, 200);
    assertNoForbiddenKeys(result.value);
  }
});

test("error responses contain no forbidden raw keys", async () => {
  const harness = createCdcRecoveryTestHarness();
  const errorCases = [
    { method: "GET", path: ROUTES.listFailures },
    { method: "POST", path: ROUTES.createReplayRequest, role: "readonly_role", input: validCreateInput("idem-denied") },
    { method: "GET", path: ROUTES.failureDetailMissing, role: "readonly_role" },
  ];

  for (const safeCase of errorCases) {
    const result = await harness.dispatchTestRoute(safeCase);
    assert.ok(result.statusCode >= 400);
    assertNoForbiddenKeys(result.value);
  }
});

test("route outputs match M2-5 OpenAPI proposal at safe field level schema parity", async () => {
  const proposal = fs.readFileSync(
    path.join(__dirname, "../../../..", "sources/openapi_m2_5_dlq_replay_patch.yaml"),
    "utf8",
  );
  assert.match(proposal, /PROPOSAL ONLY - DO NOT MERGE AUTOMATICALLY/);
  assert.match(proposal, /CdcFailureSummary/);
  assert.match(proposal, /CdcReplayRequestSummary/);

  const harness = createCdcRecoveryTestHarness();
  const failureList = await harness.dispatchTestRoute({
    method: "GET",
    path: ROUTES.listFailures,
    role: "readonly_role",
  });
  const replayDetail = await harness.dispatchTestRoute({
    method: "GET",
    path: ROUTES.replayRequestDetail,
    role: "readonly_role",
  });

  assertSafeFieldSet(failureList.value.items[0], FAILURE_RESPONSE_FIELDS);
  assertSafeFieldSet(replayDetail.value, REPLAY_REQUEST_RESPONSE_FIELDS);
  assertNoForbiddenKeys(failureList.value);
  assertNoForbiddenKeys(replayDetail.value);
});

function validCreateInput(idempotencyKey) {
  return {
    idempotency_key: idempotencyKey,
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
    evidence_report_ref: "ops/evidence/route-test.md",
  };
}

function existingCreateInput() {
  return {
    ...validCreateInput("idem-existing"),
    evidence_report_ref: "ops/evidence/cdc-replay-existing.md",
  };
}

function approvalInput() {
  return {
    evidence_report_ref: "ops/evidence/approval-route-test.md",
  };
}

function assertSafeError(result, statusCode, code) {
  assert.equal(result.statusCode, statusCode);
  assert.equal(result.value.error.code, code);
  assert.equal(result.value.error.status, statusCode);
  assertNoForbiddenKeys(result.value);
}

function assertSafeFieldSet(value, allowedFields) {
  const allowed = new Set(allowedFields);
  for (const key of Object.keys(value)) {
    assert.equal(allowed.has(key), true, `unexpected safe field: ${key}`);
  }
}

function assertNoForbiddenKeys(value, trail = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenKeys(item, [...trail, String(index)]));
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    assert.equal(
      FORBIDDEN_KEYS.includes(key),
      false,
      `forbidden key found at ${[...trail, key].join(".")}`,
    );
    assertNoForbiddenKeys(child, [...trail, key]);
  }
}
