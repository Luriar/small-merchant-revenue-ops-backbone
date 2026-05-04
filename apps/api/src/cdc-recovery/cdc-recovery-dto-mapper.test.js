const test = require("node:test");
const assert = require("node:assert/strict");

const {
  FORBIDDEN_RESPONSE_FIELDS,
  containsForbiddenKeys,
  stripForbiddenFields,
  toSafeReplayRequestDto,
} = require("./cdc-recovery-dto-mapper");

test("mapper strips forbidden fields recursively", () => {
  const unsafeInput = {
    replay_request_id: "cdc_replay_req_test_1",
    failure_id: "cdc_fail_test_1",
    status: "requested",
    evidence_report_ref: "ops/evidence/test.md",
    bounded_scope: {
      scope_kind: "single_failure",
      max_records: 1,
      nested: {
        safe_marker: "kept",
      },
    },
  };
  unsafeInput[FORBIDDEN_RESPONSE_FIELDS[0]] = "removed";
  unsafeInput.bounded_scope[FORBIDDEN_RESPONSE_FIELDS[1]] = "removed";
  unsafeInput.bounded_scope.nested[FORBIDDEN_RESPONSE_FIELDS[6]] = "removed";

  const stripped = stripForbiddenFields(unsafeInput);

  assert.equal(containsForbiddenKeys(stripped), false);
  assert.equal(stripped.replay_request_id, "cdc_replay_req_test_1");
  assert.equal(stripped.bounded_scope.scope_kind, "single_failure");
  assert.equal(stripped.bounded_scope.nested.safe_marker, "kept");
});

test("mapper keeps safe replay request metadata fields", () => {
  const dto = toSafeReplayRequestDto({
    failure_id: "cdc_fail_test_2",
    replay_request_id: "cdc_replay_req_test_2",
    requested_action: "replay",
    status: "requested",
    idempotency_key: "idem_test_2",
    bounded_scope: {
      scope_kind: "single_failure",
      primary_key_ref: "trace:tr_test_2",
    },
    source_run_id: "run_source_test_2",
    new_run_id: null,
    cleanup_status: "not_started",
    evidence_report_ref: "ops/evidence/test-2.md",
    ignored_field: "not returned",
  });

  assert.deepEqual(Object.keys(dto).sort(), [
    "bounded_scope",
    "cleanup_status",
    "evidence_report_ref",
    "failure_id",
    "idempotency_key",
    "new_run_id",
    "replay_request_id",
    "requested_action",
    "source_run_id",
    "status",
  ].sort());
  assert.equal(dto.bounded_scope.primary_key_ref, "trace:tr_test_2");
});
