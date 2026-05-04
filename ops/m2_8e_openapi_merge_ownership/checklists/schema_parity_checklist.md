# M2-8E-Prep Schema Parity Checklist

Purpose: verify proposal schemas against DTO mapper and service contracts before merge.

- [ ] no live route wiring in this step
- [ ] no server.js modification in this step
- [ ] no auth.js modification in this step
- [ ] no error-response.js modification in this step
- [ ] no cdc-recovery runtime module modification in this step
- [ ] no OpenAPI main merge in this step
- [ ] no SQL apply
- [ ] no external infrastructure commands
- [ ] proposal patch remains proposal-only
- [ ] CdcFailureSummary parity reviewed
- [ ] CdcFailureDetail parity reviewed
- [ ] CdcFailureStateLogEntry parity reviewed
- [ ] CdcReplayRequestSummary parity reviewed
- [ ] CdcReplayRequestDetail parity reviewed
- [ ] create/approve/cancel request and response parity reviewed
- [ ] DTO mapper parity required
- [ ] error envelope redaction parity required
- [ ] auth/role documentation parity required
- [ ] route-level integration tests must pass before main OpenAPI merge
- [ ] mutation routes require stricter approval
- [ ] no raw payloads
- [ ] no full message bodies
- [ ] no issue raw values
- [ ] no prod_change payload/actor values
- [ ] no stack traces
- [ ] no SQL details
- [ ] no persistence internals
