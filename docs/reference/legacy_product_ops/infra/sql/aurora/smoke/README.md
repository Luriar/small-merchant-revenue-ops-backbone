# Aurora Apply And Smoke

This directory is the minimum executable fallback for Aurora apply and smoke verification when a live Aurora session is not available in the current workspace.

## Preconditions

- `psql` is installed.
- `AURORA_DATABASE_URL` or `DATABASE_URL` is set.
- The app is started with Aurora-backed stores when you want API smoke checks.
- The target DB state is identified before apply.
  - Fresh bootstrap DB: baseline may be included.
  - Existing Aurora environment that already has baseline objects: do not re-apply baseline in this step.

Recommended runtime env for API smoke:

```bash
export AURORA_DATABASE_URL='postgres://...'
export CHANGE_STORE_BACKEND=aurora
export EVENT_STORE_BACKEND=aurora
export ISSUE_STORE_BACKEND=aurora
export RUN_STORE_BACKEND=aurora
export TRACE_STORE_BACKEND=aurora
# Optional: enable TLS to managed Aurora endpoints.
# export AURORA_DB_SSLMODE=require
node apps/api/src/aurora-connection-smoke.js
node apps/api/src/server.js
```

Do not paste raw credentials into logs, commits, or shell history you intend to share.

## Before Apply

Required environment variables:

- `AURORA_DATABASE_URL` or `DATABASE_URL`
- `CHANGE_STORE_BACKEND=aurora`
- `EVENT_STORE_BACKEND=aurora`
- `ISSUE_STORE_BACKEND=aurora`
- `RUN_STORE_BACKEND=aurora`
- `TRACE_STORE_BACKEND=aurora`
- Optional: `AURORA_DB_SSLMODE=require` for managed Aurora endpoints that require TLS.

Baseline decision rule:

- Include baseline only when the target Aurora DB is a fresh bootstrap environment and `sources/aurora_ddl_v2.sql` has not been applied yet.
- Do not include baseline when the target Aurora DB already contains the baseline operational tables, triggers, and indexes.
- If the baseline state is unclear, stop and verify object existence first instead of guessing.

## Apply Order

The current apply order is:

1. `sources/aurora_ddl_v2.sql`
2. `infra/sql/aurora/001_change_intake_idempotency.sql`
3. `infra/sql/aurora/002_event_intake.sql`
4. `infra/sql/aurora/003_issue_intake_idempotency.sql`
5. `infra/sql/aurora/004_repository_query_indexes.sql`
6. `infra/sql/aurora/005_run_state_log_insert_bootstrap.sql`
7. `infra/sql/aurora/permissions/001_roles_and_grants.sql`

Apply command:

```bash
bash infra/sql/aurora/apply-post-baseline.sh
```

If you are bootstrapping a fresh database and want the script to include the baseline too:

```bash
APPLY_BASELINE=1 bash infra/sql/aurora/apply-post-baseline.sh
```

Stop immediately if:

- `psql` returns any SQL error during apply.
- The target DB already has a partial apply from the same batch and you do not know which file failed last.
- You cannot confirm whether baseline was already applied.

## Smoke Flow

### 1. API connection bootstrap

Run the app-level connection smoke first:

```bash
node apps/api/src/aurora-connection-smoke.js
```

Expected result:

- `status` is `ok`.
- The configured `*_STORE_BACKEND=aurora` values are listed.
- Required baseline table checks are `ok`.
- The output does not include the raw database URL.

Do not continue if:

- The command cannot connect.
- Any required baseline object is missing.
- The command prints or logs raw credentials.

### 2. Apply-order sanity

Run the base smoke checks first:

```bash
psql "$AURORA_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f infra/sql/aurora/smoke/001_runtime_consistency_checks.sql
```

Expected result:

- `change_intake_idempotency_table`, `event_intake_table`, `issue_intake_idempotency_table` are not null.
- `idx_run_retry_replay_lookup`, `idx_trace_duplicate_lookup`, `idx_evidence_trace_fingerprint_lookup` are not null.
- `trg_log_run_state_insert` is not null.

Do not continue if:

- Any required table, index, or trigger resolves to null.
- The smoke SQL itself errors because an expected baseline object is missing.

### 3. retry / reprocess -> run_state_log bootstrap

Create a new run through the app. Either path is acceptable:

Retry example:

```bash
curl -sS -X POST "http://127.0.0.1:3000/api/v1/runs/<failed-or-dlq-run-id>/retry" \
  -H 'content-type: application/json' \
  -d '{
    "idempotency_key": "smoke-retry-2026-04-23-1",
    "reason": "smoke_retry"
  }'
```

Reprocess example:

```bash
curl -sS -X POST "http://127.0.0.1:3000/api/v1/reprocess" \
  -H 'content-type: application/json' \
  -d '{
    "idempotency_key": "smoke-reprocess-2026-04-23-1",
    "target_kind": "dlq_batch",
    "target_ref": "smoke-dlq-2026-04-23",
    "reason": "smoke_reprocess"
  }'
```

Capture the returned `new_run_id`, then verify DB state:

