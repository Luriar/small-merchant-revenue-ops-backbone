# Idempotency Transition Review Checklist

- [ ] Confirm missing `idempotency key` returns validation error.
- [ ] Confirm same key and same normalized intent returns existing replay request.
- [ ] Confirm same key and different bounded scope returns `409 behavior`.
- [ ] Confirm active duplicate request returns `409 behavior`.
- [ ] Confirm approve only allows `requested` to `approved`.
- [ ] Confirm cancel only allows cancellable states.
- [ ] Confirm new run row is not created during request creation.
- [ ] Confirm new run row is created only by future worker.
- [ ] Confirm original failure immutable.
- [ ] Confirm original run immutable.
- [ ] Confirm safe metadata only in state log.
- [ ] Confirm cleanup/evidence report linkage is present.
- [ ] Confirm no raw payloads and no full message bodies.
- [ ] Confirm no issue title/body/payload/reporter values.
- [ ] Confirm no prod_change payload/actor values.
