# M2-8B-Prep Route Permission Gate Checklist

Purpose: confirm per-route role gates before any route registration.

- [ ] no live route wiring in this step
- [ ] no server.js modification in this step
- [ ] no auth.js modification in this step
- [ ] no OpenAPI main merge
- [ ] no SQL apply
- [ ] no external infrastructure commands
- [ ] GET failure routes allow readonly_role/operator/maintainer only
- [ ] GET replay request routes allow readonly_role/operator/maintainer only
- [ ] POST create replay request allows operator/maintainer only
- [ ] approve route is maintainer-only
- [ ] cancel route is maintainer-only
- [ ] readonly_role cannot mutate
- [ ] operator cannot approve/cancel
- [ ] maintainer required for approve/cancel
- [ ] system_worker cannot create arbitrary replay requests
- [ ] role checks before service mutation
- [ ] authorization failures do not reveal raw values
- [ ] 401/403/409 route outcomes are reviewed
- [ ] no raw payloads
- [ ] no full message bodies
- [ ] no issue raw values
- [ ] no prod_change payload/actor values
