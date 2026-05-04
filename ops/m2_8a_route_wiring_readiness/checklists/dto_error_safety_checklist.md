# M2-8A DTO and Error Safety Checklist

Purpose: verify safe DTO mapper and error envelope readiness before any route wiring.

- [ ] no live route wiring in this step
- [ ] no server.js modification in this step
- [ ] no OpenAPI main merge in this step
- [ ] no SQL apply
- [ ] no external infrastructure commands
- [ ] safe DTO mapper is used for every success response
- [ ] recursive forbidden-key stripping is tested at route level
- [ ] no raw payloads
- [ ] no full message bodies
- [ ] no issue raw values
- [ ] no prod_change payload/actor values
- [ ] safe field-name sets contain names only, not values
- [ ] evidence_report_ref is emitted only as safe metadata
- [ ] 401/403/404/409/500 error mapping review is complete
- [ ] idempotency conflict 409 review is complete
- [ ] invalid state transition 409 review is complete
- [ ] errors do not include compared idempotency values
- [ ] errors do not include SQL details, stack traces, credentials, or persistence internals
- [ ] maintainer-only approve/cancel review is complete
- [ ] readonly/operator/maintainer/system_worker role mapping review is complete
