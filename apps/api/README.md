# apps/api

Intake API, query API, and reliability workflow runtime code live here.

For the per-endpoint contract status, intended actor, evidence/operational role, auth, idempotency/locking rules, and remaining alignment TODO, see [`docs/contract-alignment-ledger.md`](../../docs/contract-alignment-ledger.md). That ledger is the durable arbitration record when implementation and OpenAPI drift.

## Runtime Stack

- CommonJS modules.
- Node's built-in `http` server.
- `node:test` for API tests.
- No API-local `package.json` or `tsconfig.json` exists yet; run API checks directly with `node`.

Current minimal vertical slice:
- `POST /api/v1/changes`
- `POST /api/v1/events/intake`
- `POST /api/v1/issues/intake`
- `POST /api/v1/runs/{run_id}/retry`
- `POST /api/v1/reprocess`
- `POST /api/v1/traces` (internal/worker-only; not part of the OpenAPI v0.2 public contract)
- `GET /api/v1/runs/{run_id}`

Implementation is intentionally framework-light and uses Node's built-in HTTP server for now.
`POST /api/v1/changes` can switch between in-memory and Aurora-backed store via environment configuration.
`POST /api/v1/events/intake` can also switch between in-memory and Aurora-backed store via environment configuration.
`POST /api/v1/issues/intake` can also switch between in-memory and Aurora-backed store via environment configuration.
`POST /api/v1/runs/{run_id}/retry` and `POST /api/v1/reprocess` can also switch between in-memory and Aurora-backed store via environment configuration.
`POST /api/v1/traces` can also switch between in-memory and Aurora-backed store via environment configuration.
Trace creation is pipeline-generated. `POST /api/v1/traces` exists to support the future trace-generation worker and current tests that validate atomic trace + evidence creation with duplicate guards. Public consumers should not call it directly.
`GET /api/v1/runs` reads from the run store and returns a minimal safe projection without exposing raw `input_ref`.
`GET /api/v1/runs/{run_id}` reads one run from the run store and returns the same minimal safe projection, with optional retry summary fields only.

## Server Modes

- Imported `createServer()` keeps the existing store-backed behavior. Tests that inject stores should continue to exercise those handlers directly.
- `createServer({ readPathSkeleton: true })` enables the static OpenAPI-shaped read-path skeleton when no read stores are injected and no Aurora read backend is configured.
- Standalone startup currently enables `readPathSkeleton: true` for local contract testing.
- Future Aurora-backed mode should replace skeleton responses when real read repositories are configured.

The read-path skeleton exists only as a contract-shaped frontend/API foundation. It is not a database integration and should not leak into tests that expect injected store-backed behavior. The route layer calls `read-path-static-repository.js`, which is the boundary future Aurora/ClickHouse read repositories should replace.

## Aurora Runtime Bootstrap

Minimum Aurora-backed API configuration:

```bash
export AURORA_DATABASE_URL='postgres://...'
export CHANGE_STORE_BACKEND=aurora
export EVENT_STORE_BACKEND=aurora
export ISSUE_STORE_BACKEND=aurora
export RUN_STORE_BACKEND=aurora
export TRACE_STORE_BACKEND=aurora
```

`DATABASE_URL` is accepted as a fallback when `AURORA_DATABASE_URL` is not set. Set `AURORA_DB_SSLMODE=require` when the target Aurora environment requires SSL. The API runtime image must provide the existing lazy-loaded `pg` module before any Aurora-backed store is used.

Run the read-only connection smoke before starting API traffic:

```bash
node apps/api/src/aurora-connection-smoke.js
```

The smoke script validates startup configuration, runs `SELECT 1`, and checks that required Aurora baseline tables resolve through `to_regclass`. It does not write data, does not start ClickHouse or CDC work, and does not print the database URL.

## Read-Path Skeleton

Static skeleton responses are available for:

- `GET /api/v1/dashboard/overview`
- `GET /api/v1/dashboard/timeline`
- `GET /api/v1/traces`
- `GET /api/v1/traces/:trace_id`
- `GET /api/v1/traces/:trace_id/evidences`
- `GET /api/v1/traces/:trace_id/primary-issue`
- `GET /api/v1/changes`
- `GET /api/v1/runs/overview`
- `GET /api/v1/runs/failures`
- `GET /api/v1/issues`

The skeleton responses are shaped to match the OpenAPI v0.2 read DTOs at a high level. Trace status remains MVP-aligned as `suspected`. Static response data lives behind `apps/api/src/read-path-static-repository.js`; `read-path-skeleton.js` owns route matching, trace ID decoding, JSON writing, and 404 handling.

Canonical API errors use the wrapped envelope `{ error: { code, message, details? } }`. The inner `error` object is the stable machine-readable unit so validation, conflict, not_found, auth, and reliability/action failures can be parsed consistently across read and write paths.

