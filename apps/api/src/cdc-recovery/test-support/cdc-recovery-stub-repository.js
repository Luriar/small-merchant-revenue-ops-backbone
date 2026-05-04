function createCdcRecoveryStubRepository(options = {}) {
  return new CdcRecoveryStubRepository(options);
}

class CdcRecoveryStubRepository {
  constructor({ failMethods = [] } = {}) {
    this.failMethods = new Set(failMethods);
    this.failures = new Map();
    this.replayRequests = new Map();
    this.stateLog = [];
    this.observations = {
      state_log_appended_count: 0,
      original_failure_immutable: true,
      original_run_immutable: true,
      service_mutation_count: 0,
      link_new_run_id_count: 0,
    };

    this.seed();
  }

  seed() {
    this.failures.set("cdc_fail_1", {
      failure_id: "cdc_fail_1",
      failure_type: "source_write_failure",
      source_topic: "cdc.safe.trace",
      source_table: "trace",
      primary_key: "trace:tr_safe_1",
      op: "u",
      ts_ms: 1710000000000,
      observed_field_names: ["trace_id", "run_id", "status"],
      missing_required_fields: ["evidence_ref"],
      unexpected_fields: ["extra_safe_marker"],
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
      immutable_source_run_id: "run_source_1",
    });

    this.replayRequests.set("cdc_replay_req_existing", {
      replay_request_id: "cdc_replay_req_existing",
      failure_id: "cdc_fail_1",
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
      new_run_id: null,
      cleanup_status: "not_started",
      status: "requested",
      evidence_report_ref: "ops/evidence/cdc-replay-existing.md",
      requested_at: "2026-05-01T00:02:00Z",
      approved_at: null,
      completed_at: null,
      created_at: "2026-05-01T00:02:00Z",
      updated_at: "2026-05-01T00:02:00Z",
    });

    this.stateLog.push({
      state_log_id: "cdc_state_log_1",
      failure_id: "cdc_fail_1",
      replay_request_id: "cdc_replay_req_existing",
      from_status: "open",
      to_status: "replay_requested",
      reason_code: "safe_replay_requested",
      owner: "ops-maintainer",
      safe_metadata: {
        action_label: "replay_requested",
      },
      evidence_report_ref: "ops/evidence/cdc-state-log-1.md",
      created_at: "2026-05-01T00:02:00Z",
    });
  }

  listFailures(_filter, _page) {
    this.throwIfConfigured("listFailures");
    return Array.from(this.failures.values()).map(copyValue);
  }

  getFailureById(failureId) {
    this.throwIfConfigured("getFailureById");
    return copyValue(this.failures.get(failureId) ?? null);
  }

  listFailureStateLog(failureId, _page) {
    this.throwIfConfigured("listFailureStateLog");
    return this.stateLog
      .filter((entry) => entry.failure_id === failureId)
      .map(copyValue);
  }

  listReplayRequests(_filter, _page) {
    this.throwIfConfigured("listReplayRequests");
    return Array.from(this.replayRequests.values()).map(copyValue);
  }

  getReplayRequestById(replayRequestId) {
    this.throwIfConfigured("getReplayRequestById");
    return copyValue(this.replayRequests.get(replayRequestId) ?? null);
  }

  findReplayRequestByIdempotencyKey(idempotencyKey) {
    this.throwIfConfigured("findReplayRequestByIdempotencyKey");
    const match = Array.from(this.replayRequests.values())
      .find((request) => request.idempotency_key === idempotencyKey);
    return copyValue(match ?? null);
  }

  createReplayRequest(input) {
    this.throwIfConfigured("createReplayRequest");
    this.observations.service_mutation_count += 1;
    const replayRequestId = input.replay_request_id ?? `cdc_replay_req_${this.replayRequests.size + 1}`;
    const record = {
      ...copyValue(input),
      replay_request_id: replayRequestId,
      status: input.status ?? "requested",
      new_run_id: null,
      cleanup_status: input.cleanup_status ?? "not_started",
      requested_at: "2026-05-01T00:03:00Z",
      approved_at: null,
      completed_at: null,
      created_at: "2026-05-01T00:03:00Z",
      updated_at: "2026-05-01T00:03:00Z",
    };
    this.replayRequests.set(replayRequestId, record);
    return copyValue(record);
  }

  appendFailureStateLog(input) {
    this.throwIfConfigured("appendFailureStateLog");
    this.observations.state_log_appended_count += 1;
    const entry = {
      ...copyValue(input),
      state_log_id: input.state_log_id ?? `cdc_state_log_${this.stateLog.length + 1}`,
      created_at: input.created_at ?? "2026-05-01T00:03:00Z",
    };
    this.stateLog.push(entry);
    return copyValue(entry);
  }

  updateFailureStatus(failureId, transition) {
    this.throwIfConfigured("updateFailureStatus");
    this.observations.service_mutation_count += 1;
    const existing = this.failures.get(failureId);
    if (!existing) {
      return null;
    }
    const sourceRunBefore = existing.immutable_source_run_id;
    const updated = {
      ...existing,
      status: transition.to_status,
      latest_replay_request_id: transition.replay_request_id ?? existing.latest_replay_request_id,
      last_seen_at: existing.last_seen_at,
    };
    this.observations.original_failure_immutable = this.observations.original_failure_immutable
      && updated.immutable_source_run_id === sourceRunBefore;
    this.observations.original_run_immutable = this.observations.original_run_immutable
      && updated.source_run_id === sourceRunBefore;
    this.failures.set(failureId, updated);
    return copyValue(updated);
  }

  updateReplayRequestStatus(replayRequestId, transition) {
    this.throwIfConfigured("updateReplayRequestStatus");
    this.observations.service_mutation_count += 1;
    const existing = this.replayRequests.get(replayRequestId);
    if (!existing) {
      return null;
    }
    const updated = {
      ...existing,
      status: transition.to_status,
      approved_at: transition.to_status === "approved" ? "2026-05-01T00:04:00Z" : existing.approved_at,
      completed_at: ["cancelled", "succeeded", "failed"].includes(transition.to_status)
        ? "2026-05-01T00:04:00Z"
        : existing.completed_at,
      updated_at: "2026-05-01T00:04:00Z",
    };
    this.replayRequests.set(replayRequestId, updated);
    return copyValue(updated);
  }

  linkNewRunId(replayRequestId, newRunId) {
    this.throwIfConfigured("linkNewRunId");
    this.observations.link_new_run_id_count += 1;
    const existing = this.replayRequests.get(replayRequestId);
    if (!existing) {
      return null;
    }
    const updated = {
      ...existing,
      new_run_id: newRunId,
      updated_at: "2026-05-01T00:05:00Z",
    };
    this.replayRequests.set(replayRequestId, updated);
    return copyValue(updated);
  }

  getObservations() {
    return copyValue(this.observations);
  }

  throwIfConfigured(methodName) {
    if (this.failMethods.has(methodName)) {
      throw new Error("test internal failure");
    }
  }
}

function copyValue(value) {
  if (value === null || typeof value === "undefined") {
    return value ?? null;
  }
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  CdcRecoveryStubRepository,
  createCdcRecoveryStubRepository,
};
