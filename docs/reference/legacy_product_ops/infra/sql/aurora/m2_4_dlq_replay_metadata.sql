-- PROPOSAL ONLY - DO NOT APPLY AUTOMATICALLY
-- M2-4 DLQ / replay metadata storage proposal.
-- This SQL is not applied by this task and does not create runtime infrastructure.
-- Aurora is the operational source of truth for DLQ/replay state.
-- Forbidden storage: raw payloads, full message bodies, secrets, issue raw values,
-- prod_change sensitive values, endpoints, tokens, passwords, and connection strings.
-- JSONB columns below are for safe field names, identifiers, counts, and bounded scope only.

CREATE TABLE IF NOT EXISTS public.cdc_failure (
  failure_id TEXT PRIMARY KEY,
  failure_type TEXT NOT NULL,
  source_topic TEXT NOT NULL,
  source_table TEXT NOT NULL,
  primary_key JSONB NOT NULL DEFAULT '{}'::JSONB,
  op TEXT NOT NULL,
  ts_ms BIGINT NOT NULL,
  observed_field_names JSONB NOT NULL DEFAULT '[]'::JSONB,
  missing_required_fields JSONB NOT NULL DEFAULT '[]'::JSONB,
  unexpected_fields JSONB NOT NULL DEFAULT '[]'::JSONB,
  forbidden_field_names_detected JSONB NOT NULL DEFAULT '[]'::JSONB,
  parser_error_class TEXT NOT NULL,
  parser_error_summary TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'open',
  owner TEXT NOT NULL,
  evidence_report_ref TEXT NOT NULL,
  source_run_id TEXT NULL REFERENCES public.run(run_id) ON DELETE SET NULL,
  latest_replay_request_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_cdc_failure_op CHECK (op IN ('c', 'u', 'd', 'r', 'unknown')),
  CONSTRAINT chk_cdc_failure_attempt_count CHECK (attempt_count >= 0),
  CONSTRAINT chk_cdc_failure_status CHECK (
    status IN (
      'open',
      'triaged',
      'replay_requested',
      'replay_approved',
      'reprocess_requested',
      'reprocess_approved',
      'blocked',
      'resolved',
      'closed_no_replay'
    )
  ),
  CONSTRAINT chk_cdc_failure_primary_key_object CHECK (jsonb_typeof(primary_key) = 'object'),
  CONSTRAINT chk_cdc_failure_observed_fields_array CHECK (jsonb_typeof(observed_field_names) = 'array'),
  CONSTRAINT chk_cdc_failure_missing_fields_array CHECK (jsonb_typeof(missing_required_fields) = 'array'),
  CONSTRAINT chk_cdc_failure_unexpected_fields_array CHECK (jsonb_typeof(unexpected_fields) = 'array'),
  CONSTRAINT chk_cdc_failure_forbidden_fields_array CHECK (jsonb_typeof(forbidden_field_names_detected) = 'array')
);

CREATE TABLE IF NOT EXISTS public.cdc_replay_request (
  replay_request_id TEXT PRIMARY KEY,
  failure_id TEXT NOT NULL REFERENCES public.cdc_failure(failure_id) ON DELETE CASCADE,
  requested_action TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  owner TEXT NOT NULL,
  reason_summary TEXT NOT NULL,
  target_topic TEXT NULL,
  target_table TEXT NULL,
  bounded_scope JSONB NOT NULL DEFAULT '{}'::JSONB,
  idempotency_key TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'requested',
  source_run_id TEXT NULL REFERENCES public.run(run_id) ON DELETE SET NULL,
  new_run_id TEXT NULL REFERENCES public.run(run_id) ON DELETE SET NULL,
  evidence_report_ref TEXT NOT NULL,
  cleanup_status TEXT NOT NULL DEFAULT 'not_started',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_cdc_replay_action CHECK (requested_action IN ('retry', 'replay', 'reprocess')),
  CONSTRAINT chk_cdc_replay_attempt_count CHECK (attempt_count >= 0),
  CONSTRAINT chk_cdc_replay_status CHECK (
    status IN (
      'requested',
      'approved',
      'rejected',
      'running',
      'succeeded',
      'failed',
      'cancelled',
      'cleanup_complete'
    )
  ),
  CONSTRAINT chk_cdc_replay_cleanup_status CHECK (
    cleanup_status IN ('not_started', 'not_required', 'pending', 'complete', 'failed')
  ),
  CONSTRAINT chk_cdc_replay_bounded_scope_object CHECK (jsonb_typeof(bounded_scope) = 'object'),
  CONSTRAINT uq_cdc_replay_idempotency_key UNIQUE (idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.cdc_failure_state_log (
  state_log_id BIGSERIAL PRIMARY KEY,
  failure_id TEXT NOT NULL REFERENCES public.cdc_failure(failure_id) ON DELETE CASCADE,
  replay_request_id TEXT NULL REFERENCES public.cdc_replay_request(replay_request_id) ON DELETE SET NULL,
  from_status TEXT NULL,
  to_status TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  owner TEXT NOT NULL,
  safe_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  evidence_report_ref TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_cdc_failure_state_safe_metadata_object CHECK (jsonb_typeof(safe_metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_cdc_failure_status
  ON public.cdc_failure (status);

CREATE INDEX IF NOT EXISTS idx_cdc_failure_type
  ON public.cdc_failure (failure_type);

CREATE INDEX IF NOT EXISTS idx_cdc_failure_source_topic
  ON public.cdc_failure (source_topic);

CREATE INDEX IF NOT EXISTS idx_cdc_failure_owner
  ON public.cdc_failure (owner);

CREATE INDEX IF NOT EXISTS idx_cdc_failure_first_seen_at
  ON public.cdc_failure (first_seen_at);

CREATE INDEX IF NOT EXISTS idx_cdc_replay_failure
  ON public.cdc_replay_request (failure_id);

CREATE INDEX IF NOT EXISTS idx_cdc_replay_status
  ON public.cdc_replay_request (status);

CREATE INDEX IF NOT EXISTS idx_cdc_replay_owner
  ON public.cdc_replay_request (owner);

CREATE INDEX IF NOT EXISTS idx_cdc_replay_idempotency_key
  ON public.cdc_replay_request (idempotency_key);

CREATE INDEX IF NOT EXISTS idx_cdc_failure_state_log_failure
  ON public.cdc_failure_state_log (failure_id, created_at DESC);
