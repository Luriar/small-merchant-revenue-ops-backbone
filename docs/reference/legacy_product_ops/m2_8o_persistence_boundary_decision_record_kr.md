# M2-8O Persistence Boundary Decision Record

## Decision Summary

M2-8O accepts a mocked Aurora repository implementation using injected DB clients only. The implementation is not live-wired.

## Accepted Decisions

- injected DB client only
- no DB client creation inside repository
- no connection string handling
- no database driver import
- parameterized SQL only
- transaction-aware writes
- safe metadata projections only
- redacted persistence errors only
- append-only state log insert behavior
- original failure and original run immutability preserved

## Rejected Alternatives

- Direct Aurora connection in repository: rejected.
- Live route wiring to Aurora repository in M2-8O: rejected.
- SQL apply during repository implementation: rejected.
- Returning raw persistence errors: rejected.
- Exposing SQL details, stack traces, connection strings, or persistence internals: rejected.

## Future Revisit Conditions

Revisit live wiring only after M2-9A confirms a dev/staging target, rollback plan, verification queries, bounded sample-count, bounded time-window, evidence_report_ref, and cleanup owner.
