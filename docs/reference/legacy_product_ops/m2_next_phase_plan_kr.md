# M2 Next Phase Plan

## Current State

**M2 is complete** at the agreed live-DB-bounded scope (see `docs/m2_final_closure_summary_kr.md`). The CDC recovery API surface is implemented end-to-end: route wiring, OpenAPI merged, error envelope contract, M2-8O Aurora repository, M2-4 schema applied to the confirmed dev target `product-ops-dev-aurora`, and a repository-level controlled runtime dry-run executed against the live schema with cleanup complete.

What remains is everything that was deliberately scoped out of M2 — staging/production promotion, live route-level wiring of the Aurora repository, multi-sample / concurrency stress, full-pipeline replay/reprocess runtime, and TLS hardening for non-dev environments.

## Recommended Next-Phase Work Items

The following are candidate next-phase tasks. None is required for M2 closure. Each is independent and could be pulled into its own focused task with its own GO gate.

### 1. Staging schema apply

Promote `infra/sql/aurora/m2_4_dlq_replay_metadata.sql` from dev to staging Aurora. Reuse the M2-9B prompt structure (`docs/m2_9b_next_sql_apply_prompt_kr.md`) with a new evidence set scoped to the staging target. Mandatory: explicit operator evidence per the M2-9A gate (target classification, cleanup owner, rollback owner, evidence_report_ref, bounded sample-count and time-window for any subsequent staging dry-run, reviewed rollback, verification queries, no-production confirmation, no-raw-exposure confirmation). Production apply is out of scope until staging is verified and an explicit production GO record is filed.

### 2. Live wiring of the Aurora repository into production routes

Currently `apps/api/src/server.js` wires the M2-8I production routes against a stub repository. A future task may replace the stub with the M2-8O Aurora repository as a live dependency. Constraints:

- Must preserve M2-8I's isolated dispatcher pattern and minimal `server.js` diff.
- Must keep `auth.js` and `error-response.js` unchanged.
- Must not modify the main OpenAPI beyond docs / evidence updates.
- Must add route-level integration tests that exercise the Aurora repository against a live or containerized dev DB, bounded.
- Must not regress the M2-8B / M2-8I stub-repository tests; both must continue to pass.

### 3. Live route-level idempotency-conflict envelope verification

Once the Aurora repository is live-wired into routes, run a bounded controlled dry-run that hits the route (not the repository) and confirms the route layer returns a redacted 409 `idempotency_conflict` envelope when the repository raises a unique-violation. Today this mapping is verified only with the stub repository under M2-8B / M2-8I.

### 4. Multi-sample / concurrency stress for idempotency-key contention

Sample-count was 1 in M2-9C by design. A future bounded stress task could exercise concurrent `createReplayRequest` calls with the same `idempotency_key` and confirm exactly-one-success behavior plus safe error mapping for the losers. Bounded sample (e.g. 10 concurrent requests, 10-second time-window, dev only) and bounded cleanup remain prerequisites.

### 5. Full-pipeline replay/reprocess runtime against a bounded dev environment

Kafka, Debezium, ClickHouse, replay/reprocess workers, and the worker loop were not exercised in M2. A future phase may run a bounded replay/reprocess dry-run against a synthetic dev message, exercising the full pipeline end-to-end. This requires its own GO gate, bounded sample, bounded time-window, evidence_report_ref, cleanup owner, and rollback strategy — same shape as M2-9A.

### 6. TLS hardening for non-dev environments

The M2-9C dev dry-run used a dev-only SSL verification bypass through a local SSM port-forward. Staging and production runs require strict TLS validation and must not reuse the dev bypass. A future task may codify the staging/production connection contract: pinned root CA, no `NODE_TLS_REJECT_UNAUTHORIZED=0`, no `PGSSLMODE=no-verify`.

### 7. Observability — runtime metrics for CDC recovery

The M2-3 observability contract describes the signal surface; a future task can wire concrete metrics (request counts by route, replay request lifecycle counters, idempotency conflict counter, state-log append counter, persistence error class counter) and confirm none leaks raw payload, full message body, issue raw value, or prod_change payload/actor value.

### 8. Optional: remove `PROPOSAL ONLY` marker on `infra/sql/aurora/m2_4_dlq_replay_metadata.sql`

The forward SQL retains its `PROPOSAL ONLY - DO NOT APPLY AUTOMATICALLY` marker even though M2-9B applied it once to dev under explicit authorization. A project-level convention for "applied to dev / staging / production" markers is the prerequisite for removing the marker. Until that convention exists, leave it in place; M2 closure is unaffected either way.

## What Is Still Forbidden Until A New GO Record

- production DB access of any kind
- staging or production schema apply without explicit GO evidence
- raw payload, full message body, issue raw value, or prod_change payload/actor value exposure in any doc
- DB URLs, hostnames, ports, credentials, tokens, passwords, AWS account IDs, IAM ARNs in docs or summaries
- broad rewrites of `apps/api/src/server.js`, `apps/api/src/auth.js`, `apps/api/src/error-response.js`, or main OpenAPI without an explicit task scoped to that change
- removal of M2-9A NO-GO history records (preserved for audit)
- removal of the M2-5 OpenAPI proposal-only patch's `PROPOSAL` marker
- unbounded Kafka, Debezium, ClickHouse, or worker-loop runtime

## Recommended First Next Task

Staging schema apply (work item 1 above), with its own M2-style preflight gate. It is the smallest next step that strictly extends what M2 verified and produces the most useful production-readiness signal. Production apply should not be considered until staging is in place and verified.

## Cross-References

- Closure summary: `docs/m2_final_closure_summary_kr.md`
- Validation evidence: `docs/m2_final_validation_evidence_kr.md`
- Runtime boundary decision record: `docs/m2_final_runtime_boundary_decision_record_kr.md`
- Artifact index: `docs/m2_final_artifact_index_kr.md`
- Commit plan: `docs/m2_final_commit_plan_kr.md`
