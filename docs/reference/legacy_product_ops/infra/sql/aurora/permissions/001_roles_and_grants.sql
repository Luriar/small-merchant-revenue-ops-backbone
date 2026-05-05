-- ============================================================================
-- Aurora PostgreSQL Permissions — roles and grants
-- File: 001_roles_and_grants.sql
-- Scope: baseline role separation and append-only protections
--
-- NOTE
--   - This file is intentionally separate from sources/aurora_ddl_v2.sql.
--   - It is designed to be applied after the baseline Aurora DDL creates tables.
--   - It assumes the application tables live in the `public` schema defined by
--     the current baseline DDL.
--   - For ALTER DEFAULT PRIVILEGES to work as intended, run as the owning role
--     for future objects, or as an admin account that manages that role.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1) Role bootstrap
--    Apply order:
--      1. create roles
--      2. grant schema usage / create boundary
--      3. grant table privileges by role intent
--      4. enforce append-only REVOKE on evidence / run_state_log
--      5. set default privileges for future tables
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'migration_role') THEN
    CREATE ROLE migration_role;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_role') THEN
    CREATE ROLE app_role;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'readonly_role') THEN
    CREATE ROLE readonly_role;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'debezium_cdc') THEN
    CREATE ROLE debezium_cdc NOLOGIN;
  END IF;

  -- Required before ALTER DEFAULT PRIVILEGES FOR ROLE migration_role.
  -- PostgreSQL requires the executor to be a member of that role.
  EXECUTE format('GRANT migration_role TO %I', current_user);
END
$$;

-- ============================================================================
-- 2) Schema boundary
--    - migration_role: DDL only intent
--    - runtime roles: object access only, no schema CREATE
-- ============================================================================

GRANT USAGE ON SCHEMA public TO migration_role;
GRANT CREATE ON SCHEMA public TO migration_role;

GRANT USAGE ON SCHEMA public TO app_role;
GRANT USAGE ON SCHEMA public TO readonly_role;
GRANT USAGE ON SCHEMA public TO debezium_cdc;

REVOKE CREATE ON SCHEMA public FROM app_role;
REVOKE CREATE ON SCHEMA public FROM readonly_role;
REVOKE CREATE ON SCHEMA public FROM debezium_cdc;

-- migration_role is for DDL execution only. Do not use it as an API/worker
-- runtime account.
-- NOTE: REVOKE alone does not complete the control boundary. Operationally, the
--       migration_role credential itself must not be used by API/worker/batch
--       runtimes.
REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM migration_role;

-- ============================================================================
-- 3) Runtime privileges
--    Baseline tables from sources/aurora_ddl_v2.sql:
--      cd_mstr, cd_cmmn, prod_change, issue, issue_ops_meta,
--      run, run_state_log, trace, evidence,
--      change_intake_idempotency, event_intake, issue_intake_idempotency
--    Older-baseline compatibility/backfill migrations remain in
--    infra/sql/aurora/001~003 for environments that applied a previous
--    baseline before the intake tables were folded into aurora_ddl_v2.sql.
-- ============================================================================

-- app_role: baseline DML
GRANT SELECT ON TABLE
  cd_mstr,
  cd_cmmn,
  prod_change,
  issue,
  issue_ops_meta,
  run,
  run_state_log,
  trace,
  evidence,
  change_intake_idempotency,
  event_intake,
  issue_intake_idempotency
TO app_role;

GRANT INSERT ON TABLE
  prod_change,
  change_intake_idempotency,
  event_intake,
  issue_intake_idempotency,
  issue,
  issue_ops_meta,
  run,
  trace,
  evidence
TO app_role;

GRANT UPDATE ON TABLE
  prod_change,
  issue,
  issue_ops_meta,
  run,
  trace
TO app_role;

-- readonly_role: query-only access
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_role;

-- debezium_cdc: captured table read access only.
-- This file creates only a safe NOLOGIN role when absent. Environment-specific
-- LOGIN/REPLICATION user bootstrap and slot/publication setup remain separate.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO debezium_cdc;

-- ============================================================================
-- 4) Append-only enforcement
--    - evidence: app_role may SELECT/INSERT only
--    - run_state_log: app_role may SELECT/INSERT
--    - explicit REVOKE keeps the policy visible and defensive
-- ============================================================================

REVOKE UPDATE, DELETE ON TABLE evidence FROM app_role;
REVOKE UPDATE, DELETE ON TABLE change_intake_idempotency FROM app_role;
REVOKE UPDATE, DELETE ON TABLE event_intake FROM app_role;
REVOKE UPDATE, DELETE ON TABLE issue_intake_idempotency FROM app_role;
GRANT INSERT ON TABLE run_state_log TO app_role;
GRANT USAGE ON SEQUENCE run_state_log_log_id_seq TO app_role;
REVOKE UPDATE, DELETE ON TABLE run_state_log FROM app_role;

-- Defensive REVOKE for non-runtime write paths as well.
REVOKE INSERT, UPDATE, DELETE ON TABLE run_state_log FROM readonly_role;
REVOKE INSERT, UPDATE, DELETE ON TABLE run_state_log FROM debezium_cdc;
REVOKE INSERT, UPDATE, DELETE ON TABLE evidence FROM readonly_role;
REVOKE INSERT, UPDATE, DELETE ON TABLE evidence FROM debezium_cdc;
REVOKE INSERT, UPDATE, DELETE ON TABLE change_intake_idempotency FROM readonly_role;
REVOKE INSERT, UPDATE, DELETE ON TABLE change_intake_idempotency FROM debezium_cdc;
REVOKE INSERT, UPDATE, DELETE ON TABLE event_intake FROM readonly_role;
REVOKE INSERT, UPDATE, DELETE ON TABLE event_intake FROM debezium_cdc;
REVOKE INSERT, UPDATE, DELETE ON TABLE issue_intake_idempotency FROM readonly_role;
REVOKE INSERT, UPDATE, DELETE ON TABLE issue_intake_idempotency FROM debezium_cdc;

-- NOTE: current baseline DDL logs run state changes via an AFTER UPDATE trigger
--       on run, and the trigger function is not declared SECURITY DEFINER.
--       To avoid run.status update failure on the trigger path, app_role keeps
--       INSERT on run_state_log. Direct application INSERT remains forbidden by
--       policy; only the trigger path is expected.

-- ============================================================================
-- 5) Default privileges for future objects created by migration_role
--    This keeps role separation visible as the schema expands.
-- ============================================================================

ALTER DEFAULT PRIVILEGES FOR ROLE migration_role IN SCHEMA public
  GRANT SELECT ON TABLES TO readonly_role;

ALTER DEFAULT PRIVILEGES FOR ROLE migration_role IN SCHEMA public
  GRANT SELECT ON TABLES TO debezium_cdc;

ALTER DEFAULT PRIVILEGES FOR ROLE migration_role IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE ON TABLES TO app_role;

ALTER DEFAULT PRIVILEGES FOR ROLE migration_role IN SCHEMA public
  REVOKE DELETE ON TABLES FROM app_role;

-- Preserve append-only defaults for the two sensitive tables via explicit
-- table-level REVOKE above after each migration that creates them.
-- TODO: if later migrations add append-only tables beyond evidence/run_state_log,
--       extend the same explicit REVOKE pattern in a new versioned SQL file.
-- TODO: provision the actual Aurora login users separately and grant these roles
--       to those users in environment-specific secret management.
-- NOTE: Debezium logical replication setup (slot/publication privileges and any
--       Aurora-specific prerequisites) is intentionally handled outside this file.

COMMIT;
