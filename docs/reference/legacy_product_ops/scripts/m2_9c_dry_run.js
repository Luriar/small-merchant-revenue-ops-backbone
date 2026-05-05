#!/usr/bin/env node
/*
 * M2-9C Controlled Runtime Dry-Run Operator Script.
 *
 * Operator runs this once against the confirmed dev target product-ops-dev-aurora
 * via the operator's authorized connection path. Reads connection from PG* env
 * vars or DATABASE_URL. Does not log connection details.
 *
 * Bounds: sample-count 1, time-window 10 minutes wall-clock.
 * Authority: M2-9A GO record + M2-9B SQL apply + M2-9C task.
 * Forbidden: production target, unbounded scope, raw payload exposure.
 *
 * Output: prints a sanitized JSON summary to stdout on success, or a sanitized
 * failure JSON on error. Paste the stdout JSON back into the next M2-9C task.
 * Do not paste stderr containing shell prompts, connection details, or psql noise.
 */

const path = require("path");
const { Client } = require("pg");
const {
  AuroraCdcRecoveryRepository,
  CdcRecoveryPersistenceError,
} = require(path.join(
  __dirname,
  "..",
  "apps",
  "api",
  "src",
  "cdc-recovery",
  "cdc-recovery-aurora-repository",
));

const TIME_WINDOW_MS = 10 * 60 * 1000;
const EVIDENCE_REPORT_REF = "docs/runtime_evidence/m2_9_dev_dry_run_20260504.md";
const OWNER = "Yoon Joonho";

function makeDbAdapter(client) {
  return {
    query: (text, values) => client.query(text, values),
    async withTransaction(work) {
      await client.query("BEGIN");
      try {
        const result = await work({
          query: (text, values) => client.query(text, values),
        });
        await client.query("COMMIT");
        return result;
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch (_rollbackErr) {
          // swallow rollback errors; the original error is what matters
        }
        throw err;
      }
    },
  };
}

function safeErrorClassification(err) {
  if (err instanceof CdcRecoveryPersistenceError) {
    return {
      mapped: "CdcRecoveryPersistenceError",
      code: err.code,
      statusCode: err.statusCode,
    };
  }
  if (err && typeof err.code === "string") {
    return { mapped: "pg_error_code_only", code: err.code };
  }
  return { mapped: "unknown_safe", code: null };
}

function buildClientOptions() {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL };
  }
  return {};
}

