# M2-8 Next-Session Operator Checklist

## First Command

Run:

```bash
git status --short
```

Then inspect:

- `docs/m2_8i_closure_summary_kr.md`
- `docs/m2_8j_openapi_merge_readiness_plan_kr.md`
- `docs/m2_8_validation_evidence_ledger_kr.md`
- `apps/api/src/server.js`
- `apps/api/src/cdc-recovery/cdc-recovery-routes.js`

## Validation Chain To Rerun

- `npm run test:m2-8i:production-routes`
- `npm run validate:m2-8i:production-route-wiring`
- `npm run test:m2-8b:cdc-recovery-routes`
- `npm run validate:m2-8b:test-only-harness`
- `npm run validate:m2-8h:route-wiring-readiness`
- `npm run validate:m2-8g:final-pre-wiring`
- `npm run validate:m2:global-safety`
- `git diff --check`

## Current Allowed Next Task

Current allowed next task: M2-9A live DB preflight rerun with explicit dev/staging evidence.

## Current Forbidden Tasks

- Aurora repository unless M2-8N/M2-8K readiness gates pass and a separate implementation task is approved
- SQL apply unless migration gate passes
- external infrastructure unless controlled runtime gate passes
- AWS, psql, kubectl, Kafka, Debezium, ClickHouse, deployment, or runtime dry-run commands

## Stop Conditions

Stop if:

- main OpenAPI changes outside the approved M2-8M CDC recovery merge
- direct Aurora repository is started before approval
- SQL apply is requested before M2-9A records GO
- runtime dry-run is requested before M2-9B schema verification passes
- SQL or infrastructure commands are requested
- route output exposes raw payloads, full message bodies, issue raw values, prod_change payload/actor values, stack traces, SQL details, or persistence internals
- `auth.js` or `error-response.js` requires broad rewrite

## What To Ask Codex Next

Ask Codex to perform M2-9A live DB preflight only, with explicit dev/staging DB evidence, cleanup owner, evidence_report_ref, bounded sample-count, bounded time-window, rollback procedure, and verification queries.

Do not ask Codex to apply SQL, run runtime dry-run, or run external infrastructure yet.
