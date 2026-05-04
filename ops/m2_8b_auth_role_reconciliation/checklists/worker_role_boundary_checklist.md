# M2-8B-Prep Worker Role Boundary Checklist

Purpose: keep future worker authority separate from human recovery authority.

- [ ] no live route wiring in this step
- [ ] no server.js modification in this step
- [ ] no auth.js modification in this step
- [ ] no OpenAPI main merge
- [ ] no SQL apply
- [ ] no external infrastructure commands
- [ ] system_worker is isolated from human request creation
- [ ] system_worker cannot create arbitrary replay requests
- [ ] system_worker cannot approve/cancel
- [ ] system_worker can linkNewRunId only after a future new run row exists
- [ ] system_worker can mark running/succeeded/failed/cleanup_complete only for future runtime execution status
- [ ] readonly_role cannot mutate
- [ ] operator cannot approve/cancel
- [ ] maintainer required for approve/cancel
- [ ] role checks before service mutation
- [ ] authorization failures do not reveal raw values
- [ ] 401/403/409 worker-boundary outcomes are reviewed
- [ ] no raw payloads
- [ ] no full message bodies
- [ ] no issue raw values
- [ ] no prod_change payload/actor values
