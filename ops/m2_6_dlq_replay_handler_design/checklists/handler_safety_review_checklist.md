# Handler Safety Review Checklist

- [ ] Confirm proposal-only and not production rollout.
- [ ] Confirm handler performs role check before service mutation.
- [ ] Confirm read endpoints allow readonly_role or higher.
- [ ] Confirm create replay request requires operator or maintainer.
- [ ] Confirm approve/cancel requires maintainer.
- [ ] Confirm safe metadata only in all responses.
- [ ] Confirm no raw payloads.
- [ ] Confirm no full message bodies.
- [ ] Confirm no issue title/body/payload/reporter values.
- [ ] Confirm no prod_change payload/actor values.
- [ ] Confirm `idempotency key` is required where needed.
- [ ] Confirm `409 behavior` for idempotency conflict.
- [ ] Confirm `409 behavior` for invalid state transition.
- [ ] Confirm `evidence_report_ref` is returned only when safe.
- [ ] Confirm cleanup/evidence report linkage is documented.
