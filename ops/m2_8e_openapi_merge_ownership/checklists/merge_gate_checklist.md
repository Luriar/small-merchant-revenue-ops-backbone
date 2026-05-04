# M2-8E-Prep Merge Gate Checklist

Purpose: prevent premature main OpenAPI merge.

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
- [ ] route-level integration tests must pass before main OpenAPI merge
- [ ] auth role mapping implementation tested
- [ ] CDC error envelope adapter implementation tested
- [ ] in-memory/stub repository route tests pass
- [ ] DTO mapper parity required
- [ ] error envelope redaction parity required
- [ ] auth/role documentation parity required
- [ ] global safety scanner passes
- [ ] mutation routes require stricter approval
- [ ] no raw payloads
- [ ] no full message bodies
- [ ] no issue raw values
- [ ] no prod_change payload/actor values
- [ ] no stack traces
- [ ] no SQL details
- [ ] no persistence internals
