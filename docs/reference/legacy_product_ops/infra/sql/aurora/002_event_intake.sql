-- ============================================================================
-- Aurora PostgreSQL DDL — event intake table
-- File: 002_event_intake.sql
--
-- Apply order:
--   1. Apply sources/aurora_ddl_v2.sql baseline first.
--   2. Apply this compatibility DDL after baseline.
--
-- Scope:
--   - Compatibility/backfill Aurora table for POST /api/v1/events/intake
--     in older databases that applied a baseline before this table was folded in
--   - event_id is the authoritative dedupe key
--
-- NOTE:
--   - sources/aurora_ddl_v2.sql now includes this table for clean environments.
--   - This file remains idempotent and safe to run after the current baseline.
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_intake (
  event_id             TEXT          PRIMARY KEY,
  occurred_at          TIMESTAMPTZ   NOT NULL,
  target_service       VARCHAR(100)  NOT NULL,
  event_type           VARCHAR(50)   NOT NULL,
  event_subtype        VARCHAR(100)  NOT NULL,
  variation            VARCHAR(50),
  cohort               VARCHAR(100),
  duration_ms          INTEGER,
  retry_count          INTEGER       NOT NULL DEFAULT 0,
  is_error             BOOLEAN       NOT NULL DEFAULT FALSE,
  user_id              TEXT,
  session_id           TEXT,
  request_id           TEXT,
  payload              JSONB,
  source               VARCHAR(50)   NOT NULL,
  ingestion_batch_id   VARCHAR(100),
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_event_intake_retry_count
    CHECK (retry_count BETWEEN 0 AND 255),
  CONSTRAINT chk_event_intake_duration_ms
    CHECK (duration_ms IS NULL OR duration_ms >= 0),
  CONSTRAINT chk_event_intake_payload_size
    CHECK (pg_column_size(payload) < 1048576)
);

CREATE INDEX IF NOT EXISTS idx_event_intake_service_time
  ON event_intake (target_service, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_intake_type_subtype_time
  ON event_intake (event_type, event_subtype, occurred_at DESC);

COMMENT ON TABLE event_intake IS
  'POST /api/v1/events/intake Aurora intake table. event_id is the authoritative dedupe key.';

COMMENT ON COLUMN event_intake.user_id IS
  'Pseudonymous identifier only. Direct personal identifiers are not intended.';

COMMENT ON COLUMN event_intake.session_id IS
  'Pseudonymous identifier only. Direct personal identifiers are not intended.';

COMMENT ON COLUMN event_intake.request_id IS
  'Pseudonymous identifier only. Direct personal identifiers are not intended.';

COMMENT ON COLUMN event_intake.payload IS
  'Raw payload object. Do not echo in logs or error responses.';
