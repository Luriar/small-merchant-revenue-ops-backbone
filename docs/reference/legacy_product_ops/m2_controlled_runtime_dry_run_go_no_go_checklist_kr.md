# M2 Controlled Runtime Dry Run Go/No-Go Checklist

Purpose: Define final go/no-go checklist before any future controlled runtime dry run.

Must explicitly hold:

- no AWS/psql/kubectl/Kafka/ClickHouse execution before go approval
- no production rollout
- no raw data capture

## Go Gates

- [ ] all M2 validators pass
- [ ] M2 global safety scanner passes if it exists
- [ ] M2-1 closure reviewed
- [ ] M2-2 execution package reviewed
- [ ] M2-3 observability contract reviewed
- [ ] M2-4 storage proposal reviewed
- [ ] M2-5 API proposal reviewed
- [ ] M2-6 handler/repository contract reviewed
- [ ] M2-7 skeleton tests pass if M2-7 exists
- [ ] OpenAPI patch not merged unless approved
- [ ] SQL proposal not applied unless approved
- [ ] owner assigned
- [ ] cleanup owner assigned
- [ ] evidence report template ready
- [ ] stop conditions reviewed
- [ ] rollback plan ready
- [ ] dry-run time window bounded
- [ ] sample count bounded

## No-Go Conditions

- forbidden field leakage unresolved
- raw payload/full message body needed
- missing idempotency behavior
- missing cleanup owner
- missing `evidence_report_ref`
- missing rollback plan
- slot lag/WAL threshold not defined
- anyone proposes REPLICA IDENTITY FULL as quick fix
- route wiring not reviewed
- OpenAPI patch not reviewed
- SQL proposal not reviewed

## Approval Record

- Go/No-Go decision:
- Approver:
- Owner:
- Cleanup owner:
- Time window:
- Sample count:
- Evidence report ref:
- Rollback plan ref:
