const {
  FAILURE_RESPONSE_FIELDS,
  REPLAY_REQUEST_RESPONSE_FIELDS,
  STATE_LOG_RESPONSE_FIELDS,
  pickSafeFields,
  stripForbiddenFields,
} = require("./cdc-recovery-dto-mapper");

const REPLAY_INTENT_FIELDS = Object.freeze([
  "requester_ref",
  "reason_summary",
]);

class CdcRecoveryPersistenceError extends Error {
  constructor(methodName) {
    super("persistence operation failed");
    this.name = "CdcRecoveryPersistenceError";
    this.code = "internal_error";
    this.statusCode = 500;
    this.methodName = methodName;
  }
}

class AuroraCdcRecoveryRepository {
  constructor({ db } = {}) {
    if (!db || typeof db.query !== "function") {
      throw new Error("injected db client with query(text, values) is required");
    }
    this.db = db;
  }

  async listFailures(filter = {}, page = {}) {
    return this.read("listFailures", async (queryable) => {
      const { where, values } = buildFilter([
        ["status", filter.status],
        ["failure_type", filter.failure_type],
        ["source_topic", filter.source_topic],
        ["owner", filter.owner],
      ]);
      const limit = normalizeLimit(page.limit ?? filter.limit);
      const result = await queryable.query(
        `
          SELECT ${failureColumns()}
          FROM public.cdc_failure
          ${where}
          ORDER BY first_seen_at DESC, failure_id ASC
          LIMIT $${values.length + 1}
        `,
        [...values, limit + 1],
      );
      return result.rows.map(normalizeFailureRow);
    });
  }

  async getFailureById(failureId) {
    return this.read("getFailureById", async (queryable) => {
      const result = await queryable.query(
        `
          SELECT ${failureColumns()}
          FROM public.cdc_failure
          WHERE failure_id = $1
          LIMIT 1
        `,
        [failureId],
      );
      return normalizeFailureRow(result.rows[0] ?? null);
    });
  }

  async listFailureStateLog(failureId, page = {}) {
    return this.read("listFailureStateLog", async (queryable) => {
      const limit = normalizeLimit(page.limit);
      const result = await queryable.query(
        `
          SELECT ${stateLogColumns()}
          FROM public.cdc_failure_state_log
          WHERE failure_id = $1
          ORDER BY created_at ASC, state_log_id ASC
          LIMIT $2
        `,
        [failureId, limit + 1],
      );
      return result.rows.map(normalizeStateLogRow);
    });
  }

  async listReplayRequests(filter = {}, page = {}) {
    return this.read("listReplayRequests", async (queryable) => {
      const { where, values } = buildFilter([
        ["status", filter.status],
        ["failure_id", filter.failure_id],
        ["owner", filter.owner],
      ]);
      const limit = normalizeLimit(page.limit ?? filter.limit);
      const result = await queryable.query(
        `
          SELECT ${replayRequestColumns()}
          FROM public.cdc_replay_request
          ${where}
          ORDER BY requested_at DESC, replay_request_id ASC
          LIMIT $${values.length + 1}
        `,
        [...values, limit + 1],
      );
      return result.rows.map(normalizeReplayRequestRow);
    });
  }

  async getReplayRequestById(replayRequestId) {
    return this.read("getReplayRequestById", async (queryable) => {
      const result = await queryable.query(
        `
          SELECT ${replayRequestColumns()}
          FROM public.cdc_replay_request
          WHERE replay_request_id = $1
          LIMIT 1
        `,
        [replayRequestId],
      );
      return normalizeReplayRequestRow(result.rows[0] ?? null);
    });
  }

  async findReplayRequestByIdempotencyKey(idempotencyKey) {
    return this.read("findReplayRequestByIdempotencyKey", async (queryable) => {
      const result = await queryable.query(
        `
          SELECT ${replayRequestColumns()}
          FROM public.cdc_replay_request
          WHERE idempotency_key = $1
          LIMIT 1
        `,
        [idempotencyKey],
      );
      return normalizeReplayRequestRow(result.rows[0] ?? null);
    });
  }

