\set ON_ERROR_STOP on

\echo '== Aurora apply-order object checks =='
SELECT to_regclass('public.change_intake_idempotency') AS change_intake_idempotency_table;
SELECT to_regclass('public.event_intake') AS event_intake_table;
SELECT to_regclass('public.issue_intake_idempotency') AS issue_intake_idempotency_table;
SELECT to_regclass('public.idx_run_retry_replay_lookup') AS idx_run_retry_replay_lookup;
SELECT to_regclass('public.idx_trace_duplicate_lookup') AS idx_trace_duplicate_lookup;
SELECT to_regclass('public.idx_evidence_trace_fingerprint_lookup') AS idx_evidence_trace_fingerprint_lookup;
SELECT to_regprocedure('trg_log_run_state_insert()') AS trg_log_run_state_insert;

\if :{?run_id}
\echo '== run_state_log bootstrap checks =='
SELECT run_id, run_type, status, attempt, created_at
FROM run
WHERE run_id = :'run_id';

SELECT log_id, run_id, from_status, to_status, attempt, occurred_at
FROM run_state_log
WHERE run_id = :'run_id'
ORDER BY occurred_at ASC, log_id ASC;

SELECT
  run_id,
  CASE
    WHEN COUNT(*) >= 1 THEN 'ok'
    ELSE 'missing'
  END AS state_log_presence,
  CASE
    WHEN BOOL_OR(from_status IS NULL AND to_status = 'pending') THEN 'ok'
    ELSE 'missing_initial_pending'
  END AS initial_pending_row
FROM run_state_log
WHERE run_id = :'run_id'
GROUP BY run_id;
\endif

\if :{?trace_id}
\echo '== trace / evidence_count checks =='
SELECT trace_id, status, evidence_count, created_at
FROM trace
WHERE trace_id = :'trace_id';

SELECT evidence_id, trace_id, evdt_cd, evds_cd, summary, created_at
FROM evidence
WHERE trace_id = :'trace_id'
ORDER BY created_at ASC, evidence_id ASC;

SELECT
  t.trace_id,
  t.evidence_count AS trace_evidence_count,
  COUNT(e.evidence_id)::integer AS actual_evidence_rows,
  CASE
    WHEN t.evidence_count = COUNT(e.evidence_id)::integer THEN 'ok'
    ELSE 'mismatch'
  END AS evidence_count_check
FROM trace t
LEFT JOIN evidence e ON e.trace_id = t.trace_id
WHERE t.trace_id = :'trace_id'
GROUP BY t.trace_id, t.evidence_count;
\endif
