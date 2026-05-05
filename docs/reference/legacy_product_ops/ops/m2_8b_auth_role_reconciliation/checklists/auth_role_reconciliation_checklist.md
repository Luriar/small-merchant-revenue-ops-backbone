# M2-8B-Prep Auth Role Reconciliation Checklist

Purpose: confirm role reconciliation before route wiring implementation.

- [ ] no live route wiring in this step
- [ ] no server.js modification in this step
- [ ] no auth.js modification in this step
- [ ] no OpenAPI main merge
- [ ] no SQL apply
- [ ] no external infrastructure commands
- [ ] current `viewer` role maps only to `readonly_role` candidate
- [ ] current `operator` role maps only to `operator` candidate
- [ ] `maintainer` is recorded as a new required role
- [ ] `system_worker` is recorded as a new required role
- [ ] readonly_role cannot mutate
- [ ] operator cannot approve/cancel
- [ ] maintainer required for approve/cancel
- [ ] system_worker cannot create arbitrary replay requests
- [ ] role checks before service mutation
- [ ] authorization failures do not reveal raw values
- [ ] expected 401 behavior is reviewed
- [ ] expected 403 behavior is reviewed
- [ ] expected 409 behavior is reviewed
- [ ] no raw payloads
- [ ] no full message bodies
- [ ] no issue raw values
- [ ] no prod_change payload/actor values
