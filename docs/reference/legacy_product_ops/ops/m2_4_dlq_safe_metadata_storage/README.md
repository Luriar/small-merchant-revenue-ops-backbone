# M2-4 DLQ Safe Metadata Storage Package

This package contains templates and checklists for reviewing M2-4 DLQ/replay safe metadata storage records.

This is not production rollout.

No file in this package runs infrastructure commands.

## Contents

- `templates/cdc_failure_record_template.md`
- `templates/replay_request_record_template.md`
- `checklists/storage_safety_review_checklist.md`
- `checklists/replay_state_transition_checklist.md`

## Safety Rules

Use safe metadata only.

Do not record raw payloads.
Do not record full message bodies.
Do not record secrets, DB URLs, endpoints, account IDs, tokens, passwords, or raw connection strings.
Do not record issue title/body/payload/reporter values.
Do not record prod_change payload/actor values.

Replay creates a new run row.
Replay requires an idempotency key.
Replay requires cleanup/evidence report linkage.
