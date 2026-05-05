# M2-8C-Prep Route Error Mapping Checklist

Purpose: confirm each future CDC route has safe error mapping before registration.

- [ ] no live route wiring in this step
- [ ] no server.js modification in this step
- [ ] no auth.js modification in this step
- [ ] no production error behavior change
- [ ] no OpenAPI main merge
- [ ] no SQL apply
- [ ] no external infrastructure commands
- [ ] read routes map 401 unauthorized auth-layer safe envelope
- [ ] read routes map 403 forbidden auth-layer safe envelope
- [ ] detail routes map 404 not_found safe envelope
- [ ] create route maps 400 validation_error safe envelope
- [ ] create route maps 409 idempotency_conflict safe envelope
- [ ] approve/cancel routes map 409 invalid_state_transition safe envelope
- [ ] worker routes map 409 worker_boundary_conflict safe envelope
- [ ] every route maps 500 internal_error redacted envelope
- [ ] evidence_report_ref only when safe
- [ ] no raw payloads
- [ ] no full message bodies
- [ ] no issue raw values
- [ ] no prod_change payload/actor values
- [ ] no stack traces
- [ ] no SQL details
- [ ] no compared request body
- [ ] no compared idempotency values
- [ ] logs must not reveal raw values
