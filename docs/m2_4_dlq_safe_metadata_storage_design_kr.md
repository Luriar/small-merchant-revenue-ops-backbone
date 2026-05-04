# M2-4 DLQ Safe Metadata Storage Design

## Purpose

M2-4는 M2-3 Observability / DLQ / Replay Integration Contract를 safe metadata storage design으로 구체화한다.

이 단계는 DLQ와 replay 상태를 어디에 어떤 형태로 보관할지 정의한다. 핵심 원칙은 DLQ가 raw message archive가 아니라 evidence-safe failure metadata 저장/전달 경로라는 점이다.

This is not production rollout.

## Non-Goals

M2-4에서 하지 않는 일:

- AWS 연결
- SQL apply
- Kafka topic 생성
- replication slot 생성
- Debezium 배포
- ClickHouse 시작
- raw failed message 저장
- raw message replay 구현
- M2-1 CDC contract 변경
- OpenAPI 변경

## Relationship To M2-3

M2-3는 failure classification, observability signal, DLQ message contract, replay/reprocess contract를 정의했다.

M2-4는 그 contract를 다음 storage design으로 변환한다.

- Kafka DLQ topic contract
- Aurora operational source-of-truth table proposal
- optional ClickHouse analytical read model proposal
- replay request linkage with run/retry/reprocess direction

M2-1 vertical slice는 그대로 유지된다.

```text
public.prod_change
-> public.trace
-> safe public.issue CDC
-> Kafka
-> ClickHouse
```

## Storage Role Split

### Aurora Source Of Truth

Aurora source of truth 역할:

- DLQ failure 상태의 운영 정본
- replay/reprocess approval 상태의 운영 정본
- failure state transition 기록
- idempotency key 기반 replay 중복 방지
- future run row linkage
- `evidence_report_ref` linkage

Aurora table proposal:

- `public.cdc_failure`
- `public.cdc_replay_request`
- `public.cdc_failure_state_log`

### Kafka DLQ Topic

Kafka DLQ topic 역할:

- bounded transport/buffer for failure metadata
- failure field-name set, parser class, missing/unexpected field names 전달
- raw failed message body를 운반하지 않는 metadata-only channel

Proposed topic:

- `cdc.dlq.m2_1_traceability`

### ClickHouse Read Model

ClickHouse read model 역할:

- DLQ trend/operability query
- failure type count
- owner/status aging
- replay attempt trend
- cleanup completion trend

ClickHouse는 source of truth가 아니다.

Optional read model proposal:

- `cdc_failure_read_model`
- `cdc_replay_request_read_model`

## Why DLQ Is Metadata-Only

DLQ는 failure를 설명해야 하지만 raw data를 보관하면 안 된다.

허용되는 evidence-safe metadata:

- failure id
- failure type
- source topic
- source table
- primary key identifiers
- op
- ts_ms
- observed field-name set
- missing required field names
- unexpected field names
- forbidden field names detected
- parser error class
- parser error summary without raw values
- status
- owner
- attempt count
- evidence report reference

금지:

- no raw payloads
- no full message bodies
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

## Replay Is Not Raw Message Replay By Default

Replay is not raw message replay by default.

Replay/reprocess should prefer:

- safe metadata
- source re-read from approved safe columns
- safe CDC/outbox table if a future design requires stronger source-side control
- delete-specific ingestion strategy when `REPLICA IDENTITY DEFAULT` DELETE shape is partial

Replay must not:

- use DLQ as raw source-of-truth storage
- broaden publication scope
- enable `publication.autocreate.mode=all_tables`
- switch to `REPLICA IDENTITY FULL` as a quick fix
- preserve raw failed messages for convenience

## Status Lifecycle

Suggested `cdc_failure.status` lifecycle:

```text
open -> triaged -> replay_requested -> replay_approved -> resolved
open -> triaged -> reprocess_requested -> reprocess_approved -> resolved
open -> triaged -> closed_no_replay
open -> triaged -> blocked
```

Suggested `cdc_replay_request.status` lifecycle:

```text
requested -> approved -> running -> succeeded -> cleanup_complete
requested -> rejected
approved -> cancelled
running -> failed
failed -> cleanup_complete
```

State changes should be captured in `cdc_failure_state_log`.

## Idempotency Rules

Replay request idempotency is required.

`cdc_replay_request.idempotency_key` should be derived from:

- `failure_id`
- replay target
- bounded source scope
- attempt number
- requested action

If the same request is submitted again with the same idempotency key, it should resolve to the same replay request and the same future new run row if already created.

## Run / Replay Linkage

Replay and reprocess must create a new run row.

The original failure remains immutable.

Storage fields:

- `source_run_id`: optional original run reference
- `new_run_id`: nullable future run row reference
- `failure_id`: failure reference
- `replay_request_id`: replay request reference
- `idempotency_key`: replay duplicate guard

M2-4 does not implement runtime run creation. It only defines the storage linkage.

## Evidence Report Linkage

`evidence_report_ref` links failure and replay records to evidence-safe reports.

The reference may point to a future report artifact, ticket id, or runbook output identifier. It must not contain raw payloads, full message bodies, secrets, endpoints, account IDs, or PII.

## Stop Conditions

Stop immediately if:

- a proposed table/topic stores raw payloads or full message bodies
- a proposed column stores issue title/body/payload/reporter values
- a proposed column stores prod_change payload/actor values
- DLQ topic uses raw message body as value
- replay uses raw message replay by default
- replay does not create a new run row
- idempotency key is omitted
- `evidence_report_ref` is omitted
- publication scope is broadened
- `REPLICA IDENTITY FULL` is proposed as a quick fix
- cleanup evidence cannot be recorded

## Validation

Static checks:

```bash
python3 scripts/validate_m2_4_dlq_storage_contract.py
npm run validate:m2-4:dlq-storage-contract
python3 -m py_compile scripts/validate_m2_4_dlq_storage_contract.py
git diff --check
```

## Next-Step Options

Possible next steps:

- M2-5: DLQ/replay API contract and idempotent request validation
- M2-5: CDC recovery dashboard query contract
- M2-5: safe outbox table design
- M2-5: controlled runtime dry-run execution using M2-2 package

Recommended next step:

- M2-5 should define DLQ/replay API contract and idempotent request validation before runtime implementation.

Reason:

- M2-4 defines safe storage shape.
- The next integration boundary is how an operator or worker creates replay/reprocess requests without raw message replay or duplicate recovery runs.

M2-5 API contract reference:

- `docs/m2_5_dlq_replay_api_contract_kr.md`
- `docs/m2_5_idempotent_replay_request_rules_kr.md`
- `docs/m2_5_openapi_patch_proposal_kr.md`
- `sources/openapi_m2_5_dlq_replay_patch.yaml`

M2-5 defines the API contract for inspecting `cdc_failure` and creating, approving, and cancelling `cdc_replay_request` safely.
