# M2-5 Idempotency Review Checklist

This checklist is template-only and does not run commands.

## Idempotency Key

- [ ] Idempotency key present.
- [ ] Key includes failure id.
- [ ] Key includes requested action.
- [ ] Key includes bounded scope reference.
- [ ] Key includes attempt count.
- [ ] Key includes requester or owner.

## Duplicate Handling

- [ ] Same key and same request returns existing replay request.
- [ ] Same key and different target or scope returns 409.
- [ ] Active duplicate request returns 409 unless exact idempotent replay.
- [ ] Duplicate request does not create duplicate new run row.

## Safety

- [ ] Safe metadata only.
- [ ] No raw payloads.
- [ ] No full message bodies.
- [ ] Stop on forbidden leakage.
- [ ] Cleanup/evidence report linkage present.
