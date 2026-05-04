# M2-8A Route Wiring Readiness Checklist

Purpose: verify route wiring readiness before any live route is registered.

- [ ] no live route wiring in this step
- [ ] no server.js modification in this step
- [ ] no OpenAPI main merge in this step
- [ ] no SQL apply
- [ ] no external infrastructure commands
- [ ] server.js does not import `cdc-recovery`
- [ ] proposed `/api/v1/cdc/*` route ownership is reviewed
- [ ] proposed route-to-handler mapping matches M2-5 and M2-6 contracts
- [ ] readonly/operator/maintainer/system_worker role mapping review is complete
- [ ] maintainer-only approve/cancel review is complete
- [ ] role checks happen before service mutation
- [ ] route-level tests are planned before live route wiring
- [ ] no raw payloads
- [ ] no full message bodies
- [ ] no issue raw values
- [ ] no prod_change payload/actor values
- [ ] safe DTO mapper is required for every response
- [ ] 401/403/404/409/500 error mapping review is complete
- [ ] idempotency conflict 409 review is complete
- [ ] invalid state transition 409 review is complete
- [ ] decision recorded as ready or not ready before M2-8B