  async createReplayRequest(input) {
    return this.write("createReplayRequest", async (queryable) => {
      const replayRequestId = input.replay_request_id ?? buildReplayRequestId(input.idempotency_key);
      const result = await queryable.query(
        `
          INSERT INTO public.cdc_replay_request (
            replay_request_id,
            failure_id,
            requested_action,
            requested_by,
            owner,
            reason_summary,
            target_topic,
            target_table,
            bounded_scope,
            idempotency_key,
            attempt_count,
            source_run_id,
            evidence_report_ref
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13)
          RETURNING ${replayRequestColumns()}
        `,
        [
          replayRequestId,
          input.failure_id,
          input.requested_action,
          input.requester_ref ?? input.owner,
          input.owner,
          input.reason_summary ?? "safe replay request",
          input.target_topic ?? null,
          input.target_table ?? null,
          JSON.stringify(input.bounded_scope ?? {}),
          input.idempotency_key,
          input.attempt_count ?? 0,
          input.source_run_id ?? null,
          input.evidence_report_ref,
        ],
      );
      return normalizeReplayRequestRow(result.rows[0] ?? null);
    });
  }

  async appendFailureStateLog(input) {
    return this.write("appendFailureStateLog", async (queryable) => {
      const result = await queryable.query(
        `
          INSERT INTO public.cdc_failure_state_log (
            failure_id,
            replay_request_id,
            from_status,
            to_status,
            reason_code,
            owner,
            safe_metadata,
            evidence_report_ref
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
          RETURNING ${stateLogColumns()}
        `,
        [
          input.failure_id,
          input.replay_request_id ?? null,
          input.from_status ?? null,
          input.to_status,
          input.reason_code,
          input.owner,
          JSON.stringify(input.safe_metadata ?? {}),
          input.evidence_report_ref ?? null,
        ],
      );
      return normalizeStateLogRow(result.rows[0] ?? null);
    });
  }

  async updateFailureStatus(failureId, transition) {
    return this.write("updateFailureStatus", async (queryable) => {
      const values = [
        transition.to_status,
        transition.replay_request_id ?? null,
        failureId,
      ];
      let statusGuard = "";
      if (transition.from_status) {
        values.push(transition.from_status);
        statusGuard = ` AND status = $${values.length}`;
      }
      const result = await queryable.query(
        `
          UPDATE public.cdc_failure
          SET status = $1,
              latest_replay_request_id = COALESCE($2, latest_replay_request_id),
              updated_at = NOW()
          WHERE failure_id = $3${statusGuard}
          RETURNING ${failureColumns()}
        `,
        values,
      );
      return normalizeFailureRow(result.rows[0] ?? null);
    });
  }

  async updateReplayRequestStatus(replayRequestId, transition) {
    return this.write("updateReplayRequestStatus", async (queryable) => {
      const values = [transition.to_status, replayRequestId];
      let statusGuard = "";
      if (transition.from_status) {
        values.push(transition.from_status);
        statusGuard = ` AND status = $${values.length}`;
      }
      const result = await queryable.query(
        `
          UPDATE public.cdc_replay_request
          SET status = $1,
              approved_at = CASE WHEN $1 = 'approved' THEN NOW() ELSE approved_at END,
              completed_at = CASE WHEN $1 IN ('cancelled', 'succeeded', 'failed') THEN NOW() ELSE completed_at END,
              cleanup_status = CASE WHEN $1 = 'cancelled' THEN 'not_required' ELSE cleanup_status END,
              updated_at = NOW()
          WHERE replay_request_id = $2${statusGuard}
          RETURNING ${replayRequestColumns()}
        `,
        values,
      );
      return normalizeReplayRequestRow(result.rows[0] ?? null);
    });
  }

