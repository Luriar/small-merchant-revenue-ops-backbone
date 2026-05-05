# M2-3 Observability / DLQ / Replay Package

This package contains templates and checklists for the M2-3 observability, DLQ, and replay integration contract.

This is not production rollout.

No file in this package runs infrastructure commands.

## Contents

- `checklists/failure_triage_checklist.md`
- `checklists/replay_approval_checklist.md`
- `checklists/dlq_evidence_review_checklist.md`
- `templates/replay_request_template.md`
- `templates/dlq_record_review_template.md`
- `templates/observability_incident_note_template.md`

## Safety Rules

Use these templates to record evidence-safe operational reasoning only.

Do not record raw payloads.
Do not record full message bodies.
Do not record secrets, DB URLs, endpoints, account IDs, tokens, passwords, or raw connection strings.
Do not record issue title/body/payload/reporter values.
Do not record prod_change payload/actor values.

Replay is not raw message replay by default.

Retry/reprocess must create a new run row and preserve idempotency.

Stop if forbidden field leakage appears or if anyone proposes `REPLICA IDENTITY FULL` as a quick fix.
