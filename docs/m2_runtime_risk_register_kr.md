# M2 Runtime Risk Register

Purpose: M2-1 through M2-7의 runtime 진입 전 위험을 한 곳에 모아 stop condition과 남은 검증을 고정한다.

| Risk ID | Description | Affected Layer | Severity | Current Mitigation | Remaining Verification Needed | Stop Condition | Owner |
|---|---|---|---|---|---|---|---|
| M2-R01 | Debezium serialization이 expected post-SMT shape와 다를 수 있음 | CDC | High | M2-1 fixtures, dry-run runbook | bounded sample 비교 | field shape mismatch unresolved | TBD |
| M2-R02 | Kafka message shape가 ClickHouse JSONEachRow parser와 불일치 | Kafka/ClickHouse | High | M2-1/M2-4 fixture parse contract | controlled dry run | parser error burst | TBD |
| M2-R03 | ClickHouse JSONEachRow parsing이 nullable/type mismatch로 실패 | ClickHouse | High | M2-4 DLQ metadata/read model proposal | local fixture parse plus runtime sample | rejected rows contain raw values | TBD |
| M2-R04 | DELETE behavior under REPLICA IDENTITY DEFAULT가 fixture와 다를 수 있음 | CDC | Medium | M2-1 delete caveat/runbook | runtime delete rewrite observation | DELETE shape unknown | TBD |
| M2-R05 | slot lag / WAL pressure during dry run | Aurora/CDC | High | M2-2 bounded dry-run package | lag threshold and cleanup owner | WAL pressure threshold exceeded | TBD |
| M2-R06 | forbidden field leakage into DLQ/read model/API | All M2 | Critical | M2 validators, global safety scanner | route-level stripping test | forbidden field leakage | TBD |
| M2-R07 | OpenAPI patch merge before handler/repository review | API contract | High | M2-5 proposal marker, M2-8 gate | approval record | patch merged without review | TBD |
| M2-R08 | route wiring risk exposes non-reviewed DLQ/replay paths | API runtime | High | M2-7 non-wired skeleton | M2-8 integration tests | server.js route added without gate | TBD |
| M2-R09 | idempotency conflict incorrectly creates duplicate request | Service | High | M2-6 contract, M2-7 helper tests | repository uniqueness test | same key creates different request | TBD |
| M2-R10 | replay duplicate run risk | Worker/future run | High | new run row rule, `new_run_id` link boundary | worker contract tests | replay mutates original run | TBD |
| M2-R11 | evidence capture violation | Ops/Aurora | High | evidence_report_ref required in contracts | route/service validation | mutation without evidence_report_ref | TBD |
| M2-R12 | cleanup failure after dry run/replay | Ops | Medium | cleanup templates/checklists | cleanup completion evidence | cleanup owner missing | TBD |
| M2-R13 | M2-2 dry-run command accidentally run against live infra | Ops | Critical | templates only, no command execution in repo work | go/no-go approval | AWS/psql/Kafka/ClickHouse execution before approval | TBD |
| M2-R14 | M2-3 observability/DLQ signal becomes raw data dump | Observability | Critical | safe metadata contract | incident template review | raw value required for triage by default | TBD |
| M2-R15 | M2-4 storage permits unsafe JSON expansion | Aurora/ClickHouse | High | suspicious-key validators | repository insert validation | unsafe key in JSON object | TBD |
| M2-R16 | M2-5 API idempotency semantics differ from service contract | API/Service | Medium | M2-5 and M2-6 cross-reference | integration tests | 200/201/409 mismatch | TBD |
| M2-R17 | M2-6 repository contract too broad for first runtime slice | Repository | Medium | interface methods only | M2-8 implementation review | broad query/raw dump method proposed | TBD |
| M2-R18 | M2-7 skeleton imported before production readiness | API runtime | High | validator checks server.js not wired | final route diff review | cdc-recovery imported by server.js early | TBD |

Current rule: no production rollout and no external infrastructure execution before go approval.
