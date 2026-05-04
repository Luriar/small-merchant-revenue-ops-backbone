# M2 Idempotency Conflict Scenario Catalog

Purpose: Define concrete replay request conflict scenarios before service implementation.

| # | Input Condition | Expected HTTP Status | Expected Service Decision | Repository Lookup Required | new_run_id Behavior | State Log Behavior | Safe Error Response | Stop Condition |
|---:|---|---:|---|---|---|---|---|---|
| 1 | same `idempotency_key` + identical normalized input | 200 | return existing request | find by idempotency key | preserve existing value | no new state log | none | no |
| 2 | same key + different `bounded_scope` | 409 | idempotency conflict | find by idempotency key | unchanged/null | no mutation | `IDEMPOTENCY_CONFLICT` | yes if mutation attempted |
| 3 | same key + different `target_topic` | 409 | idempotency conflict | find by idempotency key | unchanged/null | no mutation | `IDEMPOTENCY_CONFLICT` | yes if mutation attempted |
| 4 | same key + different `target_table` | 409 | idempotency conflict | find by idempotency key | unchanged/null | no mutation | `IDEMPOTENCY_CONFLICT` | yes if mutation attempted |
| 5 | same `failure_id` + same bounded scope + different key while active request exists | 409 | active duplicate conflict | list active by failure/scope | no new run | no mutation | `ACTIVE_REPLAY_REQUEST_EXISTS` | yes |
| 6 | same failure + completed prior request + new attempt_count | 201 | create new request if policy allows | find active by failure/scope | null until worker | append create log | none | stop if active prior exists |
| 7 | cancelled request followed by new request | 201 | create new request | find prior status | null until worker | append create log | none | stop if cancelled record is rewritten |
| 8 | rejected request followed by corrected request | 201 | create new request | find prior status | null until worker | append create log | none | stop if rejected record is rewritten |
| 9 | missing `idempotency_key` | 400 | validation error | none | none | none | `VALIDATION_ERROR` | yes |
| 10 | missing `evidence_report_ref` | 400 | validation error | none | none | none | `VALIDATION_ERROR` | yes |
| 11 | request attempts raw message replay | 400/409 | reject unsafe intent | none or validation | none | none | safe rejection | stop for raw message replay by default |
| 12 | request attempts to mutate original run | 409 | invalid intent | get request/failure if needed | none | no mutation | `INVALID_REPLAY_INTENT` | yes |
| 13 | request would require REPLICA IDENTITY FULL quick fix | 409 | reject unsafe operational shortcut | none | none | no mutation | `UNSAFE_RECOVERY_SHORTCUT` | yes |

Required outcomes:

- exact idempotent replay returns `200`
- new request creation returns `201`
- missing required fields return `400`
- key/input/scope conflict or active duplicate returns `409`
- raw message replay by default is a stop condition
