-- ============================================================================
-- Aurora PostgreSQL DDL — issue intake idempotency ledger
-- File: 003_issue_intake_idempotency.sql
--
-- Apply order:
--   1. Apply sources/aurora_ddl_v2.sql baseline first.
--   2. Apply this compatibility DDL after the baseline issue table exists.
--
-- Scope:
--   - Compatibility/backfill fallback ledger for POST /api/v1/issues/intake
--     in older databases that applied a baseline before this table was folded in
--   - Used only when (source, external_id) is absent or not matched
--
-- NOTE:
--   - sources/aurora_ddl_v2.sql now includes this table for clean environments.
--   - This file remains idempotent and safe to run after the current baseline.
-- ============================================================================

CREATE TABLE IF NOT EXISTS issue_intake_idempotency (
  request_type      VARCHAR(50)   NOT NULL,
  idempotency_key   VARCHAR(255)  NOT NULL,
  issue_id          TEXT          NOT NULL
                                 REFERENCES issue(issue_id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_issue_intake_idempotency
    PRIMARY KEY (request_type, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_issue_intake_idempotency_issue_id
  ON issue_intake_idempotency (issue_id);

COMMENT ON TABLE issue_intake_idempotency IS
  'POST /api/v1/issues/intake fallback idempotent replay ledger. Compatibility migration for older Aurora baselines.';

COMMENT ON COLUMN issue_intake_idempotency.request_type IS
  'Current minimal use is issue. Kept explicit to make request namespace visible.';

COMMENT ON COLUMN issue_intake_idempotency.idempotency_key IS
  'Client-supplied idempotency key for replay-safe issue intake fallback.';
