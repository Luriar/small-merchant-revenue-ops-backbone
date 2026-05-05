# Contract Alignment Ledger

Durable per-endpoint reference for the Event-Driven Product Ops Backbone API.
This ledger records, per route: whether it is part of the public OpenAPI v0.2
contract, whether it is implemented at runtime, who the intended actor is, what
evidence or operational role it serves, the auth requirement, the idempotency
or optimistic-locking rule, the canonical error shape, the current alignment
status, and the remaining TODO items.

It is the place to update first when an endpoint's contract or behavior
changes. If implementation and documentation drift, this file is the
arbitration record.

---

## Principles

1. **Public API endpoints are user/operator-facing product contract.** They
   are documented in OpenAPI v0.2, are reachable from the frontend or by
   external operators with the appropriate token, and are bound to the
   project's stable shape.
2. **Internal/worker-only endpoints are implementation surfaces for
   pipeline-generated evidence.** They are reachable at runtime but are
   intentionally not part of the public OpenAPI surface. They exist for the
   trace-generation worker and for end-to-end test coverage; arbitrary public
   consumption is not part of the product contract.
3. **Trace and evidence must be pipeline-generated, not arbitrary user
   mutation.** Traces are computed by the trace-generation pipeline from
   change / anomaly / issue inputs. The MVP does not expose trace
   confirm/dismiss/rollback mutations; trace status is `suspected`-only.
4. **Reprocess, retry, and status mutations are operational actions and must
   preserve reason, idempotency, and version evidence.** Every operational
   mutation carries either an `idempotency_key`, an `expected_version`, or
   both, plus a human-readable `reason` where applicable. The audit trail is
   first-class.
5. **Canonical API error shape is wrapped:**
   ```json
   { "error": { "code": "...", "message": "...", "details": [...] } }
   ```
   This is the canonical shape for every endpoint listed below. OpenAPI v0.2
   now models this with `ErrorResponse` as the envelope and `ErrorBody` as the
   stable machine-readable `code` / `message` / `details` payload.

---

## Endpoint Contract Alignment Ledger

Legend:
- **OpenAPI?** — `yes` if a `post`/`get`/`patch` operation exists for this
  path+method in `sources/personal_project_openapi_v0_2.yaml`; `no — internal`
  if it is intentionally omitted; `no — drift` if the omission is unintentional.
- **Impl?** — `yes` if the runtime serves the route; `skeleton` if only the
  read-path skeleton serves it under `?readPathSkeleton=true`.
- **Actor** — who is expected to call the route in the production product.
- **Auth** — minimum role enforced by `apps/api/src/auth.js`.
- **Error shape** — every endpoint returns `{ error: { code, message, details? } }`.

### Intake (write)

| Endpoint | Method | OpenAPI? | Impl? | Actor | Evidence / op role | Auth | Idempotency / locking | Error shape | Status | TODO |
|---|---|---|---|---|---|---|---|---|---|---|
| `/api/v1/changes` | POST | yes | yes | operator (deploy/flag/rule pipeline) | Authoritative change record. Anchors all downstream traceability. | operator | `idempotency_key` required. Replay → 200; new → 201. Ledger: `change_intake_idempotency`. | wrapped | aligned | Aurora grants audit for `change_intake_idempotency` post-baseline. |
| `/api/v1/events/intake` | POST | yes | yes | operator (event producers) | Normalized event intake into Aurora `event_intake` (distinct from ClickHouse `events_raw`). | operator | `event_id` is the authoritative dedupe key. No idempotency ledger. Replay → 200; new → 202. | wrapped | aligned | Aurora grants audit for `event_intake` post-baseline. PII redaction is handled at intake; verify pseudonymity policy for `user_id`/`session_id`/`request_id`. |
| `/api/v1/issues/intake` | POST | yes | yes | operator (support pipeline) | Normalized issue intake into Aurora `issue`. | operator | Primary dedupe: `(source, external_id)` via `uq_issue_external`. Fallback: `idempotency_key` ledger `issue_intake_idempotency`. Replay → 200; new → 201. | wrapped | aligned | Aurora grants audit for `issue_intake_idempotency`. PII at title/body/payload/reporter is documented at the DDL level; intake-time redaction policy is enforced by handler. |

