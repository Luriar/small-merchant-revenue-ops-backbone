-- ============================================================================
-- Aurora PostgreSQL DDL — run_state_log insert bootstrap hardening
-- File: 005_run_state_log_insert_bootstrap.sql
--
-- Apply order:
--   1. Apply sources/aurora_ddl_v2.sql baseline first.
--   2. Apply post-baseline tables/indexes.
--   3. Apply this trigger hardening SQL after run and run_state_log exist.
--
-- Scope:
--   - Minimal hardening for fresh run creation so run_state_log reflects the
--     initial run status row as well as later status transitions.
--   - Supports current Aurora-backed retry/reprocess write paths that insert a
--     new run row directly with status='pending'.
--
-- NOTE:
--   - Baseline DDL already auto-logs UPDATE OF run.status.
--   - This file adds the missing INSERT-side bootstrap entry only.
--   - Append-only principle is preserved because the log is still trigger-owned.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Query / flow supported:
--   apps/api/src/aurora-run-repository.js
--   - insertRetryRun()
--   - insertReprocessRun()
--
-- Problem:
--   Baseline trigger logs only AFTER UPDATE OF run.status.
--   Fresh run INSERTs therefore have no initial run_state_log row unless a
--   later status transition occurs.
--
-- Fix:
--   Add an AFTER INSERT trigger that appends one bootstrap row:
--   from_status = NULL, to_status = NEW.status
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_log_run_state_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO run_state_log (run_id, from_status, to_status, attempt, reason, metadata)
  VALUES (
    NEW.run_id,
    NULL,
    NEW.status,
    NEW.attempt,
    'auto-logged by insert trigger',
    jsonb_build_object('error_class', NEW.error_class)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_run_state_insert_log ON run;
CREATE TRIGGER trg_run_state_insert_log
  AFTER INSERT ON run
  FOR EACH ROW EXECUTE FUNCTION trg_log_run_state_insert();

COMMENT ON FUNCTION trg_log_run_state_insert() IS
  'Post-baseline hardening: append initial run_state_log row on run INSERT so fresh runs are visible in state-log read path.';
