-- ============================================================================
-- M2-1 Aurora Publication — Traceability-Safe CDC Boundary
-- ============================================================================
--
-- This SQL prepares the source-side publication for the M2-1 minimum vertical
-- slice:
--
--   public.prod_change -> public.trace -> safe public.issue CDC -> ClickHouse
--
-- It is a contract/alignment artifact. Applying it must be done separately by
-- the migration owner after cost, rollback, CDC, and privacy checks.
--
-- Principles:
--   - Aurora remains the operational source of truth.
--   - ClickHouse receives evidence-safe operational columns only.
--   - Raw opaque payloads and actor identity fields are excluded before Kafka.
--   - Do not use FOR ALL TABLES or FOR TABLES IN SCHEMA.
--
-- PostgreSQL/Aurora requirement:
--   Publication column lists require PostgreSQL 15+.
-- ============================================================================

-- Replica identity policy:
-- All three M2-1 source tables have primary keys, and the publication column
-- lists include those primary key columns. M2-1 intentionally uses DEFAULT
-- replica identity instead of FULL because FULL increases WAL volume and can
-- make excluded raw columns relevant to UPDATE/DELETE replication behavior.
--
-- If DELETE events later require full non-key values in ClickHouse, prefer a
-- source-side safe CDC/outbox table over REPLICA IDENTITY FULL on raw tables.
ALTER TABLE public.prod_change REPLICA IDENTITY DEFAULT;
ALTER TABLE public.trace REPLICA IDENTITY DEFAULT;
ALTER TABLE public.issue REPLICA IDENTITY DEFAULT;

-- Run once in an environment where the publication does not already exist.
-- If it already exists, use a controlled ALTER PUBLICATION migration instead
-- of dropping shared replication state.
CREATE PUBLICATION m2_1_traceability_pub
FOR TABLE
  public.prod_change (
    change_id,
    chgt_cd,
    title,
    target_service,
    target_component,
    variation,
    cohort,
    source,
    occurred_at,
    received_at,
    created_at,
    updated_at
  ),
  public.trace (
    trace_id,
    change_id,
    primary_issue_id,
    status,
    confidence,
    anomaly_window_start,
    anomaly_window_end,
    anomaly_type,
    anomaly_metric,
    anomaly_detail,
    linked_event_count,
    linked_issue_count,
    evidence_count,
    generated_by_run_id,
    created_at,
    updated_at
  ),
  public.issue (
    issue_id,
    external_id,
    source,
    issue_family,
    severity,
    status,
    keywords,
    affected_variation,
    occurred_at,
    received_at,
    resolved_at,
    created_at,
    updated_at
  )
WITH (publish = 'insert, update, delete');

-- Sensitive/high-volume fields intentionally excluded:
--   public.prod_change.rule_scope
--   public.prod_change.payload
--   public.prod_change.actor
--   public.issue.title
--   public.issue.body
--   public.issue.payload
--   public.issue.reporter
--   created_by / updated_by audit actor fields
--
-- END OF M2-1 TRACEABILITY PUBLICATION