### Issue status (operational mutation)

| Endpoint | Method | OpenAPI? | Impl? | Actor | Evidence / op role | Auth | Idempotency / locking | Error shape | Status | TODO |
|---|---|---|---|---|---|---|---|---|---|---|
| `/api/v1/issues/{issue_id}/status` | PATCH | yes | yes | operator | State transition for a known issue. Audit-relevant: previous/current status and version are returned. | operator | `expected_version` required (≥1). Optimistic locking: 409 `version_conflict` on mismatch. On success, `version` increments by 1. `resolved_at` is set by Aurora trigger on first transition into `resolved`; in-memory store mirrors the same behavior. | wrapped | aligned | No transition-rule policy yet (any valid status accepted regardless of previous status). Future work: enforce legal transitions (e.g. `ignored → investigating` requires re-open) and possibly require `reason`. |

### Reliability actions (operational mutation)

| Endpoint | Method | OpenAPI? | Impl? | Actor | Evidence / op role | Auth | Idempotency / locking | Error shape | Status | TODO |
|---|---|---|---|---|---|---|---|---|---|---|
| `/api/v1/runs/{run_id}/retry` | POST | yes | yes | operator | Retry a failed run by creating a **new** run row. Original run remains immutable. | operator | `idempotency_key` and `reason` both required. Same `(action=retry, original_run_id, idempotency_key)` returns the same `new_run_id`; different key on an active retry returns 409. | wrapped | aligned | Future work: separate `worker_role` if retry execution is delegated to a worker process distinct from human operators. |
| `/api/v1/reprocess` | POST | yes | yes | operator (currently; intent is admin/ops_lead per OpenAPI security note) | Reprocess a target batch (DLQ or event batch) by creating a **new** run row. Workers consume the new run. | operator | `idempotency_key`, `target_kind` (`dlq_batch` or `event_batch`), `target_ref`, and `reason` all required. Same `(action=reprocess, target_kind, target_ref, idempotency_key)` returns same `new_run_id`; different key on an active reprocess returns 409. | wrapped | aligned | Auth model is `operator`; OpenAPI mentions admin/ops_lead. Once role model expands, raise the auth requirement. |

### Trace creation (internal/worker-only)

| Endpoint | Method | OpenAPI? | Impl? | Actor | Evidence / op role | Auth | Idempotency / locking | Error shape | Status | TODO |
|---|---|---|---|---|---|---|---|---|---|---|
| `/api/v1/traces` | POST | **no — internal** | yes | **internal trace-generation worker** (and end-to-end tests) | Atomic creation of `trace` + N `evidence` rows in one Aurora transaction with trace-key duplicate guard `(change_id, primary_issue_id, anomaly_type, anomaly_metric, anomaly_window_start, anomaly_window_end)` and per-evidence SHA-256 fingerprint dedup. Evidence is append-only; duplicates are skipped, not errored. | operator | Trace-key reuse → 200 with the existing `trace_id`. New trace → 201. Per-evidence fingerprint dedup is reported via `evidence_created_count` / `evidence_skipped_count`. | wrapped | **intentionally omitted from public OpenAPI v0.2** | When the real trace-generation worker lands: (a) rename to `/api/v1/internal/traces` (or `/api/v1/trace-generation`), (b) introduce a `worker_role` distinct from `operator` and tighten auth to that role, (c) extend payload to expose `confidence`, real `anomaly_detail`, `event_refs[]`, and `generated_by_run_id` so the API stops writing the synthetic `api_trace_create_minimal` placeholder. |

### Dashboard (read)