## Storage Ownership Plan

- Aurora will own changes, traces, issues, runs, and evidences.
- ClickHouse will own timeline series, anomaly markers, and read-model analytics.
- The current skeleton does not connect to Aurora, ClickHouse, Kafka, or other infrastructure.

## Current Skeleton Constraints

The API skeleton must not introduce:

- rollback
- kill switch
- rollout reduction
- flag reduction
- destructive production controls
- actual retry/reprocess execution in the skeleton layer

Write endpoints and reliability execution should remain separate from the read-path skeleton.

## Verification

Run these from the repository root:

```bash
node --check apps/api/src/read-path-skeleton.js
node --check apps/api/src/read-path-static-repository.js
node --test apps/api/src/read-path-skeleton.test.js
node --test --test-reporter=spec apps/api/src
```

## Future Work Guidance

- Introduce a repository boundary before DB integration.
- Keep OpenAPI-shaped DTOs stable while implementation moves from static skeleton to repositories.
- Keep UI or frontend-specific normalization out of API DTO handlers.
- Do not let skeleton responses override tests that rely on injected store-backed behavior.
- Keep write endpoints separate from the read-path skeleton.

## Metrics Points

This runtime currently emits structured logs, not metrics SDK output. The events below are the minimum metric candidates that should map cleanly to Prometheus, OpenTelemetry, or another collector later.

PII / raw data rule:

- Do not derive metrics from raw request body, raw payload, credentials, raw SQL, stack traces, or raw DB error text.
- Prefer route-level tags such as `method`, `path`, `status_code`, `error_code`, `signal`, and coarse event outcome only.

### Request Lifecycle

| Event source | Metric purpose | Suggested type | Tag candidates | Notes |
| --- | --- | --- | --- | --- |
| `request_started` | Incoming request volume | `counter` | `method`, `path` | Base ingress count. Do not tag by `request_id`. |
| `request_finished` | Successful/complete HTTP completion count | `counter` | `method`, `path`, `status_code` | Primary HTTP response counter. |
| `request_finished.duration_ms` | End-to-end latency | `histogram` | `method`, `path`, `status_code` | Main latency SLI candidate. |
| `request_aborted` | Client-side abort visibility | `counter` | `method`, `path` | Helps separate server failure from client disconnects. |
| `request_closed` | Non-finish connection close visibility | `counter` | `method`, `path`, `status_code` | Use when finish did not happen cleanly. |

### Error Boundary

| Event source | Metric purpose | Suggested type | Tag candidates | Notes |
| --- | --- | --- | --- | --- |
| `request_failed` | Unhandled route/repository error count | `counter` | `method`, `path`, `error_kind`, `error_code`, `status_code` | Keep DB-specific tags coarse. `db_code` is optional and should stay low-cardinality. |
| `*_validation_failed` | Validation error rate | `counter` | `method`, `path`, `event` | Includes `change_intake_validation_failed`, `event_intake_validation_failed`, `issue_intake_validation_failed`, `issue_status_update_validation_failed`, `retry_run_validation_failed`, `reprocess_run_validation_failed`, `trace_create_validation_failed`, `trace_list_validation_failed`, `run_list_validation_failed`. |
| `*_not_found` | Read/retry target miss count | `counter` | `method`, `path`, `event` | Includes `issue_status_update_not_found`, `retry_run_not_found`, `run_detail_not_found`, `run_state_log_not_found`, `trace_detail_not_found`, `trace_evidences_not_found`. |
| `*_conflict` | Domain conflict count | `counter` | `method`, `path`, `event` | Includes `issue_status_update_conflict`, `retry_run_conflict`, `reprocess_run_conflict`. |

### Shutdown

| Event source | Metric purpose | Suggested type | Tag candidates | Notes |
| --- | --- | --- | --- | --- |
| `server_shutdown_started` | Shutdown initiation count | `counter` | `signal` | Expected to be low-frequency. |
| `server_shutdown_timeout` | Forced drain timeout count | `counter` | `signal` | Alert candidate because it implies lingering connections. |
| `server_shutdown_completed` | Clean shutdown completion count | `counter` | `signal`, `forced_cleanup` | Distinguish clean drain from timeout cleanup. |
| `server_shutdown_failed` | Shutdown failure count | `counter` | `signal` | Operational alert candidate. |
| `server_shutdown_started.active_requests` | In-flight request snapshot at shutdown | `gauge` or shutdown sample | `signal` | Snapshot, not a continuously emitted gauge. |
| `server_shutdown_started.open_connections` | Open connection snapshot at shutdown | `gauge` or shutdown sample | `signal` | Snapshot, not a continuously emitted gauge. |
| `server_shutdown_timeout.destroyed_connections` | Forced socket cleanup count | `histogram` or sampled gauge | `signal` | Useful for tuning drain timeout. |

