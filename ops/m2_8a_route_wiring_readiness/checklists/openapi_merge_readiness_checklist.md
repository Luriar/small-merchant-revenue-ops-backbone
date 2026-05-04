# M2-8A OpenAPI Merge Readiness Checklist

Purpose: prevent premature merge of the M2-5 OpenAPI proposal into the main OpenAPI.

- [ ] no live route wiring in this step
- [ ] no server.js modification in this step
- [ ] no OpenAPI main merge in this step
- [ ] OpenAPI patch must not be merged yet
- [ ] M2-5 patch remains proposal-only
- [ ] no SQL apply
- [ ] no external infrastructure commands
- [ ] schema fields match safe DTO mapper output
- [ ] safe metadata response fields are reviewed
- [ ] no raw payloads
- [ ] no full message bodies
- [ ] no issue raw values
- [ ] no prod_change payload/actor values
- [ ] 401/403/404/409/500 error mapping review is complete
- [ ] idempotency conflict 409 review is complete
- [ ] invalid state transition 409 review is complete
- [ ] maintainer-only approve/cancel review is complete
- [ ] readonly/operator/maintainer/system_worker role mapping review is complete
- [ ] main OpenAPI ownership and versioning approval is recorded
