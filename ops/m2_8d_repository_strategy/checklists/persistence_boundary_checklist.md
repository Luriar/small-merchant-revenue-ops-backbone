# M2-8D-Prep Persistence Boundary Checklist

Purpose: prevent repository behavior from becoming a raw data or infrastructure path.

- [ ] no live route wiring in this step
- [ ] no server.js modification in this step
- [ ] no auth.js modification in this step
- [ ] no error-response.js modification in this step
- [ ] no real DB queries
- [ ] no Aurora connection
- [ ] no OpenAPI main merge
- [ ] no SQL apply
- [ ] no external infrastructure commands
- [ ] use in-memory/stub repository first for route-level integration tests
- [ ] direct Aurora repository deferred until migration gate
- [ ] repository output safe metadata only
- [ ] raw persistence errors are normalized before API/log output
- [ ] no raw payloads
- [ ] no full message bodies
- [ ] no issue raw values
- [ ] no prod_change payload/actor values
- [ ] no stack traces
- [ ] no SQL details
- [ ] no persistence internals
- [ ] idempotency conflicts return safe 409
- [ ] invalid state transitions return safe 409
- [ ] linkNewRunId is future worker-only
