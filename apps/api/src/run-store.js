const { randomUUID } = require("node:crypto");

const {
  RUN_STATUSES,
  RETRYABLE_RUN_STATUSES,
} = require("../../../packages/contracts/retry-run");

class InMemoryRunStore {
  constructor({ seedRuns = [] } = {}) {
    this.runsById = new Map();
    this.stateLogsByRunId = new Map();
    this.retryRequestsByIdempotencyKey = new Map();
    this.activeRetryByOriginalRunId = new Map();
    this.reprocessRequestsByIdempotencyKey = new Map();
    this.activeReprocessByTarget = new Map();

    for (const run of seedRuns) {
      this.seedRun(run);
    }
  }

  seedRun(run) {
    if (!RUN_STATUSES.includes(run.status)) {
      throw new Error(`invalid run status: ${run.status}`);
    }

    const createdAt = run.created_at ?? new Date().toISOString();
    const record = {
      run_id: run.run_id,
      run_type: run.run_type ?? "normalization",
      status: run.status,
      attempt: run.attempt ?? 0,
      original_run_id: run.original_run_id ?? null,
      target_kind: run.target_kind ?? null,
      target_ref: run.target_ref ?? null,
      retry_action: run.retry_action ?? null,
      error_class: run.error_class ?? null,
      idempotency_key: run.idempotency_key ?? null,
      created_at: createdAt,
      updated_at: run.updated_at ?? run.completed_at ?? createdAt,
    };

    this.runsById.set(record.run_id, record);

    const stateLogs = Array.isArray(run.state_logs) ? run.state_logs : [];
    for (const stateLog of stateLogs) {
      this.seedRunStateLog(record.run_id, stateLog);
    }

    if (record.retry_action === "retry" && isActiveRunStatus(record.status) && record.original_run_id) {
      this.activeRetryByOriginalRunId.set(record.original_run_id, record.run_id);
    }

    if (record.retry_action === "retry" && record.idempotency_key && record.original_run_id) {
      this.retryRequestsByIdempotencyKey.set(buildRetryRequestKey(record.original_run_id, record.idempotency_key), {
        original_run_id: record.original_run_id,
        new_run_id: record.run_id,
      });
    }

    if (record.run_type === "reprocess" && record.idempotency_key && record.target_kind && record.target_ref) {
      this.reprocessRequestsByIdempotencyKey.set(
        buildReprocessRequestKey(record.target_kind, record.target_ref, record.idempotency_key),
        { new_run_id: record.run_id },
      );
    }

    if (record.run_type === "reprocess" && isActiveRunStatus(record.status) && record.target_kind && record.target_ref) {
      this.activeReprocessByTarget.set(buildReprocessTargetKey(record.target_kind, record.target_ref), record.run_id);
    }
  }

  requestRetry({ originalRunId, idempotencyKey, reason }) {
    const originalRun = this.runsById.get(originalRunId);
    if (!originalRun) {
      return {
        kind: "not_found",
      };
    }

    if (!RETRYABLE_RUN_STATUSES.includes(originalRun.status)) {
      return {
        kind: "conflict",
        body: {
          error: {
            code: "run_not_retryable",
            message: "run is not retryable",
          },
        },
      };
    }

    const requestKey = buildRetryRequestKey(originalRunId, idempotencyKey);
    const existingRequest = this.retryRequestsByIdempotencyKey.get(requestKey);
    if (existingRequest) {
      return {
        kind: "ok",
        statusCode: 200,
        body: {
          action: "retry_requested",
          original_run_id: originalRunId,
          new_run_id: existingRequest.new_run_id,
          idempotent_replay: true,
          status: "accepted",
        },
      };
    }

    if (this.activeRetryByOriginalRunId.has(originalRunId)) {
      return {
        kind: "conflict",
        body: {
          error: {
            code: "active_retry_exists",
            message: "an active retry already exists for this run",
          },
        },
      };
    }

    const newRunId = randomUUID();
    const retryRun = {
      run_id: newRunId,
      run_type: originalRun.run_type,
      status: "pending",
      attempt: originalRun.attempt + 1,
      original_run_id: originalRunId,
      retry_action: "retry",
      idempotency_key: idempotencyKey,
      reason,
      created_at: new Date().toISOString(),
    };

    this.runsById.set(retryRun.run_id, retryRun);
    this.retryRequestsByIdempotencyKey.set(requestKey, {
      original_run_id: originalRunId,
      new_run_id: newRunId,
    });
    this.activeRetryByOriginalRunId.set(originalRunId, newRunId);

    return {
      kind: "ok",
      statusCode: 202,
      body: {
        action: "retry_requested",
        original_run_id: originalRunId,
        new_run_id: newRunId,
        idempotent_replay: false,
        status: "accepted",
      },
    };
  }

