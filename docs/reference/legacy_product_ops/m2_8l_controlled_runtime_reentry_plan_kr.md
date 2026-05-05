# M2-8L Controlled Runtime Re-entry Plan

## Required Gates Before Dry-Run

- M2-8I production route tests pass
- OpenAPI merge gate is reviewed
- Aurora repository gate is reviewed
- SQL migration gate is reviewed
- rollback gate is approved
- evidence report requirement is defined
- cleanup owner is assigned
- sample-count bound is approved
- time-window bound is approved
- slot/WAL pressure review is complete

## Runtime Dry-Run Bounds

Any future controlled runtime dry-run must be bounded by:

- limited sample count
- limited time window
- explicit evidence report reference
- cleanup owner
- rollback steps
- monitoring of CDC slot/WAL pressure

## No-Go Conditions

- route tests fail
- OpenAPI contract is not reviewed
- Aurora repository is not reviewed
- SQL migration rollback is missing
- evidence report owner is missing
- cleanup owner is missing
- sample count or time window is unbounded
- raw payloads, full message bodies, issue raw values, prod_change payload/actor values, stack traces, SQL details, or persistence internals would be exposed

## Explicit Non-Execution Statement

No AWS command is run. No psql command is run. No kubectl command is run. No Kafka, ClickHouse, or Debezium command is run. No SQL is applied. No runtime dry-run is executed.
