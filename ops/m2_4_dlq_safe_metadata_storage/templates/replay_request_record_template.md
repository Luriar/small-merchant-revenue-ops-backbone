# M2-4 Replay Request Record Template

This template describes one `cdc_replay_request` safe metadata record.

Replay is not raw message replay by default.

## Identity

- Replay request id:
- Failure id:
- Requested action:
- Status:
- Owner:
- Evidence report ref:

## Approval Metadata

- Requested by:
- Reason summary without raw values:
- Target topic:
- Target table:
- Bounded scope:
- Attempt count:
- Idempotency key:

## Run Linkage

- Source run id:
- New run row required: yes/no
- New run id:

## Cleanup

- Cleanup status:
- Cleanup owner:
- Cleanup evidence report ref:

## Do-Not-Record Confirmation

- No raw payloads: yes/no
- No full message bodies: yes/no
- No secrets: yes/no
- No issue raw values: yes/no
- No prod_change payload/actor values: yes/no