  requestReprocess({ idempotencyKey, targetKind, targetRef, reason }) {
    const requestKey = buildReprocessRequestKey(targetKind, targetRef, idempotencyKey);
    const existingRequest = this.reprocessRequestsByIdempotencyKey.get(requestKey);
    if (existingRequest) {
      return {
        kind: "ok",
        statusCode: 200,
        body: {
          action: "reprocess_requested",
          new_run_id: existingRequest.new_run_id,
          idempotent_replay: true,
          status: "accepted",
        },
      };
    }

    const targetKey = buildReprocessTargetKey(targetKind, targetRef);
    if (this.activeReprocessByTarget.has(targetKey)) {
      return {
        kind: "conflict",
        body: {
          error: {
            code: "active_reprocess_exists",
            message: "an active reprocess already exists for this target",
          },
        },
      };
    }

    const newRunId = randomUUID();
    const reprocessRun = {
      run_id: newRunId,
      run_type: "reprocess",
      status: "pending",
      attempt: 0,
      target_kind: targetKind,
      target_ref: targetRef,
      idempotency_key: idempotencyKey,
      reason,
      created_at: new Date().toISOString(),
    };

    this.runsById.set(reprocessRun.run_id, reprocessRun);
    this.reprocessRequestsByIdempotencyKey.set(requestKey, {
      new_run_id: newRunId,
    });
    this.activeReprocessByTarget.set(targetKey, newRunId);

    return {
      kind: "ok",
      statusCode: 202,
      body: {
        action: "reprocess_requested",
        new_run_id: newRunId,
        idempotent_replay: false,
        status: "accepted",
      },
    };
  }

  async listRuns({ status, limit, cursor }) {
    let runs = Array.from(this.runsById.values()).map((run) => ({
      run_id: run.run_id,
      run_type: run.run_type,
      target_kind: run.target_kind ?? null,
      target_ref: run.target_ref ?? null,
      status: run.status,
      attempt: run.attempt,
      created_at: run.created_at,
    }));

    if (status) {
      runs = runs.filter((run) => run.status === status);
    }

    runs.sort(compareRunListItem);

    if (cursor) {
      runs = runs.filter((run) => isRunAfterCursor(run, cursor));
    }

    if (limit !== null && limit !== undefined) {
      runs = runs.slice(0, limit + 1);
    }

    return { runs };
  }

  async getRunById(runId) {
    const run = this.runsById.get(runId);
    if (!run) {
      return null;
    }

    return projectRunDetail(run);
  }

  async listRunStateLog(runId) {
    const items = this.stateLogsByRunId.get(runId) ?? [];

    return {
      items: items
        .slice()
        .sort(compareStateLogRecord)
        .map(projectRunStateLogItem),
    };
  }

  async getOverviewSummary() {
    const runs = Array.from(this.runsById.values());

    return {
      total_runs: runs.length,
      pending_runs: countRunsByStatus(runs, "pending"),
      processing_runs: countRunsByStatus(runs, "processing"),
      failed_runs: countRunsByStatus(runs, "failed"),
      dlq_runs: countRunsByStatus(runs, "dlq"),
    };
  }

