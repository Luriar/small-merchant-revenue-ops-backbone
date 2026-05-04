const test = require("node:test");
const assert = require("node:assert/strict");

const { FORBIDDEN_RESPONSE_FIELDS, containsForbiddenKeys } = require("./cdc-recovery-dto-mapper");
const {
  enforceIdempotency,
  enforceStateTransition,
  normalizeCreateReplayRequest,
  validateCreateReplayRequest,
} = require("./cdc-recovery-service");

test("same idempotency key and same normalized request returns duplicate decision", () => {
  const existingRequest = {
    failure_id: "cdc_fail_test_1",
    replay_request_id: "cdc_replay_req_test_1",
    ...baseReplayRequest(),
    status: "requested",
  };
  const input = {
    ...baseReplayRequest(),
  };

  const decision = enforceIdempotency({ existingRequest, input });

  assert.equal(decision.kind, "duplicate");
  assert.equal(decision.statusCode, 200);
  assert.equal(decision.value.replay_request_id, "cdc_replay_req_test_1");
  assert.equal(containsForbiddenKeys(decision.value), false);
});

test("same idempotency key and different bounded scope returns conflict decision", () => {
  const existingRequest = {
    ...baseReplayRequest(),
    bounded_scope: {
      scope_kind: "single_failure",
      primary_key_ref: "trace:original",
    },
  };
  const input = {
    ...baseReplayRequest(),
    bounded_scope: {
      scope_kind: "single_failure",
      primary_key_ref: "trace:different",
    },
  };

  const decision = enforceIdempotency({ existingRequest, input });

  assert.equal(decision.kind, "conflict");
  assert.equal(decision.statusCode, 409);
  assert.equal(decision.error.statusCode, 409);
  assert.equal(decision.error.code, "idempotency_conflict");
});

test("invalid state transition returns 409 style error", () => {
  const decision = enforceStateTransition("succeeded", "approve");

  assert.equal(decision.ok, false);
  assert.equal(decision.statusCode, 409);
  assert.equal(decision.error.code, "invalid_state_transition");
});

test("service validation rejects forbidden field leakage and output stays safe", () => {
  const input = baseReplayRequest();
  input[FORBIDDEN_RESPONSE_FIELDS[0]] = "not allowed";

  const validation = validateCreateReplayRequest(input);
  const normalized = normalizeCreateReplayRequest(baseReplayRequest());

  assert.equal(validation.ok, false);
  assert.equal(validation.errors.includes("forbidden field leakage detected"), true);
  assert.equal(containsForbiddenKeys(normalized), false);
});

function baseReplayRequest() {
  return {
    idempotency_key: "idem_service_test_1",
    requested_action: "replay",
    bounded_scope: {
      scope_kind: "single_failure",
      source_topic: "cdc.aurora.public.trace",
      source_table: "trace",
      primary_key_ref: "trace:tr_service_test_1",
      max_records: 1,
    },
    target_topic: "cdc.aurora.public.trace",
    target_table: "trace",
    attempt_count: 0,
    owner: "ops-maintainer",
    requester_ref: "operator-ref-1",
    reason_summary: "controlled replay request",
    source_run_id: "run_service_source_1",
    evidence_report_ref: "ops/evidence/service-test.md",
  };
}
