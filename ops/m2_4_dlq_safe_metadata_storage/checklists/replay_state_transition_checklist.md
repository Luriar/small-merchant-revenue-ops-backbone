# M2-4 Replay State Transition Checklist

This checklist is template-only and does not run commands.

## Failure State

- [ ] Current failure status recorded.
- [ ] Next failure status selected.
- [ ] State transition reason recorded without raw values.
- [ ] State transition evidence report ref recorded.

## Replay State

- [ ] Replay request status recorded.
- [ ] Bounded scope reviewed.
- [ ] Idempotency key present.
- [ ] New run row required.
- [ ] Source run id recorded if applicable.
- [ ] New run id recorded when future runtime creates it.

## Stop Conditions

- [ ] Stop if replay is raw message replay by default.
- [ ] Stop if raw payloads or full message bodies are required.
- [ ] Stop if issue raw values are required.
- [ ] Stop if prod_change payload/actor values are required.
- [ ] Stop if idempotency key is missing.
- [ ] Stop if evidence_report_ref is missing.
- [ ] Stop if cleanup/evidence report linkage is missing.
- [ ] Stop if `REPLICA IDENTITY FULL` is proposed as a quick fix.
