# M2-3 Observability Signal Catalog

## Purpose

This catalog defines evidence-safe observability signals for the M2 CDC/read-model path.

This is not production rollout.

Signals must support failure visibility and recovery reasoning without storing raw payloads, full message bodies, secrets, endpoints, account IDs, DB URLs, or PII.

## Signal Catalog

| Signal | Source layer | Metric / log / check source | Threshold or decision rule | Severity | Recommended action | Evidence-safe recording rule |
| --- | --- | --- | --- | --- | --- | --- |
| Debezium connector status | Debezium | Connector status check | Status is not running during approved bounded window | High | Stop dry run or investigate connector owner-approved retry | Record connector name, status, task count, timestamp only |
| Connector task failed state | Debezium | Task status check | Any task enters failed state | High | Stop unbounded execution; record failure class; approve bounded retry only | Record task id, failure class, first/last seen timestamps |
| Publication membership drift | Aurora publication | Read-only publication check | Tables or column lists differ from M2-1 contract | Critical | Stop immediately; no replay until fixed | Record publication name, table names, allowed column names |
| Slot lag / WAL pressure | Aurora replication | Read-only slot lag check | Lag grows unexpectedly or exceeds dry-run threshold | Critical | Stop connector or cleanup; database owner review | Record slot name, lag bucket, trend window, cleanup status |
| Kafka topic message count / no-message window | Kafka | Bounded sample count check | No messages in expected window or unexpected count surge | Medium | Verify topic routing and connector status | Record topic name, sample count, time window |
| Consumer lag | Kafka consumer | Consumer lag check | Lag exceeds bounded dry-run threshold | Medium/High | Pause replay; review consumer health | Record group name, topic, lag bucket, timestamp |
| ClickHouse Kafka engine parse errors | ClickHouse Kafka engine | Parse error counter or rejected-row summary | Any parse failure in bounded dry run | High | Stop affected ingestion path; create metadata-only DLQ record | Record parser error class, field-name set, missing/unexpected fields |
| MV insert failure | ClickHouse MV | MV insert error summary | Any MV insert failure | High | Stop MV path; compare explicit column mapping | Record MV name, target table, column-name mismatch |
| Forbidden field leakage detection | Boundary checks | Publication, connector, Kafka key, DLQ, evidence scan | Any forbidden field name appears where not allowed | Critical | Stop immediately and open incident | Record forbidden field names only, not values |
| Replay attempt count | Replay/reprocess control | Replay request and run row summary | Attempt exceeds approved bounded count | High | Stop replay; require new approval | Record failure id, new run row id, attempt count, owner |
| Cleanup completion | Run cleanup | Cleanup checklist | Any cleanup item incomplete | High | Stop next run until cleanup is complete | Record cleanup status, owner sign-off, remaining resource names without endpoints |
| Evidence report completion | Evidence review | Evidence report checklist | Report missing required safe evidence or contains forbidden evidence | High/Critical | Block closure; redact through approved process if needed | Record report ref, completion status, violation type without raw values |

## Required Recording Constraints

Allowed evidence:

- field-name sets
- sampled message counts
- topic names
- publication table membership
- allowed column names
- yes/no leakage result
- `op`/`ts_ms` presence result
- DELETE primary-key presence result
- `_deleted` mapping result
- slot lag summary
- cleanup evidence

Forbidden evidence:

- raw payloads
- full message bodies
- secrets
- DB URLs
- endpoints
- account IDs
- SecretString
- tokens
- passwords
- raw connection strings
- issue title/body/payload/reporter values
- prod_change payload/actor values
- screenshots or logs exposing raw values

## Severity Rules

Critical means stop immediately and do not retry/replay until the contract violation is understood.

High means stop unbounded execution and require owner-approved bounded retry, replay, or cleanup.

Medium means continue only within the approved dry-run window if the signal is stable and evidence-safe.

## Relationship To M2-3 Contract

This catalog supports `docs/m2_3_observability_dlq_replay_contract_kr.md`.

It does not create monitors, dashboards, alarms, topics, workers, or infrastructure.
