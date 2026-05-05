# M2-5 DLQ / Replay API Package

This package contains templates and checklists for reviewing the M2-5 DLQ/replay API contract.

This is not production rollout.

No file in this package runs infrastructure commands.

## Contents

- `templates/replay_api_request_review_template.md`
- `templates/replay_api_response_review_template.md`
- `checklists/api_safety_review_checklist.md`
- `checklists/idempotency_review_checklist.md`
- `checklists/approval_transition_checklist.md`

## Safety Rules

Use safe metadata only.

Do not record raw payloads.
Do not record full message bodies.
Do not record issue raw values.
Do not record prod_change payload/actor values.

An idempotency key is required for replay request creation.

Replay/reprocess creates a new run row and must preserve original failure history.

Every request and response needs cleanup/evidence report linkage.

Stop on forbidden leakage.