| Endpoint | Method | OpenAPI? | Impl? | Actor | Evidence / op role | Auth | Idempotency / locking | Error shape | Status | TODO |
|---|---|---|---|---|---|---|---|---|---|---|
| `/api/v1/dashboard/overview` | GET | yes | yes (normal store-backed + skeleton) | viewer | KPI summary: changes, anomaly patterns, linked issues, suspected traces. Normal response shape is aligned to `{ scope, kpis, chart_context }`. Values are derived only from provable trace/store data; the runtime does not fabricate ClickHouse analytics. | viewer | n/a (read) | wrapped | aligned | Normal store-backed API parity is implemented. Future production validation is still needed after Aurora/ClickHouse are connected; do not treat this as full deployed AWS/Aurora/ClickHouse completion. |
| `/api/v1/dashboard/timeline` | GET | yes | yes (normal store-backed + skeleton) | viewer | Chart timeline response aligned to `{ metric, series, change_markers, anomaly_markers }`. Normal mode returns store/Aurora-backed `change_markers`; no issue rows are returned. `series` and `anomaly_markers` intentionally remain empty until ClickHouse metric/anomaly read path exists. | viewer | n/a (read) | wrapped | aligned | Add ClickHouse-backed metric series and anomaly marker enrichment later. Do not synthesize anomaly markers from traces or imply analytics exists before the pipeline is connected. |

### Traces (read)

| Endpoint | Method | OpenAPI? | Impl? | Actor | Evidence / op role | Auth | Idempotency / locking | Error shape | Status | TODO |
|---|---|---|---|---|---|---|---|---|---|---|
| `/api/v1/traces` | GET | yes | yes (+ skeleton) | viewer | List suspected traces. Status filter: `suspected` only in MVP. | viewer | n/a (read) | wrapped | aligned | — |
| `/api/v1/traces/{trace_id}` | GET | yes | yes (+ skeleton) | viewer | Trace detail with linked change, primary issue, and anomaly summary projection. | viewer | n/a (read) | wrapped | aligned | `anomaly.detail` is an object per OpenAPI; skeleton already emits an object (was a P0 mismatch, now resolved). |
| `/api/v1/traces/{trace_id}/evidences` | GET | yes | yes (+ skeleton) | viewer | Append-only evidence list for a trace. | viewer | n/a (read) | wrapped | aligned | No pagination today; evidence list is small in MVP. Add `next_cursor` if list size grows. |
| `/api/v1/traces/{trace_id}/primary-issue` | GET | yes | yes (+ skeleton) | viewer | Resolves `trace.primary_issue_id` and returns the safe `IssueDetail` projection. Returns 404 when no primary issue is linked. | viewer | n/a (read) | wrapped | aligned | OpenAPI uses `IssueDetailNullableResponse` (nullable allOf). Public issue reads expose `summary`/classification and presence/count fields only; raw title/body/reporter/payload/keywords/external_id/affected_variation are not public read fields. |

### Changes (read)

| Endpoint | Method | OpenAPI? | Impl? | Actor | Evidence / op role | Auth | Idempotency / locking | Error shape | Status | TODO |
|---|---|---|---|---|---|---|---|---|---|---|
| `/api/v1/changes` | GET | yes | yes (+ skeleton) | viewer | List changes with `release/flag/rule` summary counts. | viewer | n/a (read) | wrapped | aligned | — |
| `/api/v1/changes/{change_id}` | GET | yes | yes (+ skeleton) | viewer | Change detail. Safe projection (no raw `payload`/`rule_scope`; presence flags only). | viewer | n/a (read) | wrapped | aligned | `actor` is documented as PII-safe per intake validation (no `@`, no whitespace, ≤120 chars). |
| `/api/v1/changes/{change_id}/traces` | GET | yes | yes (normal store-backed + skeleton) | viewer | Traces derived from a change using `trace.change_id`. | viewer | n/a (read) | wrapped | aligned | Normal store-backed implementation is in place. OpenAPI declares `LimitQuery` and `CursorQuery`. No generic M:N `trace_issue_link` model is introduced. |

### Issues (read)

