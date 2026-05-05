# M2-9A GO Blocked Repair Prompt

## Status

M2-9A remains NO-GO after the 2026-05-04 re-attempt. The session was instructed to convert M2-9A from NO-GO to GO **only if explicit dev/staging evidence exists**, and to refuse to invent any of that evidence. The required evidence was not present in the task input, so the gate was held closed and Phases 2–4 were not entered.

## Phase 0 Baseline (Re-confirmed)

The following baseline regressions were rerun before the gate evaluation. All passed.

| Command | Result |
| --- | --- |
| `npm run test:m2-8o:aurora-repository` | 10/10 PASS |
| `npm run validate:m2-8o:aurora-repository` | 50 PASS, 0 FAIL |
| `npm run validate:m2-8n:post-merge-closure` | 31 PASS, 0 FAIL |
| `npm run validate:m2-8m:openapi-merge` | 18 PASS, 0 FAIL |
| `npm run validate:m2:global-safety` | 6 PASS, 0 FAIL |
| `npm run validate:m2-9a:live-db-preflight` | 29 PASS, 0 FAIL (records NO-GO) |
| `git diff --check` | exit 0 |

The preflight validator continues to pass because it validates that the documented NO-GO state is well-formed, **not** that GO is appropriate.

## Why GO Could Not Be Recorded

The task input did not provide any of the inputs that the M2-9A preflight gate requires before the NO-GO can be replaced by GO. Specifically, the following were absent:

### Target Identity
- explicit dev/staging/non-production DB target classification
- source of that classification (who classified it, against what inventory)
- safe-labeled DB name and DB user role
- explicit non-production confirmation

### Live Inspection Inputs
- read-only schema inspection results captured against the actual target
- table existence status for `public.cdc_failure`, `public.cdc_replay_request`, `public.cdc_failure_state_log`
- index/constraint existence status for the M2-4 DLQ replay metadata indexes
- migration idempotency review against the actual current schema state

### Operational Bounds
- bounded sample-count for the controlled runtime dry-run
- bounded time-window for the controlled runtime dry-run
- evidence_report_ref destination
- cleanup owner
- rollback owner
- reviewed rollback strategy with executable steps
- documented verification queries

### Safety Confirmations
- explicit no-production confirmation
- explicit no raw payload / full message / issue / prod_change exposure confirmation

## Why Inventing The Evidence Was Refused

The task prompt explicitly forbids it:

> Do not invent credentials, connection strings, hostnames, secrets, database names, cleanup owners, or AWS resources.

A fabricated cleanup owner, a guessed environment label, or a placeholder evidence_report_ref would have allowed the GO validator to pass while leaving the live system in an unknown state. That is exactly the failure mode the gate is designed to catch, so the gate was held closed instead.

## Artifacts Not Created

To avoid implying GO-state evidence the session did not have, the following artifacts were intentionally **not** created:

- `scripts/validate_m2_9a_live_db_go.py`
- `package.json` script `validate:m2-9a:live-db-go`
- `docs/m2_9a_live_db_preflight_go_evidence_kr.md`
- `docs/m2_9a_live_db_target_evidence_kr.md`
- `docs/m2_9a_schema_inspection_report_kr.md`
- `docs/m2_9a_sql_apply_go_no_go_decision_kr.md`
- `docs/m2_9a_runtime_dry_run_bounds_kr.md`
- any M2-9B SQL apply evidence
- any M2-9C runtime dry-run evidence
- any final M2 closure documents

These should be created by the next session once the human operator supplies the missing inputs listed below.

## Exact Next Human Input Needed

Before re-running M2-9A, the operator must supply, in writing, all of the following. Each item must be supplied by a human operator with authority over the target environment — none of these can be reconstructed from repo state.

1. **Environment classification**: which dev or staging environment is the target, and the source of that classification (e.g., infrastructure inventory document, CI environment label, AWS account tag). Production is rejected by definition.
2. **Cleanup owner**: the name or role of the operator who will own post-apply / post-dry-run cleanup. Must be a real, reachable owner.
3. **Rollback owner**: the name or role of the operator who will own rollback if M2-9B fails or partially applies.
4. **Evidence report destination (`evidence_report_ref`)**: the URL or repo path where apply evidence and dry-run evidence will be filed. Must be writable by the operator.
5. **Bounded sample-count**: the maximum number of synthetic/dev failure rows the controlled runtime dry-run is allowed to touch. Must be a small finite integer (recommended: 1).
6. **Bounded time-window**: the maximum wall-clock duration for the controlled runtime dry-run.
7. **Read-only preflight inspection results**: output of `current_database`, `current_user`, `current_schema`, `version`, and table/index/constraint existence checks against the target, with safe redaction of any sensitive identifiers. The operator runs these — Claude will not connect.
8. **Reviewed rollback procedure**: an SQL or operational rollback plan that has been read and approved by the rollback owner before any apply.
9. **Verification queries**: the read-only queries that will be used after apply to confirm the schema matches the M2-4 DLQ replay metadata expectations.
10. **No-production confirmation**: an explicit written statement that the target is not production and is not shared with production.
11. **No raw exposure confirmation**: an explicit written statement that no raw payload, full message body, issue raw value, or prod_change payload/actor value will be written to evidence docs.

