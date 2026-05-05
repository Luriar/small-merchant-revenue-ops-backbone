# Error Mapping Review Template

Status: proposal-only, not production rollout.

Endpoint:

Action:

Expected HTTP Status:

Error Code:

Safe Operator Message:

Evidence Report Ref:

Idempotency Key:

409 Behavior:

Cleanup/Evidence Report Linkage:

Allowed Safe Fields:

Forbidden field leakage review:

- no raw payloads
- no full message bodies
- no issue title/body/payload/reporter values
- no prod_change payload/actor values
- no secrets
- no DB URLs
- no endpoints
- no tokens
- no passwords
- no raw connection strings

Original Failure Immutable:

Original Run Immutable:
