# M2-8A Auth Role Mapping Checklist

Purpose: verify auth/role enforcement readiness before M2-8B route wiring.

- [ ] no live route wiring in this step
- [ ] no server.js modification in this step
- [ ] no OpenAPI main merge in this step
- [ ] no SQL apply
- [ ] no external infrastructure commands
- [ ] current `viewer` role compatibility with `readonly_role` is decided
- [ ] `operator` behavior is aligned with create replay request only where allowed
- [ ] `maintainer` role source is defined
- [ ] `system_worker` role source is defined for future worker actions
- [ ] readonly/operator/maintainer/system_worker role mapping review is complete
- [ ] maintainer-only approve/cancel review is complete
- [ ] role checks happen before service mutation
- [ ] authorization failures use safe error envelope behavior
- [ ] 401/403/404/409/500 error mapping review is complete
- [ ] idempotency conflict 409 review is complete
- [ ] invalid state transition 409 review is complete
- [ ] no raw payloads
- [ ] no full message bodies
- [ ] no issue raw values
- [ ] no prod_change payload/actor values
