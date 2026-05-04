# infra/sql/aurora

Aurora is the operational source of truth for this project.

Place Aurora schema and runtime-adjacent SQL artifacts here, following the implementation order from the source documents.

Current apply order for local implementation assets:
- `sources/aurora_ddl_v2.sql`
- `infra/sql/aurora/001_change_intake_idempotency.sql`
- `infra/sql/aurora/002_event_intake.sql`
- `infra/sql/aurora/003_issue_intake_idempotency.sql`
- `infra/sql/aurora/004_repository_query_indexes.sql`
- `infra/sql/aurora/005_run_state_log_insert_bootstrap.sql`
- `infra/sql/aurora/permissions/001_roles_and_grants.sql`

Baseline / compatibility note:
- `sources/aurora_ddl_v2.sql` is now self-contained for the intake schema used by current API repositories.
- `001_change_intake_idempotency.sql`, `002_event_intake.sql`, and `003_issue_intake_idempotency.sql` are retained as compatibility/backfill migrations for older local or dev databases that applied an earlier baseline before those intake objects were folded into `sources/aurora_ddl_v2.sql`.
- Applying the post-baseline script after the current baseline remains safe because these migrations use idempotent `IF NOT EXISTS` DDL.
- New clean environments may rely on the baseline alone for these intake objects, but running the post-baseline script is still safe and keeps older environments converged.
- Do not remove the 001/002/003 compatibility migrations until the project intentionally drops support for older local/dev databases.

Operational helpers:
- `infra/sql/aurora/apply-post-baseline.sh` applies the current post-baseline SQL assets in order and can optionally include the baseline with `APPLY_BASELINE=1`.
- `infra/sql/aurora/smoke/001_runtime_consistency_checks.sql` provides `psql` smoke checks for apply-order objects, `run_state_log` bootstrap, and `trace.evidence_count` consistency.
- `infra/sql/aurora/smoke/README.md` documents the `psql` and `curl` smoke flow with expected results.

Post-baseline assets:
- `change_intake_idempotency` compatibility migration backfills the `POST /api/v1/changes` replay ledger for older baselines.
- `event_intake` compatibility migration backfills the `POST /api/v1/events/intake` Aurora intake table for older baselines.
- `issue_intake_idempotency` compatibility migration backfills the `POST /api/v1/issues/intake` fallback ledger for older baselines.
- `repository_query_indexes` is a post-baseline index hardening asset for current run/trace/evidence repository lookups.
- `run_state_log_insert_bootstrap` is a post-baseline trigger hardening asset so fresh run INSERTs also appear in run_state_log.
- Aurora grants should allow `app_role` to `SELECT/INSERT` these intake tables.
