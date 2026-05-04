-- M2-4 DLQ replay metadata rollback. DEV ONLY.
-- Authorized by M2-9A GO record: docs/m2_9a_sql_apply_go_no_go_decision_kr.md.
-- Reviewed by rollback owner: Yoon Joonho.
-- Cleanup owner: Yoon Joonho.
-- Target environment: dev only (product-ops-dev-aurora).
--
-- DO NOT RUN AGAINST PRODUCTION.
-- DO NOT RUN UNLESS M2-9B SQL apply of
-- infra/sql/aurora/m2_4_dlq_replay_metadata.sql failed in a way that requires
-- safe rollback and the rollback path is still clearly safe.
--
-- Drops the three M2-4 CDC replay metadata tables in reverse foreign-key
-- dependency order. Inline check constraints, the unique constraint
-- uq_cdc_replay_idempotency_key, and the ten M2-4 indexes auto-drop with
-- their parent tables. The DROP statements use IF EXISTS so partial-apply
-- states are handled idempotently. Wrapped in a single transaction so that
-- if any DROP raises an unexpected error (for example because an external
-- object that is not part of M2-4 references one of these tables) the
-- rollback aborts cleanly without leaving the schema in an in-between state.
--
-- Affected objects: public.cdc_failure_state_log, public.cdc_replay_request,
-- public.cdc_failure, and the indexes/constraints created together with them
-- by infra/sql/aurora/m2_4_dlq_replay_metadata.sql.
-- Unaffected objects: public.run, all earlier numbered migrations, and any
-- non-M2-4 tables.

BEGIN;

DROP TABLE IF EXISTS public.cdc_failure_state_log;
DROP TABLE IF EXISTS public.cdc_replay_request;
DROP TABLE IF EXISTS public.cdc_failure;

COMMIT;
