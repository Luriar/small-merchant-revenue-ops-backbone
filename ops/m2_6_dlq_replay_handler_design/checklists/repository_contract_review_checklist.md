# Repository Contract Review Checklist

- [ ] Confirm repository contract is interface-only and does not contain real DB queries.
- [ ] Confirm safe metadata only.
- [ ] Confirm no raw payloads.
- [ ] Confirm no full message bodies.
- [ ] Confirm no issue title/body/payload/reporter values.
- [ ] Confirm no prod_change payload/actor values.
- [ ] Confirm `createReplayRequest(input)` requires `idempotency_key`.
- [ ] Confirm `appendFailureStateLog(input)` is append-only.
- [ ] Confirm original failure immutable.
- [ ] Confirm original run immutable.
- [ ] Confirm future worker must create a new run row before `linkNewRunId`.
- [ ] Confirm cleanup/evidence report linkage through `evidence_report_ref`.
- [ ] Confirm `409 behavior` is handled by service before mutation.
