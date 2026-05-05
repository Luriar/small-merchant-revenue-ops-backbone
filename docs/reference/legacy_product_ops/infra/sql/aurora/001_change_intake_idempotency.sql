-- ============================================================================
-- Aurora PostgreSQL DDL — change intake idempotency ledger
-- File: 001_change_intake_idempotency.sql
--
-- Apply order:
--   1. Apply sources/aurora_ddl_v2.sql baseline first.
--   2. Apply this compatibility DDL after prod_change exists.
--
-- Scope:
--   - Compatibility/backfill ledger for POST /api/v1/changes idempotent replay
--     in older databases that applied a baseline before this table was folded in
--   - Keeps idempotency state outside prod_change because the baseline table
--     does not include an idempotency_key column
--
-- NOTE:
--   - sources/aurora_ddl_v2.sql now includes this table for clean environments.
--   - This file remains idempotent and safe to run after the current baseline.
-- ============================================================================

CREATE TABLE IF NOT EXISTS change_intake_idempotency (
  request_type      VARCHAR(50)   NOT NULL,
  idempotency_key   VARCHAR(255)  NOT NULL,
  change_id         TEXT          NOT NULL
                                 REFERENCES prod_change(change_id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_change_intake_idempotency
    PRIMARY KEY (request_type, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_change_intake_idempotency_change_id
  ON change_intake_idempotency (change_id);

COMMENT ON TABLE change_intake_idempotency IS
  'POST /api/v1/changes idempotent replay ledger. Compatibility migration for older Aurora baselines.';

COMMENT ON COLUMN change_intake_idempotency.request_type IS
  'Current minimal use is change. Kept explicit to make request namespace visible.';

COMMENT ON COLUMN change_intake_idempotency.idempotency_key IS
  'Client-supplied idempotency key for replay-safe change intake.';
