# M2-8E-Prep OpenAPI Ownership Checklist

Purpose: confirm ownership before any main OpenAPI merge.

- [ ] no live route wiring in this step
- [ ] no server.js modification in this step
- [ ] no auth.js modification in this step
- [ ] no error-response.js modification in this step
- [ ] no cdc-recovery runtime module modification in this step
- [ ] no OpenAPI main merge in this step
- [ ] no SQL apply
- [ ] no external infrastructure commands
- [ ] proposal patch remains proposal-only
- [ ] API contract owner assigned
- [ ] safety reviewer assigned
- [ ] final merge approver assigned
- [ ] product/ops reviewer assigned
- [ ] route-level integration tests must pass before main OpenAPI merge
- [ ] DTO mapper parity required
- [ ] error envelope redaction parity required
- [ ] auth/role documentation parity required
- [ ] mutation routes require stricter approval
- [ ] no raw payloads
- [ ] no full message bodies
- [ ] no issue raw values
- [ ] no prod_change payload/actor values
- [ ] no stack traces
- [ ] no SQL details
- [ ] no persistence internals