| Endpoint | Method | OpenAPI? | Impl? | Actor | Evidence / op role | Auth | Idempotency / locking | Error shape | Status | TODO |
|---|---|---|---|---|---|---|---|---|---|---|
| `/api/v1/issues` | GET | yes | yes (+ skeleton) | viewer | List issues with safe projection: normalized `summary`/classification plus status/severity/source and presence flags; no raw title, body, payload, reporter, keywords, external_id, or affected_variation. Status filter: `open / investigating / resolved / ignored`. | viewer | n/a (read) | wrapped | aligned | — |
| `/api/v1/issues/{issue_id}` | GET | yes | yes (+ skeleton) | viewer | Issue detail. Safe projection with presence/count fields for external_id, reporter, affected_variation, keywords, and body; raw title/body/payload/reporter/keywords/external_id/affected_variation are not public read fields. | viewer | n/a (read) | wrapped | aligned | — |
| `/api/v1/issues/{issue_id}/traces` | GET | yes | yes (normal store-backed + skeleton) | viewer | Traces linked to an issue using the current MVP anchor `trace.primary_issue_id`. | viewer | n/a (read) | wrapped | aligned | Normal store-backed implementation is in place. OpenAPI declares `LimitQuery` and `CursorQuery`. Generic M:N issue-trace generalization is intentionally not in MVP. |

### Runs (read)

| Endpoint | Method | OpenAPI? | Impl? | Actor | Evidence / op role | Auth | Idempotency / locking | Error shape | Status | TODO |
|---|---|---|---|---|---|---|---|---|---|---|
| `/api/v1/runs` | GET | yes | yes (+ skeleton) | viewer | Run list. Status filter: `pending / processing / completed / failed / dlq`. Safe projection: no raw `input_ref`. | viewer | n/a (read) | wrapped | aligned | OpenAPI is missing `ServiceQuery` parameter relative to other listings; minor. |
| `/api/v1/runs/overview` | GET | yes | yes (normal store-backed + skeleton) | viewer | Reliability KPIs (pending / processing / failed / dlq) and status distribution from the normal run store. | viewer | n/a (read) | wrapped | aligned | Normal store-backed implementation is in place. Route dispatch must keep `/runs/overview` before `/runs/{run_id}` so `overview` is not parsed as a run ID. |
| `/api/v1/runs/failures` | GET | yes | yes (normal store-backed + skeleton) | viewer | Failure groups by safe `error_class` from the normal run store. Does not expose raw `input_ref`. | viewer | n/a (read) | wrapped | aligned | Normal store-backed implementation is in place. Route dispatch must keep `/runs/failures` before `/runs/{run_id}` so `failures` is not parsed as a run ID. |
| `/api/v1/runs/{run_id}` | GET | yes | yes (+ skeleton) | viewer | Run detail with retry summary. | viewer | n/a (read) | wrapped | aligned | — |
| `/api/v1/runs/{run_id}/state-log` | GET | yes | yes (+ skeleton) | viewer | Append-only state-transition log. Trigger-maintained in Aurora. | viewer | n/a (read) | wrapped | aligned | — |

---

## Known Remaining Alignment Tasks

These are project-level items that span multiple endpoints or require
infra/process work. They are tracked here so they do not get lost between
per-endpoint changes.

1. **Aurora grants / permissions audit for newly-baselined intake tables.**
   `event_intake`, `change_intake_idempotency`, and `issue_intake_idempotency`
   are now part of the baseline DDL. Confirm `app_role` has SELECT/INSERT,
   `readonly_role` has SELECT, and `migration_role` is the only role with
   DDL/DROP rights. The infra-side grants file
   (`infra/sql/aurora/permissions/001_roles_and_grants.sql`) should be
   reviewed and, if needed, updated to apply immediately after the baseline.
2. **OpenAPI validation report regeneration.** Run
   `python3 scripts/validate_openapi.py` after changing
   `sources/personal_project_openapi_v0_2.yaml`. The command parses the YAML,
   resolves internal `$ref`s, verifies the canonical wrapped `ErrorResponse`
   shape, and regenerates
   `sources/personal_project_openapi_v0_2_validation_report.json`. Do not
   hand-edit the report.
3. **Dashboard timeline ClickHouse enrichment.** Normal
   `GET /api/v1/dashboard/timeline` now matches the OpenAPI/skeleton DTO shape
   and returns store/Aurora-backed `change_markers`, but `series` and
   `anomaly_markers` remain intentionally empty. Add ClickHouse-backed metric
   series and anomaly marker enrichment only after the `events_agg_1m` /
   `anomaly_detection_results` read path is connected.
