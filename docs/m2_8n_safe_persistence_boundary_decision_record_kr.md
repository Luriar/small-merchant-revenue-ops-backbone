# M2-8N Safe Persistence Boundary Decision Record

## Decision Summary

M2-8N accepts mocked Aurora repository implementation as the next safe step, but rejects live Aurora wiring until M2-9 gates pass.

## Accepted Boundary

- implement repository using an injected DB client
- test with mocks first
- use parameterized SQL
- use transaction-aware writes
- return safe metadata projections only
- redact persistence errors

## Rejected Boundary

- no live Aurora connection in M2-8N
- no SQL apply in M2-8N
- no runtime dry-run in M2-8N
- no direct repository wiring into production routes before M2-9 gates
- no connection string handling inside repository
- no DB client creation inside repository

## Rationale

The OpenAPI contract is now merged, but persistence behavior has a different risk profile. Repository implementation can be tested with mocks without touching live DB state. Live DB and runtime work require explicit dev/staging confirmation, rollback, verification queries, bounded sample-count, bounded time-window, evidence_report_ref, and cleanup owner.

## Future Revisit Conditions

Revisit only after M2-8O mocked tests pass and M2-9A preflight confirms a non-production target with rollback and verification evidence.
