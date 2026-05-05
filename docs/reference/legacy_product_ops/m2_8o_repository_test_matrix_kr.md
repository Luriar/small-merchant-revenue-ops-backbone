# M2-8O Repository Test Matrix

| Test Area | Coverage | Status |
| --- | --- | --- |
| Safe projection queries | failure list filters and safe field stripping | pass |
| Found/not found | failure detail found and null missing result | pass |
| Idempotent duplicate | repository lookup plus service idempotency helper | pass |
| Idempotency conflict | same key with different safe intent returns safe 409 decision | pass |
| Valid state transition | requested to approved update returns safe row | pass |
| Invalid state transition | invalid transition helper blocks and guarded update returns null | pass |
| Append-only state log | insert-only state log path, no update/delete statement | pass |
| Original failure immutability | status update does not rewrite source run identity | pass |
| Original run immutability | repository links new run without changing original run | pass |
| linkNewRunId worker-only boundary | update limited to future worker eligible statuses | pass |
| Persistence error redaction | generic persistence error only | pass |
| Forbidden raw key scanner | output checked with DTO forbidden-key helper | pass |
| Parameterized query intent | SQL uses placeholders and separate values | pass |
| No real DB client creation | constructor requires injected DB client | pass |

## Safety Decision

M2-8O repository tests are mocked only. They prove repository query intent and safe projection behavior without Aurora connection, SQL apply, real DB queries, or external infrastructure commands.