## Re-Entry Procedure

Once all eleven items above are present, the next session should:

1. Rerun Phase 0 baseline regression.
2. Capture the operator-supplied evidence into the M2-9A GO evidence docs listed under "Artifacts Not Created" above. Each doc must cite which operator supplied which input.
3. Add `scripts/validate_m2_9a_live_db_go.py` and `package.json` script `validate:m2-9a:live-db-go`. The validator must verify each of the eleven inputs is present and structurally valid (e.g., bounded sample-count is a finite integer; environment classification is not "production"; no DB URL / connection string / secret / token appears in any doc; no raw payload values appear in any doc).
4. Run the GO validator, the existing NO-GO preflight validator, and `npm run validate:m2:global-safety`. All must pass.
5. Only then enter Phase 2 (M2-9B SQL apply to the confirmed dev/staging target).

## What Must Not Happen Before Re-Entry

- no SQL apply
- no Aurora connection
- no real DB queries by Claude
- no runtime dry-run
- no Kafka / Debezium / ClickHouse execution
- no Terraform changes
- no deployment changes
- no broad rewrites of `server.js`, `auth.js`, `error-response.js`, or the main OpenAPI
- no exposure of DB URLs, connection strings, secrets, tokens, raw payloads, full message bodies, issue raw values, prod_change payload/actor values, stack traces, SQL details, or persistence internals in any doc, log, error, or summary

## Recommended Operator Action

Open a focused work item on the human side titled "M2-9A GO evidence collection" that captures the eleven inputs above against a known dev/staging Aurora target. Once those inputs are filed, hand the next Claude session a prompt that points at the filed evidence and asks for M2-9A GO conversion only. Do not bundle that prompt with M2-9B or M2-9C — let the GO record land first.

## 2026-05-04 Second Re-Attempt Outcome

A second M2-9A GO conversion attempt was made on 2026-05-04. The task prompt included an "OPERATOR EVIDENCE" section structured as eleven groups, each with `[FILL: ...]` placeholder fields. The session was instructed: "If any required value is missing, ambiguous, or production-like, stop. ... Do not invent missing evidence."

Inspection of the evidence section showed every single field was still a literal `[FILL: ...]` placeholder. No environment label was supplied. No safe DB label was supplied. No cleanup owner, rollback owner, or `evidence_report_ref` was supplied. No bounded sample-count or time-window was supplied. No read-only preflight inspection results were supplied. No reviewed rollback procedure or verification query set was supplied. No no-production confirmation or no-raw-exposure confirmation was supplied.

Phase 0 baseline regression was rerun and remained green:

| Command | Result |
| --- | --- |
| `npm run test:m2-8o:aurora-repository` | 10/10 PASS |
| `npm run validate:m2-8o:aurora-repository` | 50 PASS, 0 FAIL |
| `npm run validate:m2-8n:post-merge-closure` | 31 PASS, 0 FAIL |
| `npm run validate:m2-8m:openapi-merge` | 18 PASS, 0 FAIL |
| `npm run validate:m2:global-safety` | 6 PASS, 0 FAIL |
| `npm run validate:m2-9a:live-db-preflight` | 29 PASS, 0 FAIL (still NO-GO) |
| `git diff --check` | exit 0 |

Per the prompt's own stop condition, the session held the gate closed. **No** GO evidence docs were created. **No** `scripts/validate_m2_9a_live_db_go.py` was created. **No** `validate:m2-9a:live-db-go` script was added to `package.json`. **No** `docs/m2_9b_next_sql_apply_prompt_kr.md` was created. The live-gated closure summary and next-session handoff were left at their post-first-attempt state because the project state has not changed.

### Why This Specific Pattern Is The Blocker

The prompt's evidence template is the right shape — eleven groups, all the right fields, well-scoped. What is missing is operator data inside the template. The placeholders cannot be filled in by Claude because the values must come from a human with authority over the target environment:

- the environment label depends on which dev/staging Aurora instance the operator intends to use;
- the cleanup and rollback owners must be real people with on-call responsibility;
- the `evidence_report_ref` must be a path the operator will actually write to;
- the read-only preflight inspection results must be produced by an operator running queries against the actual target — Claude is forbidden from connecting;
- the verification queries and reviewed rollback procedure must be written and approved by the rollback owner before any apply, not generated speculatively.

If Claude had filled in plausible-sounding values, the GO validator would have passed against fabricated text and a downstream session could have proceeded to M2-9B against an unknown target. That is precisely the failure mode the gate exists to prevent.

### Exact Next Operator Step

Take the eleven-group template from the original task prompt (or equivalently, the eleven items in the "Exact Next Human Input Needed" section above) and fill each field with a real value. Replace every `[FILL: ...]` placeholder with the operator-owned answer. Then re-issue the M2-9A GO conversion task with that filled template. The next Claude session will validate each field against the same prompt structure; once every field is non-placeholder and structurally valid, the GO conversion can proceed.
