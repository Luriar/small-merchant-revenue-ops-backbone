# M2-5 Replay API Response Review Template

This template reviews API responses for safe metadata and state behavior.

## Response Identity

- Replay request id:
- Failure id:
- Status:
- Idempotency key:
- New run id:
- Evidence report ref:

## Response Safety

- Safe metadata only: yes/no
- No raw payloads: yes/no
- No full message bodies: yes/no
- No issue raw values: yes/no
- No prod_change payload/actor values: yes/no
- Stop on forbidden leakage: yes/no

## State Review

- Status transition valid: yes/no
- New run row rule preserved: yes/no
- Original failure preserved: yes/no
- Cleanup/evidence report linkage present: yes/no