### Replay / Conflict / Reliability

| Event source | Metric purpose | Suggested type | Tag candidates | Notes |
| --- | --- | --- | --- | --- |
| `change_intake_processed` | Change intake throughput and replay rate | `counter` | `source`, `target_service`, `replay` | Derive replay from `idempotent_replay`. |
| `event_intake_processed` | Event intake throughput and replay rate | `counter` | `source`, `target_service`, `event_type`, `replay` | Keep `event_subtype` out unless cardinality stays controlled. |
| `issue_intake_processed` | Issue intake throughput and replay rate | `counter` | `source`, `issue_family`, `severity`, `replay`, `external_id_present`, `idempotency_key_present` | Avoid title/body/payload-based labels. |
| `issue_status_update_processed` | Issue status update throughput | `counter` | `outcome`, `error_code` | `issue_id` and issue text fields stay out of metric tags. |
| `retry_run_processed` | Retry request throughput and replay rate | `counter` | `replay` | `original_run_id` and `new_run_id` are log-only, not metric tags. |
| `reprocess_run_processed` | Reprocess throughput and replay rate | `counter` | `target_kind`, `replay` | `target_ref` is log-only, not a metric tag. |
| `retry_run_conflict` | Active retry guard hit rate | `counter` | `event` | Monitor duplicate retry pressure. |
| `reprocess_run_conflict` | Active reprocess guard hit rate | `counter` | `event`, `target_kind` | Monitor duplicate reprocess pressure. |

### Read Path / Domain Throughput

| Event source | Metric purpose | Suggested type | Tag candidates | Notes |
| --- | --- | --- | --- | --- |
| `run_list_retrieved` | Run list read throughput | `counter` | `status`, `limit_present` | `limit_present` is safer than raw `limit` for metrics. |
| `run_state_log_retrieved` | Run state-log read throughput | `counter` | `event` | Count only; `run_id` stays out of metrics. |
| `trace_list_retrieved` | Trace list read throughput | `counter` | `status`, `change_id_present`, `primary_issue_id_present`, `limit_present` | Presence flags are safer than raw IDs. |
| `trace_detail_retrieved` | Trace detail read throughput | `counter` | `status` | |
| `trace_evidences_retrieved` | Trace evidence read throughput | `counter` | `event` | |
| `dashboard_overview_retrieved` | Dashboard overview usage | `counter` | `event` | |
| `trace_create_processed` | Trace creation/reuse throughput | `counter` | `trace_created`, `trace_reused` | Evidence counts belong in histograms, not high-cardinality labels. |
| `trace_create_processed.evidence_count` | Evidence-per-trace distribution | `histogram` | `trace_created` | Use `evidence_created_count` / `evidence_skipped_count` similarly if needed. |

### Suggested First-Cut Metric Set

If only a small set is implemented first, start with:

1. `http_requests_total` from `request_finished`
2. `http_request_duration_ms` from `request_finished.duration_ms`
3. `http_request_aborts_total` from `request_aborted`
4. `http_request_failures_total` from `request_failed`
5. `shutdown_timeouts_total` from `server_shutdown_timeout`
6. `change_intake_total`, `event_intake_total`, `issue_intake_total`, `issue_status_update_total`
7. `retry_requests_total`, `reprocess_requests_total`
8. `trace_create_total`

### Tag Guidelines

- Good tag candidates:
  - `method`
  - `path`
  - `status_code`
  - `signal`
  - `error_kind`
  - `error_code`
  - `source`
  - `target_service`
  - `event_type`
  - `issue_family`
  - `severity`
  - `target_kind`
  - boolean presence flags such as `replay`, `external_id_present`, `limit_present`
- Avoid as metric tags:
  - `request_id`
  - `run_id`
  - `trace_id`
  - `change_id`
  - `issue_id`
  - `target_ref`
  - `original_run_id`
  - `new_run_id`
  - title/body/payload-derived values
  - raw DB messages, stack traces, SQL text

### Runtime Emit Abstraction

- Runtime code uses `apps/api/src/metrics.js` as the minimum metric emission boundary.
- The abstraction is intentionally small: `count`, `histogram`, `gauge`.
- The default implementation is no-op, so logging remains the current source of truth until a real exporter is injected.
- All runtime metric tags pass through a safe sanitizer that strips `request_id`, resource ids, raw payload/body/token, SQL text, and stack-like fields.
- Naming is fixed in code through `METRIC_NAMES`, with category prefixes kept stable as `http_`, `server_`, and domain/action names such as `change_intake_total`, `issue_intake_total`, `issue_status_update_total`, `trace_create_total`, `retry_run_total`, `reprocess_run_total`.