  async linkNewRunId(replayRequestId, newRunId) {
    return this.write("linkNewRunId", async (queryable) => {
      const result = await queryable.query(
        `
          UPDATE public.cdc_replay_request
          SET new_run_id = $1,
              cleanup_status = CASE WHEN cleanup_status = 'not_started' THEN 'pending' ELSE cleanup_status END,
              updated_at = NOW()
          WHERE replay_request_id = $2
            AND status IN ('approved', 'running')
          RETURNING ${replayRequestColumns()}
        `,
        [newRunId, replayRequestId],
      );
      return normalizeReplayRequestRow(result.rows[0] ?? null);
    });
  }

  async read(methodName, work) {
    try {
      return await work(this.db);
    } catch (_error) {
      throw new CdcRecoveryPersistenceError(methodName);
    }
  }

  async write(methodName, work) {
    try {
      if (typeof this.db.withTransaction === "function") {
        return await this.db.withTransaction(work);
      }
      return await work(this.db);
    } catch (_error) {
      throw new CdcRecoveryPersistenceError(methodName);
    }
  }
}

function buildFilter(pairs) {
  const clauses = [];
  const values = [];
  for (const [column, value] of pairs) {
    if (typeof value !== "string" || value.length === 0) {
      continue;
    }
    values.push(value);
    clauses.push(`${column} = $${values.length}`);
  }
  return {
    where: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    values,
  };
}

function normalizeLimit(value) {
  if (Number.isInteger(value) && value > 0 && value <= 100) {
    return value;
  }
  return 20;
}

function failureColumns() {
  return [
    "failure_id",
    "failure_type",
    "source_topic",
    "source_table",
    "primary_key",
    "op",
    "ts_ms",
    "observed_field_names",
    "missing_required_fields",
    "unexpected_fields",
    "forbidden_field_names_detected",
    "parser_error_class",
    "parser_error_summary",
    "first_seen_at",
    "last_seen_at",
    "attempt_count",
    "status",
    "owner",
    "evidence_report_ref",
    "source_run_id",
    "latest_replay_request_id",
  ].join(", ");
}

function replayRequestColumns() {
  return [
    "failure_id",
    "replay_request_id",
    "requested_action",
    "status",
    "idempotency_key",
    "bounded_scope",
    "target_topic",
    "target_table",
    "attempt_count",
    "owner",
    "requested_by AS requester_ref",
    "reason_summary",
    "source_run_id",
    "new_run_id",
    "cleanup_status",
    "evidence_report_ref",
    "requested_at",
    "approved_at",
    "completed_at",
    "created_at",
    "updated_at",
  ].join(", ");
}

function stateLogColumns() {
  return [
    "state_log_id",
    "failure_id",
    "replay_request_id",
    "from_status",
    "to_status",
    "reason_code",
    "owner",
    "safe_metadata",
    "evidence_report_ref",
    "created_at",
  ].join(", ");
}

function normalizeFailureRow(row) {
  if (!row) {
    return null;
  }
  return pickSafeFields(stripForbiddenFields(row), FAILURE_RESPONSE_FIELDS);
}

function normalizeReplayRequestRow(row) {
  if (!row) {
    return null;
  }
  return pickSafeFields(stripForbiddenFields(row), [
    ...REPLAY_REQUEST_RESPONSE_FIELDS,
    ...REPLAY_INTENT_FIELDS,
  ]);
}

function normalizeStateLogRow(row) {
  if (!row) {
    return null;
  }
  return pickSafeFields(stripForbiddenFields(row), STATE_LOG_RESPONSE_FIELDS);
}

function buildReplayRequestId(idempotencyKey) {
  const safeSuffix = String(idempotencyKey ?? "missing")
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .slice(0, 80);
  return `cdc_replay_req_${safeSuffix}`;
}

module.exports = {
  AuroraCdcRecoveryRepository,
  CdcRecoveryPersistenceError,
};
