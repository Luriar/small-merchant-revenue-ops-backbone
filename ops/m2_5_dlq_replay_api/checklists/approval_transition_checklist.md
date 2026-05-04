# M2-5 Approval Transition Checklist

This checklist is template-only and does not run commands.

## Approval

- [ ] Approver has maintainer role.
- [ ] Replay request is in valid status.
- [ ] Approval note contains safe metadata only.
- [ ] Evidence report ref present.
- [ ] Invalid state transition returns 409.

## State Transition

- [ ] `requested` can transition to `approved`.
- [ ] `requested` or `approved` can transition to `cancelled`.
- [ ] Already approved/cancelled idempotent response returns existing state.
- [ ] New run row is created only by future runtime worker.
- [ ] Original failure and original run remain immutable.

## Stop Conditions

- [ ] Stop on forbidden leakage.
- [ ] Stop if approval bypasses role assumptions.
- [ ] Stop if request contains raw payloads.
- [ ] Stop if response contains full message bodies.
- [ ] Stop if cleanup/evidence report linkage is missing.