async function main() {
  const startedAt = Date.now();
  const ts = startedAt;
  const failureId = `m2_9c_dryrun_${ts}_failure`;
  const idempotencyKey = `m2_9c_dryrun_${ts}_idem`;

  const summary = {
    target_safe_label: "product-ops-dev-aurora",
    sample_count: 1,
    time_window_minutes: 10,
    evidence_report_ref: EVIDENCE_REPORT_REF,
    failure_id_pattern: "m2_9c_dryrun_<ts>_failure",
    idempotency_key_pattern: "m2_9c_dryrun_<ts>_idem",
    started_at_iso: new Date(startedAt).toISOString(),
    identity_safe_summary: null,
    pre_state_counts_for_synthetic_id: null,
    steps: {},
    cleanup: {},
    timing: {},
  };

  const watchdog = setTimeout(() => {
    console.error(
      JSON.stringify(
        { fatal: true, reason: "time_window_exceeded", time_window_minutes: 10 },
        null,
        2,
      ),
    );
    process.exit(2);
  }, TIME_WINDOW_MS);
  watchdog.unref();

  const client = new Client(buildClientOptions());
  await client.connect();

  let replayRequestId = null;

  try {
    const identity = await client.query(
      "SELECT current_database() AS db, current_user AS usr, current_schema() AS sch",
    );
    summary.identity_safe_summary = {
      db: identity.rows[0].db,
      usr: identity.rows[0].usr,
      sch: identity.rows[0].sch,
    };
    const currentDb = String(identity.rows[0].db || "").toLowerCase();
    const allowedDb = String(process.env.M2_9C_ALLOWED_DATABASE || "productops").toLowerCase();

    const obviousProductionDb =
      currentDb === "prod" ||
      currentDb === "production" ||
      currentDb.endsWith("_prod") ||
      currentDb.endsWith("-prod") ||
      currentDb.endsWith("_production") ||
      currentDb.endsWith("-production") ||
      currentDb.includes("production");

    if (currentDb !== allowedDb) {
      throw new Error("refusing to run: target database is not the explicit M2-9C allowed dev database");
    }

    if (obviousProductionDb) {
      throw new Error("refusing to run: target database matches an explicit production-like name");
    }

    const preCounts = await client.query(
      `SELECT
         (SELECT count(*)::int FROM public.cdc_failure          WHERE failure_id = $1) AS f,
         (SELECT count(*)::int FROM public.cdc_replay_request   WHERE failure_id = $1) AS rr,
         (SELECT count(*)::int FROM public.cdc_failure_state_log WHERE failure_id = $1) AS sl`,
      [failureId],
    );
    summary.pre_state_counts_for_synthetic_id = preCounts.rows[0];
    if (
      preCounts.rows[0].f !== 0 ||
      preCounts.rows[0].rr !== 0 ||
      preCounts.rows[0].sl !== 0
    ) {
      throw new Error("refusing to run: synthetic failure_id already has rows");
    }

    await client.query(
      `INSERT INTO public.cdc_failure (
         failure_id, failure_type, source_topic, source_table, primary_key, op, ts_ms,
         observed_field_names, missing_required_fields, unexpected_fields,
         forbidden_field_names_detected, parser_error_class, parser_error_summary,
         first_seen_at, last_seen_at, attempt_count, status, owner, evidence_report_ref
       ) VALUES (
         $1, 'unknown_field', 'dev_topic_synthetic', 'dev_table_synthetic',
         '{"id": "dev_pk_synthetic"}'::jsonb, 'u', $2,
         '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
         'dev_synthetic_class', 'dev synthetic dry-run failure',
         NOW(), NOW(), 1, 'open', $3, $4
       )`,
      [failureId, ts, OWNER, EVIDENCE_REPORT_REF],
    );
    summary.steps.seed_synthetic_failure = { ok: true };

    const repo = new AuroraCdcRecoveryRepository({ db: makeDbAdapter(client) });

    const r1 = await repo.createReplayRequest({
      failure_id: failureId,
      requested_action: "replay",
      requester_ref: OWNER,
      owner: OWNER,
      reason_summary: "M2-9C dry-run synthetic",
      bounded_scope: {
        sample_count: 1,
        time_window_minutes: 10,
        environment: "dev",
      },
      idempotency_key: idempotencyKey,
      evidence_report_ref: EVIDENCE_REPORT_REF,
    });
    summary.steps.create_replay_request = {
      ok: r1 != null && r1.status === "requested" && r1.failure_id === failureId,
      observed_status: r1 ? r1.status : null,
      observed_cleanup_status: r1 ? r1.cleanup_status : null,
      replay_request_id_present:
        r1 != null &&
        typeof r1.replay_request_id === "string" &&
        r1.replay_request_id.length > 0,
      response_field_count: r1 ? Object.keys(r1).length : 0,
    };
    replayRequestId = r1 && r1.replay_request_id;

    const r2 = await repo.findReplayRequestByIdempotencyKey(idempotencyKey);
    summary.steps.idempotency_duplicate_lookup = {
      ok: r2 != null && r2.replay_request_id === replayRequestId,
      same_replay_request_id: r2 != null && r2.replay_request_id === replayRequestId,
    };

    let conflict = null;
    try {
      await repo.createReplayRequest({
        failure_id: failureId,
        requested_action: "replay",
        requester_ref: OWNER,
        owner: OWNER,
        reason_summary: "M2-9C dry-run duplicate attempt",
        bounded_scope: { sample_count: 1 },
        idempotency_key: idempotencyKey,
        evidence_report_ref: EVIDENCE_REPORT_REF,
      });
      conflict = { ok: false, reason: "duplicate INSERT did not throw" };
    } catch (err) {
      conflict = {
        ok: err instanceof CdcRecoveryPersistenceError,
        safe_class: safeErrorClassification(err),
      };
    }
    summary.steps.idempotency_conflict_rejected = conflict;

    const sl = await repo.appendFailureStateLog({
      failure_id: failureId,
      replay_request_id: replayRequestId,
      from_status: "open",
      to_status: "replay_requested",
      reason_code: "m2_9c_dryrun_transition",
      owner: OWNER,
      safe_metadata: { dry_run: true, sample_count: 1 },
      evidence_report_ref: EVIDENCE_REPORT_REF,
    });
    summary.steps.state_log_appended = {
      ok:
        sl != null &&
        sl.to_status === "replay_requested" &&
        sl.failure_id === failureId,
      from_status: sl ? sl.from_status : null,
      to_status: sl ? sl.to_status : null,
      state_log_id_present: sl != null && sl.state_log_id != null,
    };

    const validF = await repo.updateFailureStatus(failureId, {
      from_status: "open",
      to_status: "replay_requested",
      replay_request_id: replayRequestId,
    });
    summary.steps.valid_failure_transition = {
      ok: validF != null && validF.status === "replay_requested",
      observed_status: validF ? validF.status : null,
    };

    const invalidF = await repo.updateFailureStatus(failureId, {
      from_status: "open",
      to_status: "closed_no_replay",
    });
    summary.steps.invalid_failure_transition_rejected = {
      ok: invalidF == null,
      result_was_null: invalidF == null,
    };

    const validRR = await repo.updateReplayRequestStatus(replayRequestId, {
      from_status: "requested",
      to_status: "approved",
    });
    summary.steps.valid_replay_request_transition = {
      ok: validRR != null && validRR.status === "approved",
      observed_status: validRR ? validRR.status : null,
      approved_at_present: validRR != null && validRR.approved_at != null,
    };

    const invalidRR = await repo.updateReplayRequestStatus(replayRequestId, {
      from_status: "requested",
      to_status: "cancelled",
    });
    summary.steps.invalid_replay_request_transition_rejected = {
      ok: invalidRR == null,
      result_was_null: invalidRR == null,
    };
  } finally {
    try {
      const del = await client.query(
        "DELETE FROM public.cdc_failure WHERE failure_id = $1",
        [failureId],
      );
      summary.cleanup.failure_rows_deleted =
        typeof del.rowCount === "number" ? del.rowCount : null;
    } catch (err) {
      summary.cleanup.failure_delete_error_safe_class = safeErrorClassification(err);
    }

    try {
      const post = await client.query(
        `SELECT
           (SELECT count(*)::int FROM public.cdc_failure          WHERE failure_id = $1) AS f,
           (SELECT count(*)::int FROM public.cdc_replay_request   WHERE failure_id = $1) AS rr,
           (SELECT count(*)::int FROM public.cdc_failure_state_log WHERE failure_id = $1) AS sl`,
        [failureId],
      );
      summary.cleanup.post_state_counts_for_synthetic_id = post.rows[0];
      summary.cleanup.cleanup_complete =
        post.rows[0].f === 0 && post.rows[0].rr === 0 && post.rows[0].sl === 0;
    } catch (err) {
      summary.cleanup.post_count_error_safe_class = safeErrorClassification(err);
    }

    try {
      await client.end();
    } catch (_endErr) {
      // ignore connection-end errors; nothing safe to add
    }
  }

  const completedAt = Date.now();
  summary.timing.elapsed_ms = completedAt - startedAt;
  summary.timing.within_bound = summary.timing.elapsed_ms <= TIME_WINDOW_MS;
  summary.completed_at_iso = new Date(completedAt).toISOString();

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(
    JSON.stringify(
      {
        fatal: true,
        safe_class: safeErrorClassification(err),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
