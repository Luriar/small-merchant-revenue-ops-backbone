const { RETRYABLE_RUN_STATUSES } = require("../../../packages/contracts/retry-run");

class AuroraRunRepository {
  constructor({ db }) {
    this.db = db;
  }

  async requestRetry({ originalRunId, idempotencyKey, reason }) {
    const execute = this.db.withTransaction
      ? (work) => this.db.withTransaction(work)
      : (work) => work(this.db);

    return execute(async (queryable) => {
      const originalRun = await findRunById(queryable, originalRunId);
      if (!originalRun) {
        return { kind: "not_found" };
      }

      if (!RETRYABLE_RUN_STATUSES.includes(originalRun.status)) {
        return conflict("run_not_retryable", "run is not retryable");
      }

      const replay = await findRetryReplay(queryable, originalRunId, idempotencyKey);
      if (replay) {
        return {
          kind: "ok",
          statusCode: 200,
          body: {
            action: "retry_requested",
            original_run_id: originalRunId,
            new_run_id: replay.run_id,
            idempotent_replay: true,
            status: "accepted",
          },
        };
      }

      const activeRetry = await findActiveRetry(queryable, originalRunId);
      if (activeRetry) {
        return conflict("active_retry_exists", "an active retry already exists for this run");
      }

      let inserted;
      try {
        inserted = await insertRetryRun(queryable, {
          originalRun,
          originalRunId,
          idempotencyKey,
          reason,
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          const replayAfterConflict = await findRetryReplay(queryable, originalRunId, idempotencyKey);
          if (replayAfterConflict) {
            return {
              kind: "ok",
              statusCode: 200,
              body: {
                action: "retry_requested",
                original_run_id: originalRunId,
                new_run_id: replayAfterConflict.run_id,
                idempotent_replay: true,
                status: "accepted",
              },
            };
          }

          const activeRetryAfterConflict = await findActiveRetry(queryable, originalRunId);
          if (activeRetryAfterConflict) {
            return conflict("active_retry_exists", "an active retry already exists for this run");
          }
        }

        throw error;
      }

      return {
        kind: "ok",
        statusCode: 202,
        body: {
          action: "retry_requested",
          original_run_id: originalRunId,
          new_run_id: inserted.run_id,
          idempotent_replay: false,
          status: "accepted",
        },
      };
    });
  }

  async requestReprocess({ idempotencyKey, targetKind, targetRef, reason }) {
    const execute = this.db.withTransaction
      ? (work) => this.db.withTransaction(work)
      : (work) => work(this.db);

    return execute(async (queryable) => {
      const replay = await findReprocessReplay(queryable, targetKind, targetRef, idempotencyKey);
      if (replay) {
        return {
          kind: "ok",
          statusCode: 200,
          body: {
            action: "reprocess_requested",
            new_run_id: replay.run_id,
            idempotent_replay: true,
            status: "accepted",
          },
        };
      }

      const activeReprocess = await findActiveReprocess(queryable, targetKind, targetRef);
      if (activeReprocess) {
        return conflict("active_reprocess_exists", "an active reprocess already exists for this target");
      }

      let inserted;
      try {
        inserted = await insertReprocessRun(queryable, {
          idempotencyKey,
          targetKind,
          targetRef,
          reason,
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          const replayAfterConflict = await findReprocessReplay(queryable, targetKind, targetRef, idempotencyKey);
          if (replayAfterConflict) {
            return {
              kind: "ok",
              statusCode: 200,
              body: {
                action: "reprocess_requested",
                new_run_id: replayAfterConflict.run_id,
                idempotent_replay: true,
                status: "accepted",
              },
            };
          }

          const activeReprocessAfterConflict = await findActiveReprocess(queryable, targetKind, targetRef);
          if (activeReprocessAfterConflict) {
            return conflict("active_reprocess_exists", "an active reprocess already exists for this target");
          }
        }

        throw error;
      }

      return {
        kind: "ok",
        statusCode: 202,
        body: {
          action: "reprocess_requested",
          new_run_id: inserted.run_id,
          idempotent_replay: false,
          status: "accepted",
        },
      };
    });
  }

  async listRuns({ status, limit, cursor }) {
    const clauses = [];
    const values = [];

    if (status) {
      values.push(status);
      clauses.push(`status = $${values.length}`);
    }

    if (cursor) {
      values.push(cursor.created_at);
      const createdAtIndex = values.length;
      values.push(cursor.run_id);
      const runIdIndex = values.length;
      clauses.push(`(created_at < $${createdAtIndex}::timestamptz OR (created_at = $${createdAtIndex}::timestamptz AND run_id > $${runIdIndex}))`);
    }

    let query = `
      SELECT
        run_id,
        run_type,
        target_kind,
        target_ref,
        status,
        attempt,
        created_at
      FROM run
    `;

    if (clauses.length > 0) {
      query += ` WHERE ${clauses.join(" AND ")}`;
    }

    query += " ORDER BY created_at DESC, run_id ASC";

    if (limit !== null && limit !== undefined) {
      values.push(limit + 1);
      query += ` LIMIT $${values.length}`;
    }

    const result = await this.db.query(query, values);
    return { runs: result.rows };
  }

  async getRunById(runId) {
    const result = await this.db.query(
      `
        SELECT
          run_id,
          run_type,
          target_kind,
          target_ref,
          status,
          attempt,
          created_at,
          CASE
            WHEN input_ref->>'action' = 'retry' THEN input_ref->>'action'
            ELSE NULL
          END AS retry_action,
          CASE
            WHEN input_ref->>'action' = 'retry' THEN input_ref->>'original_run_id'
            ELSE NULL
          END AS original_run_id
        FROM run
        WHERE run_id = $1
        LIMIT 1
      `,
      [runId],
    );

    return result.rows[0] ?? null;
  }

  async listRunStateLog(runId) {
    const result = await this.db.query(
      `
        SELECT
          log_id AS state_log_id,
          run_id,
          from_status,
          to_status,
          occurred_at AS changed_at
        FROM run_state_log
        WHERE run_id = $1
        ORDER BY occurred_at ASC, log_id ASC
      `,
      [runId],
    );

    return {
      items: result.rows,
    };
  }

  async getOverviewSummary() {
    const result = await this.db.query(
      `
        SELECT
          COUNT(*)::integer AS total_runs,
          COUNT(*) FILTER (WHERE status = 'pending')::integer AS pending_runs,
          COUNT(*) FILTER (WHERE status = 'processing')::integer AS processing_runs,
          COUNT(*) FILTER (WHERE status = 'failed')::integer AS failed_runs,
          COUNT(*) FILTER (WHERE status = 'dlq')::integer AS dlq_runs
        FROM run
      `,
      [],
    );

    return result.rows[0];
  }

  async listRunFailures() {
    const result = await this.db.query(
      `
        SELECT
          COALESCE(NULLIF(error_class, ''), 'unknown') AS error_class,
          COUNT(*)::integer AS count,
          MAX(COALESCE(updated_at, created_at)) AS latest_occurred_at,
          (ARRAY_AGG(run_type ORDER BY COALESCE(updated_at, created_at) DESC, run_id ASC))[1] AS representative_run_type,
          BOOL_OR(status IN ('failed', 'dlq')) AS retryable
        FROM run
        WHERE status IN ('failed', 'dlq')
        GROUP BY COALESCE(NULLIF(error_class, ''), 'unknown')
        ORDER BY latest_occurred_at DESC, error_class ASC
      `,
      [],
    );

    return {
      groups: result.rows,
    };
  }
}

async function findRunById(queryable, runId) {
  const result = await queryable.query(
    `
      SELECT run_id, run_type, target_kind, target_ref, status, attempt
      FROM run
      WHERE run_id = $1
      LIMIT 1
    `,
    [runId],
  );

  return result.rows[0] ?? null;
}

async function findRetryReplay(queryable, originalRunId, idempotencyKey) {
  const result = await queryable.query(
    `
      SELECT run_id
      FROM run
      WHERE input_ref->>'action' = 'retry'
        AND input_ref->>'original_run_id' = $1
        AND input_ref->>'idempotency_key' = $2
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [originalRunId, idempotencyKey],
  );

  return result.rows[0] ?? null;
}

async function findActiveRetry(queryable, originalRunId) {
  const result = await queryable.query(
    `
      SELECT run_id
      FROM run
      WHERE input_ref->>'action' = 'retry'
        AND input_ref->>'original_run_id' = $1
        AND status IN ('pending', 'processing')
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [originalRunId],
  );

  return result.rows[0] ?? null;
}

async function insertRetryRun(queryable, { originalRun, originalRunId, idempotencyKey, reason }) {
  // NOTE: baseline run DDL does not model original_run_id / idempotency_key /
  // retry action as first-class columns. This repository stores those retry
  // metadata fields in run.input_ref JSONB until a dedicated physical model is added.
  const result = await queryable.query(
    `
      INSERT INTO run (
        run_type,
        target_kind,
        target_ref,
        status,
        attempt,
        input_ref
      )
      VALUES (
        $1,
        $2,
        $3,
        'pending',
        $4,
        $5::jsonb
      )
      RETURNING run_id
    `,
    [
      originalRun.run_type,
      originalRun.target_kind,
      originalRun.target_ref,
      originalRun.attempt + 1,
      JSON.stringify({
        action: "retry",
        original_run_id: originalRunId,
        idempotency_key: idempotencyKey,
        reason,
      }),
    ],
  );

  return result.rows[0];
}

async function findReprocessReplay(queryable, targetKind, targetRef, idempotencyKey) {
  const result = await queryable.query(
    `
      SELECT run_id
      FROM run
      WHERE run_type = 'reprocess'
        AND target_kind = $1
        AND target_ref IS NOT DISTINCT FROM $2
        AND input_ref->>'idempotency_key' = $3
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [targetKind, targetRef, idempotencyKey],
  );

  return result.rows[0] ?? null;
}

async function findActiveReprocess(queryable, targetKind, targetRef) {
  const result = await queryable.query(
    `
      SELECT run_id
      FROM run
      WHERE run_type = 'reprocess'
        AND target_kind = $1
        AND target_ref IS NOT DISTINCT FROM $2
        AND status IN ('pending', 'processing')
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [targetKind, targetRef],
  );

  return result.rows[0] ?? null;
}

async function insertReprocessRun(queryable, { idempotencyKey, targetKind, targetRef, reason }) {
  // NOTE: baseline run DDL does not model reprocess idempotency metadata as
  // first-class columns. This repository stores the request metadata in
  // run.input_ref JSONB until a dedicated physical model is added.
  const result = await queryable.query(
    `
      INSERT INTO run (
        run_type,
        target_kind,
        target_ref,
        status,
        attempt,
        input_ref
      )
      VALUES (
        'reprocess',
        $1,
        $2,
        'pending',
        0,
        $3::jsonb
      )
      RETURNING run_id
    `,
    [
      targetKind,
      targetRef,
      JSON.stringify({
        action: "reprocess",
        target_kind: targetKind,
        target_ref: targetRef,
        idempotency_key: idempotencyKey,
        reason,
      }),
    ],
  );

  return result.rows[0];
}

function conflict(code, message) {
  return {
    kind: "conflict",
    body: {
      error: {
        code,
        message,
      },
    },
  };
}

function isUniqueViolation(error) {
  return error && error.code === "23505";
}

module.exports = {
  AuroraRunRepository,
};
