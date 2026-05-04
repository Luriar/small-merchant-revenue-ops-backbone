# M2-5 Replay API Request Review Template

This template reviews an API request before replay/reprocess approval.

## Request Identity

- Failure id:
- Requested action:
- Requester:
- Owner:
- Idempotency key:
- Evidence report ref:

## Bounded Scope

- Target topic:
- Target table:
- Bounded scope:
- Attempt count:
- Reason summary without raw values:

## Safety Review

- Safe metadata only: yes/no
- No raw payloads: yes/no
- No full message bodies: yes/no
- No issue raw values: yes/no
- No prod_change payload/actor values: yes/no
- Stop on forbidden leakage: yes/no

## Recovery Rules

- New run row required: yes/no
- Original failure immutable: yes/no
- Original run immutable: yes/no
- Cleanup/evidence report linkage present: yes/no
