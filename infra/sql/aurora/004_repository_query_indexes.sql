-- ============================================================================
-- Aurora PostgreSQL DDL — post-baseline repository query indexes
-- File: 004_repository_query_indexes.sql
--
-- Apply order:
--   1. Apply sources/aurora_ddl_v2.sql baseline first.
--   2. Apply post-baseline intake tables and ledgers.
--   3. Apply this index hardening SQL after the baseline run/trace/evidence tables exist.
--
-- Scope:
--   - Minimal index hardening for currently implemented repository queries only
--   - Do not widen beyond the actual query predicates in apps/api repositories
--
-- NOTE:
--   - This file intentionally does not modify the baseline DDL.
--   - These indexes are follow-up runtime assets for the current API query patterns.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- run retry replay lookup
-- Query:
--   apps/api/src/aurora-run-repository.js :: findRetryReplay()
-- Predicate:
--   input_ref->>'action' = 'retry'
--   input_ref->>'original_run_id' = $1
--   input_ref->>'idempotency_key' = $2
-- Order:
--   created_at DESC
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_run_retry_replay_lookup
  ON run (
    (input_ref->>'original_run_id'),
    (input_ref->>'idempotency_key'),
    created_at DESC
  )
  WHERE input_ref->>'action' = 'retry';

COMMENT ON INDEX idx_run_retry_replay_lookup IS
  'Repository hardening: findRetryReplay() by retry original_run_id + idempotency_key ordered by created_at DESC.';

-- ----------------------------------------------------------------------------
-- run active retry guard lookup
-- Query:
--   apps/api/src/aurora-run-repository.js :: findActiveRetry()
-- Predicate:
--   input_ref->>'action' = 'retry'
--   input_ref->>'original_run_id' = $1
--   status IN (''pending'',''processing'')
-- Order:
--   created_at DESC
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_run_retry_active_guard
  ON run (
    (input_ref->>'original_run_id'),
    status,
    created_at DESC
  )
  WHERE input_ref->>'action' = 'retry'
    AND status IN ('pending', 'processing');

COMMENT ON INDEX idx_run_retry_active_guard IS
  'Repository hardening: findActiveRetry() by retry original_run_id + active status ordered by created_at DESC.';

-- ----------------------------------------------------------------------------
-- run reprocess replay lookup
-- Query:
--   apps/api/src/aurora-run-repository.js :: findReprocessReplay()
-- Predicate:
--   run_type = ''reprocess''
--   target_kind = $1
--   target_ref IS NOT DISTINCT FROM $2
--   input_ref->>''idempotency_key'' = $3
-- Order:
--   created_at DESC
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_run_reprocess_replay_lookup
  ON run (
    target_kind,
    target_ref,
    (input_ref->>'idempotency_key'),
    created_at DESC
  )
  WHERE run_type = 'reprocess';

COMMENT ON INDEX idx_run_reprocess_replay_lookup IS
  'Repository hardening: findReprocessReplay() by target_kind + target_ref + idempotency_key ordered by created_at DESC.';

-- ----------------------------------------------------------------------------
-- run active reprocess guard lookup
-- Query:
--   apps/api/src/aurora-run-repository.js :: findActiveReprocess()
-- Predicate:
--   run_type = ''reprocess''
--   target_kind = $1
--   target_ref IS NOT DISTINCT FROM $2
--   status IN (''pending'',''processing'')
-- Order:
--   created_at DESC
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_run_reprocess_active_guard
  ON run (
    target_kind,
    target_ref,
    status,
    created_at DESC
  )
  WHERE run_type = 'reprocess'
    AND status IN ('pending', 'processing');

COMMENT ON INDEX idx_run_reprocess_active_guard IS
  'Repository hardening: findActiveReprocess() by target_kind + target_ref + active status ordered by created_at DESC.';

-- ----------------------------------------------------------------------------
-- trace duplicate key lookup
-- Query:
--   apps/api/src/aurora-trace-repository.js :: findDuplicateTrace()
-- Predicate:
--   status = ''suspected''
--   change_id = $1
--   primary_issue_id = $2
--   anomaly_type = $3
--   anomaly_metric = $4
--   anomaly_window_start = $5
--   anomaly_window_end = $6
-- Order:
--   created_at DESC
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_trace_duplicate_lookup
  ON trace (
    change_id,
    primary_issue_id,
    anomaly_type,
    anomaly_metric,
    anomaly_window_start,
    anomaly_window_end,
    created_at DESC
  )
  WHERE status = 'suspected';

COMMENT ON INDEX idx_trace_duplicate_lookup IS
  'Repository hardening: findDuplicateTrace() by suspected duplicate trace key ordered by created_at DESC.';

-- ----------------------------------------------------------------------------
-- evidence fingerprint duplicate lookup
-- Query:
--   apps/api/src/aurora-trace-repository.js :: findDuplicateEvidence()
-- Predicate:
--   trace_id = $1
--   payload->>''fingerprint'' = $2
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_evidence_trace_fingerprint_lookup
  ON evidence (
    trace_id,
    (payload->>'fingerprint')
  )
  WHERE payload ? 'fingerprint';

COMMENT ON INDEX idx_evidence_trace_fingerprint_lookup IS
  'Repository hardening: findDuplicateEvidence() by trace_id + payload fingerprint.';