4. **Production read-model validation after infrastructure connection.**
   Store-backed API parity has improved in normal runtime mode, but this does
   not mean AWS, Aurora deployment, CDC, or ClickHouse runtime integration is
   fully complete. After Aurora/ClickHouse are connected, validate each
   production read model against the OpenAPI DTOs and this ledger.
5. **Future trace internal route rename and `worker_role`.** When the
   trace-generation worker lands, migrate `POST /api/v1/traces` to
   `/api/v1/internal/traces`, introduce a dedicated `worker_role` in
   `auth.js`, and update the metrics route label and tests. This is an
   atomic single-PR migration, not a piecemeal change.
6. **Trace-generation payload enrichment.** When (5) lands, extend the
   request shape to expose `confidence`, structured `anomaly_detail`
   (`baseline_value`, `actual_value`, `delta_pct`, etc.), `event_refs[]`,
   and `generated_by_run_id` so the API stops writing the synthetic
   `api_trace_create_minimal` placeholder into Aurora `trace.anomaly_detail`.
7. **Role model expansion beyond viewer/operator.** OpenAPI v0.2's security
   notes refer to `admin` and `ops_lead` for some operational mutations
   (notably reprocess). The current `auth.js` only models `viewer` and
   `operator`. Expand `ROLE_PRECEDENCE` and per-route policies when stricter
   role separation is needed (e.g. reprocess gated to `ops_lead` distinct
   from change/issue intake).
8. **Production contract freeze checklist.** Before treating the public
   OpenAPI surface as frozen for v0.2:
   - Confirm error envelope is canonically wrapped across reads and writes.
     (Currently aligned in implementation, OpenAPI, and the generated
     validation report.)
   - Confirm `IssueIntakeRequest.title`, `TraceListItem.change` nullability,
     and pagination on `/{change_id}/traces` and `/{issue_id}/traces` are
     still aligned.
   - Confirm no public surface inadvertently exposes `POST /api/v1/traces`.
   - Confirm `PATCH /api/v1/issues/{issue_id}/status` response is the flat
     `UpdateIssueStatusResponse` shape (not wrapped).
   - Run the OpenAPI validation report (item 2) and commit the regenerated
     output alongside the spec change.

---

## Decision Rules For Future Drift

When implementation and OpenAPI disagree, apply these rules in order:

1. **If OpenAPI is the source of truth and implementation lags, fix the
   implementation.** Examples: a missing required field; a missing pagination
   parameter that the response shape implies; a missing 4xx response.
2. **If implementation is intentionally internal and public exposure would
   weaken evidence integrity, do not expose publicly; document the internal
   role here and in the handler.** Example today: `POST /api/v1/traces`.
   The default for any "the implementation has it but OpenAPI doesn't" gap
   is to ask whether the route is part of the product contract; if not,
   document it as internal in this ledger before considering exposure.
3. **If implementation already reflects the evidence philosophy better than
   the older spec, update the spec.** Example: if the implementation enforces
   stricter validation than OpenAPI declares (e.g. `actor` PII rejection),
   tighten OpenAPI to match.
4. **If a route mutates operational state, require `reason`,
   `idempotency_key`, `expected_version`, or an equivalent audit
   mechanism.** No silent operational mutations. Every state change must
   carry evidence sufficient to answer "who asked for this and why" without
   reading the database directly.

---

## Source of Truth Pointers

- **Implementation routes:** `apps/api/src/server.js` (route dispatch)
- **Auth policies:** `apps/api/src/auth.js` (`AUTH_ROUTE_POLICIES`)
- **Error shape:** `apps/api/src/error-response.js` (`mapErrorToHttpResponse`)
- **OpenAPI contract:** `sources/personal_project_openapi_v0_2.yaml`
- **Aurora schema:** `sources/aurora_ddl_v2.sql`
- **Read-path skeleton:** `apps/api/src/read-path-skeleton.js`
- **Frontend API mode (dev-only):** `apps/web/src/services/traceOverviewApiService.ts`
