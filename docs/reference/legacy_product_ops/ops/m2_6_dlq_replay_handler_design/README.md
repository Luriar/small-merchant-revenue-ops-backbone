# M2-6 DLQ Replay Handler Design

This package is proposal-only and not production rollout.

Purpose:

- Review the handler/service/repository/DTO mapper contract before runtime implementation.
- Keep DLQ/replay handling safe metadata only.
- Confirm no raw payloads and no full message bodies are introduced.
- Confirm no issue title/body/payload/reporter values and no prod_change payload/actor values are retained or returned.

Review focus:

- `idempotency key` required for replay request creation.
- Future replay/reprocess execution creates a `new run row`.
- `original failure immutable` except controlled status/linkage.
- `original run immutable`.
- `409 behavior` for idempotency conflict and invalid state transition.
- `cleanup/evidence report linkage` through `evidence_report_ref`.

Do not execute AWS, SQL, Kafka, Debezium, ClickHouse, route wiring, or runtime workers from this package.
