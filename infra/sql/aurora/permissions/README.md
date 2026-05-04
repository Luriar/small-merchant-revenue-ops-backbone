# infra/sql/aurora/permissions

Aurora role and grant SQL for the runtime schema.

Role model:
- `migration_role`: schema owner / DDL path only. Do not use it as an API,
  worker, or batch runtime identity.
- `app_role`: runtime DML for API/worker paths. It has the table access needed
  by current repositories while keeping evidence and audit history append-only.
- `readonly_role`: read-only access.
- `debezium_cdc`: CDC read role. This SQL creates a safe `NOLOGIN` role if it is
  absent; environment-specific login, replication, slot, and publication
  bootstrap stays outside this permission file.

Auditability notes:
- `evidence` stays `SELECT/INSERT` only for `app_role`; `UPDATE` and `DELETE`
  are intentionally revoked.
- `run_state_log` stays `SELECT/INSERT` only for `app_role` because current
  trigger functions are not `SECURITY DEFINER`; `UPDATE` and `DELETE` are
  intentionally revoked.
- `app_role` has `USAGE` on `run_state_log_log_id_seq` so trigger-owned inserts
  into the `BIGSERIAL` audit log key do not fail at runtime.