```bash
psql "$AURORA_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v run_id='<new_run_id>' \
  -f infra/sql/aurora/smoke/001_runtime_consistency_checks.sql
```

Then compare with API output:

```bash
curl -sS "http://127.0.0.1:3000/api/v1/runs/<new_run_id>/state-log"
```

Expected result:

- `run_state_log` contains at least one row for the new run.
- The earliest row has `from_status = null` and `to_status = pending`.
- `GET /api/v1/runs/<new_run_id>/state-log` returns the same ordered rows as `ORDER BY occurred_at ASC, log_id ASC`.

Do not continue if:

- Retry or reprocess request does not return `200` or `202` with a `new_run_id`.
- `run_state_log` has no rows for the new run.
- The earliest state-log row is missing the bootstrap `null -> pending` transition.
- API ordering differs from the DB query result.

### 4. trace / evidence_count consistency

Use existing valid `change_id` and `issue_id` values from Aurora, then create a trace:

```bash
curl -sS -X POST "http://127.0.0.1:3000/api/v1/traces" \
  -H 'content-type: application/json' \
  -d '{
    "change_id": "<existing-change-id>",
    "primary_issue_id": "<existing-issue-id>",
    "anomaly_type": "error",
    "anomaly_metric": "checkout.error_rate",
    "anomaly_window_start": "2026-04-23T10:00:00.000Z",
    "anomaly_window_end": "2026-04-23T10:05:00.000Z",
    "evidences": [
      {
        "evidence_type": "timing",
        "strength": "strong",
        "summary": "metric spike detected",
        "source_ref": "smoke-event-1"
      },
      {
        "evidence_type": "variation",
        "strength": "medium",
        "summary": "variation changed after release",
        "source_ref": "smoke-event-2"
      }
    ]
  }'
```

Capture the returned `trace_id`, then verify DB state:

```bash
psql "$AURORA_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v trace_id='<trace_id>' \
  -f infra/sql/aurora/smoke/001_runtime_consistency_checks.sql
```

Then compare with API output:

```bash
curl -sS "http://127.0.0.1:3000/api/v1/traces/<trace_id>"
curl -sS "http://127.0.0.1:3000/api/v1/traces/<trace_id>/evidences"
```

Expected result:

- `trace.evidence_count` equals `COUNT(evidence.*)` for the same `trace_id`.
- `GET /api/v1/traces/<trace_id>` returns the same `evidence_count` as the DB check.
- `GET /api/v1/traces/<trace_id>/evidences` returns the same evidence rows in creation order.
- The API responses do not expose `anomaly_detail`, evidence `payload`, or raw internal metadata.

Do not continue if:

- Trace create does not return `200` or `201` with a `trace_id`.
- `trace.evidence_count` and actual evidence row count differ.
- `GET /api/v1/traces/<trace_id>` reports a different `evidence_count` than the DB.
- `GET /api/v1/traces/<trace_id>/evidences` is missing rows or returns a different order than the DB query.

## Checklist

- Apply script finishes without SQL error.
- App-level Aurora connection smoke returns `status=ok`.
- Insert-side `run_state_log` trigger exists after apply.
- New retry or reprocess run has an initial `pending` log row.
- New trace has `evidence_count` equal to actual evidence row count.
- Run state-log read path and trace detail read path match the DB state.

## Failure And Recovery Boundary

Use the following minimum stop and recovery rules:

- If apply fails in the middle of the batch, stop the rollout and record the exact failing file and SQL error.
- Do not continue to API smoke until apply-order sanity passes.
- Do not continue from run smoke to trace smoke if `run_state_log` bootstrap is missing or API/DB ordering is inconsistent.
- Do not mark the deployment step complete if `trace.evidence_count` mismatches actual evidence rows.
- If rollback SQL does not exist for the failing step, treat the environment as requiring manual operator review before any retry.

Minimum recovery actions:

- Re-run only after identifying the last successfully applied file.
- Re-run `infra/sql/aurora/smoke/001_runtime_consistency_checks.sql` before retrying API smoke.
- Keep the previous failing `run_id` / `trace_id` as evidence in the execution record instead of deleting rows ad hoc.

## Result Record Template

Copy this template into the deployment record or operator note:

```text
Aurora Apply And Smoke Record

- Executed at:
- Operator:
- Target environment:
- Baseline included: yes | no
- Applied SQL:
  - sources/aurora_ddl_v2.sql (optional)
  - infra/sql/aurora/001_change_intake_idempotency.sql
  - infra/sql/aurora/002_event_intake.sql
  - infra/sql/aurora/003_issue_intake_idempotency.sql
  - infra/sql/aurora/004_repository_query_indexes.sql
  - infra/sql/aurora/005_run_state_log_insert_bootstrap.sql
  - infra/sql/aurora/permissions/001_roles_and_grants.sql
- Apply result:
- Apply-order sanity result:
- run_state_log smoke:
  - new_run_id:
  - bootstrap row present: yes | no
  - API vs DB match: yes | no
- trace.evidence_count smoke:
  - trace_id:
  - DB count match: yes | no
  - API vs DB match: yes | no
- Anomaly found:
- Follow-up action:
```
