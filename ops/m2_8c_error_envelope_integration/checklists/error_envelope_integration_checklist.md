# M2-8C-Prep Error Envelope Integration Checklist

Purpose: confirm CDC error envelope integration before route wiring.

- [ ] no live route wiring in this step
- [ ] no server.js modification in this step
- [ ] no auth.js modification in this step
- [ ] no production error behavior change
- [ ] no OpenAPI main merge
- [ ] no SQL apply
- [ ] no external infrastructure commands
- [ ] 400 validation_error safe envelope
- [ ] 401 unauthorized auth-layer safe envelope
- [ ] 403 forbidden auth-layer safe envelope
- [ ] 404 not_found safe envelope
- [ ] 409 idempotency_conflict safe envelope
- [ ] 409 invalid_state_transition safe envelope
- [ ] 409 worker_boundary_conflict safe envelope
- [ ] 500 internal_error redacted envelope
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
