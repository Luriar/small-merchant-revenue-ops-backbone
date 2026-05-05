# M2 Data Retention / Cleanup Policy Matrix

Purpose: Define what can be retained, for how long, and what must be cleaned up after dry runs/replay operations.

Explicitly forbidden retention:

- raw payloads
- full message bodies
- issue title/body/payload/reporter values
- prod_change payload/actor values
- secrets
- DB URLs
- endpoints
- tokens
- passwords
- raw connection strings
- screenshots or logs exposing raw values

Explicitly allowed retention:

- field-name sets
- sampled message counts
- topic names
- source table names
- primary key identifiers
- yes/no leakage result
- `idempotency_key`
- `replay_request_id`
- `failure_id`
- `evidence_report_ref`
- cleanup status

| Storage Location | Allowed Retained Content | Forbidden Retained Content | Retention Guidance | Cleanup Trigger | Cleanup Owner | Evidence Required After Cleanup | Stop Condition |
|---|---|---|---|---|---|---|---|
| Aurora `cdc_failure` | safe metadata, status, evidence ref | forbidden raw values | retain for audit window TBD | closure/retention policy | TBD | cleanup decision ref | unsafe key found |
| Aurora `cdc_replay_request` | request ids, idempotency, status, run refs | raw replay source | retain for audit window TBD | replay lifecycle closure | TBD | cleanup status | original run mutated |
| Aurora `cdc_failure_state_log` | append-only transition metadata | raw details | append-only audit retention | never delete in MVP | TBD | state log evidence | update/delete required |
| Kafka DLQ topic | safe metadata message only | raw failed record | bounded retention | dry-run completion | platform owner | sampled count + leakage result | raw value needed |
| ClickHouse DLQ read model | safe read model fields | raw values | TTL TBD | retention TTL/cleanup | analytics owner | cleanup query result | unsafe column exists |
| ops evidence templates | commands/results, counts, field names | raw screenshots/logs | keep with milestone evidence | milestone closure | operator | final evidence summary | raw capture attached |
| runtime logs | IDs, statuses, error codes | request raw values/secrets | standard log retention | incident closure | app owner | redaction review | raw values logged |
| local dry-run sample files | bounded field-name sets/counts | raw samples | delete after evidence extraction | dry-run cleanup | operator | cleanup completion template | sample contains raw values |
| test fixtures | safe metadata examples | suspicious raw keys | repo retained | validation update | code owner | validator pass | unsafe fixture key |