  async listRunFailures() {
    const failureGroups = new Map();

    for (const run of this.runsById.values()) {
      if (!RETRYABLE_RUN_STATUSES.includes(run.status)) {
        continue;
      }

      const errorClass = typeof run.error_class === "string" && run.error_class.trim().length > 0
        ? run.error_class
        : "unknown";
      const occurredAt = run.updated_at ?? run.created_at;
      const current = failureGroups.get(errorClass);

      if (!current) {
        failureGroups.set(errorClass, {
          error_class: errorClass,
          count: 1,
          latest_occurred_at: occurredAt,
          representative_run_type: run.run_type,
          retryable: true,
        });
        continue;
      }

      current.count += 1;
      if (occurredAt > current.latest_occurred_at) {
        current.latest_occurred_at = occurredAt;
        current.representative_run_type = run.run_type;
      }
    }

    return {
      groups: Array.from(failureGroups.values()).sort(compareRunFailureGroup),
    };
  }

  seedRunStateLog(runId, stateLog) {
    const record = {
      state_log_id: stateLog.state_log_id,
      run_id: runId,
      from_status: stateLog.from_status ?? null,
      to_status: stateLog.to_status,
      changed_at: stateLog.changed_at ?? new Date().toISOString(),
    };

    const items = this.stateLogsByRunId.get(runId) ?? [];
    items.push(record);
    this.stateLogsByRunId.set(runId, items);
  }
}

function compareRunListItem(left, right) {
  const createdAtComparison = right.created_at.localeCompare(left.created_at);
  if (createdAtComparison !== 0) {
    return createdAtComparison;
  }

  return left.run_id.localeCompare(right.run_id);
}

function isRunAfterCursor(item, cursor) {
  return item.created_at < cursor.created_at
    || (item.created_at === cursor.created_at && item.run_id > cursor.run_id);
}

function buildRetryRequestKey(originalRunId, idempotencyKey) {
  return `${originalRunId}::${idempotencyKey}`;
}

function buildReprocessRequestKey(targetKind, targetRef, idempotencyKey) {
  return `${targetKind}::${targetRef}::${idempotencyKey}`;
}

function buildReprocessTargetKey(targetKind, targetRef) {
  return `${targetKind}::${targetRef}`;
}

function isActiveRunStatus(status) {
  return status === "pending" || status === "processing";
}

function projectRunDetail(run) {
  const detail = {
    run_id: run.run_id,
    run_type: run.run_type,
    target_kind: run.target_kind ?? null,
    target_ref: run.target_ref ?? null,
    status: run.status,
    attempt: run.attempt,
    created_at: run.created_at,
  };

  if (typeof run.retry_action === "string") {
    detail.retry_action = run.retry_action;
  }

  if (typeof run.original_run_id === "string") {
    detail.original_run_id = run.original_run_id;
  }

  return detail;
}

function compareStateLogRecord(left, right) {
  const changedAtComparison = left.changed_at.localeCompare(right.changed_at);
  if (changedAtComparison !== 0) {
    return changedAtComparison;
  }

  return String(left.state_log_id).localeCompare(String(right.state_log_id));
}

function projectRunStateLogItem(stateLog) {
  return {
    state_log_id: stateLog.state_log_id,
    run_id: stateLog.run_id,
    from_status: stateLog.from_status,
    to_status: stateLog.to_status,
    changed_at: stateLog.changed_at,
  };
}

function countRunsByStatus(runs, status) {
  return runs.filter((run) => run.status === status).length;
}

function compareRunFailureGroup(left, right) {
  const latestComparison = String(right.latest_occurred_at).localeCompare(String(left.latest_occurred_at));
  if (latestComparison !== 0) {
    return latestComparison;
  }

  return left.error_class.localeCompare(right.error_class);
}

module.exports = {
  InMemoryRunStore,
};
