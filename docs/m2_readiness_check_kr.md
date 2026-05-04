# M2 Readiness Check

## 1. 결론

현재 V1은 M2 준비를 시작할 만큼 정리되어 있다.

근거:

- M1 private Aurora infra가 검증되었다.
- M1.1 intake / safe projection smoke가 통과했다.
- M1.2 run / retry / reprocess / state-log smoke가 통과했다.
- M1.3 reproducible smoke script가 추가되고 검증되었다.
- M1.5에서 Terraform `enable_m2` 기본값이 `false`로 고정되었다.
- V1 frontend productization이 완료되었다.
- V1 demo guide와 screenshot checklist가 추가되었다.

단, 이 문서 기준으로 **M2는 아직 구현되지 않았다**. ClickHouse, CDC, MSK, EKS, Airflow, Argo, Karpenter는 현재 준비 artifact와 Terraform module이 있을 뿐이며, 이 readiness check 과정에서 적용하거나 실행하지 않았다.

## 2. 현재 V1 상태 요약

V1의 본체는 Aurora를 operational source of truth로 사용하는 release-to-issue traceability 기반 Product Ops Backbone이다.

구현/검증된 V1 범위:

- `POST /api/v1/changes`
- `POST /api/v1/events/intake`
- `POST /api/v1/issues/intake`
- `POST /api/v1/traces`
- `POST /api/v1/runs/{run_id}/retry`
- `POST /api/v1/reprocess`
- issue / run safe read projection
- trace / evidence read path
- run_state_log append-only lifecycle
- M1 demo seed
- `?data=api&demo=m1` frontend demo mode
- V1 empty / loading / error state polish

V1에서 의도적으로 하지 않은 것:

- ClickHouse metric series 생성
- anomaly marker 생성
- fake baseline / actual / delta 생성
- fake affected users 생성
- CDC / MSK / EKS / Airflow / Argo 실행

## 3. M2 목적

M2의 목적은 Aurora 운영 정본을 유지하면서, 분석/집계/read-model 레이어를 분리하는 것이다.

M2에서 추가할 방향:

- Aurora operational facts를 CDC 또는 명시적 ingestion path로 ClickHouse에 전달한다.
- ClickHouse는 timeline, aggregate, anomaly read model을 담당한다.
- V1 API/UI는 raw 운영 정본을 계속 Aurora 기준으로 유지한다.
- dashboard timeline, signal context, issue/change trend 같은 read-heavy 영역을 ClickHouse 기반으로 확장한다.

핵심 원칙:

- Aurora는 운영 정본이다.
- ClickHouse는 분석/집계/read-model 레이어다.
- M2는 V1의 safe projection 원칙을 약화하지 않는다.
- M2는 fake analytics를 만들기 위한 단계가 아니다.

## 4. M2 Non-goals

M2-1에서 하지 말아야 할 것:

- OpenAPI/DTO/endpoint contract를 먼저 바꾸는 것
- V1 frontend에 fake analytics를 넣는 것
- ClickHouse에 raw PII를 무분별하게 복제하는 것
- issue raw body / reporter / payload / title을 CDC로 전송하는 것
- run `input_ref`, `output_ref`, `error_detail` 원문을 read model에 노출하는 것
- evidence payload를 PII 판정 없이 그대로 분석 레이어에 공개하는 것
- Debezium initial snapshot 중 Aurora DDL을 변경하는 것
- M2 Terraform을 비용/중지/검증 계획 없이 apply하는 것
- M2가 완료된 것처럼 README나 portfolio 문구를 바꾸는 것

## 5. Repo에서 확인한 기존 M2 Asset

### 5.1 ClickHouse DDL

위치:

```text
sources/clickhouse_ddl_v2_1.sql
infra/sql/clickhouse/README.md
```

확인된 내용:

- `events_raw`
- `events_raw_kafka`
- `events_agg_1m`
- `prod_change_cdc`
- `prod_change_cdc_kafka`
- `trace_cdc`
- `trace_cdc_kafka`
- `issue_cdc`
- `issue_cdc_kafka`
- `anomaly_detection_results`
- `anomaly_trace_link`
- Kafka engine table
- materialized view
- TTL / ReplacingMergeTree / AggregatingMergeTree 운영 주석

주의:

- 실제 ClickHouse SQL 배포 위치인 `infra/sql/clickhouse`는 아직 placeholder README 수준이다.
- `sources/clickhouse_ddl_v2_1.sql`은 설계 source artifact로 남아 있다.
- M2-1에서 이 DDL을 그대로 적용하기 전에 현재 Aurora DDL과 컬럼 정합성을 다시 확인해야 한다.

### 5.2 Aurora Logical Replication SQL

위치:

```text
sources/aurora_logical_replication.sql
```

확인된 내용:

- `debezium_cdc` replication user 생성 템플릿
- `REPLICA IDENTITY FULL`
  - `public.prod_change`
  - `public.trace`
  - `public.issue`
- publication
  - `aurora_prod_change_pub`
  - `aurora_trace_pub`
  - `aurora_issue_pub`
- issue publication column filter
- replication slot 검증 쿼리
- WAL 누적 / snapshot 중 DDL 금지 운영 주의사항

주의:

- Aurora PostgreSQL 15+ 전제다.
- `rds.logical_replication = 1` 등 parameter group 설정과 재부팅이 필요하다.
- 실제 password, endpoint, slot 상태는 이 문서에 기록하지 않는다.

### 5.3 Strimzi / Debezium Manifest

위치:

```text
sources/strimzi_connect.yaml
sources/strimzi_connectors.yaml
sources/strimzi_deployment_notes.md
```

확인된 내용:

- KafkaConnect cluster manifest
- Debezium PostgreSQL connector 3종
  - `aurora-prod-change-connector`
  - `aurora-trace-connector`
  - `aurora-issue-connector`
- SMT unwrap + `op`, `ts_ms` field 추가
- RegexRouter로 topic name 단순화
- issue `column.exclude.list`로 raw PII field 제외
- 배포 순서와 운영 주의사항

주의:

- manifest에는 placeholder가 남아 있다.
  - Aurora host/user/password
  - MSK bootstrap servers
  - ECR registry
  - IAM role ARN
  - Debezium plugin sha512
- 실제 적용 전 secret 주입 방식과 checksum을 확정해야 한다.

### 5.4 Terraform M2 Opt-in Safety

위치:

```text
infra/terraform/envs/dev/variables.tf
infra/terraform/envs/dev/main.tf
infra/terraform/README.md
docs/m1_completion_handoff_m2_readiness_gate_kr.md
```

확인된 내용:

- `enable_m2` default는 `false`.
- M2 module은 `var.enable_m2 ? 1 : 0`으로 gated.
- gated module:
  - EKS
  - Karpenter
  - MSK
  - ClickHouse
  - Airflow
  - Helm add-ons
  - Argo CD
- Terraform apply without explicit M2 opt-in must not create M2 resources.

주의:

- 이 readiness check에서는 Terraform plan/apply를 실행하지 않았다.
- M2 plan은 비용 승인과 destroy 계획 이후 별도 단계로 확인해야 한다.

### 5.5 Smoke / Demo 문서

위치:

```text
scripts/smoke/README.md
scripts/smoke/m1_1_aurora_api_smoke.sh
scripts/smoke/m1_2_run_retry_reprocess_smoke.sh
scripts/demo/README.md
scripts/demo/m1_mvp_seed.sh
docs/v1_demo_guide_kr.md
docs/v1_screenshot_checklist_kr.md
```

확인된 내용:

- 현재 smoke/demo는 M1/Aurora-only로 명확히 제한되어 있다.
- M2 ClickHouse/CDC/MSK/EKS 검증은 아직 없다.

## 6. M2 준비 Gap

M2 구현 전에 해결해야 할 gap:

1. `sources/clickhouse_ddl_v2_1.sql`을 실제 적용 경로로 승격할지 결정해야 한다.
2. ClickHouse DDL과 현재 Aurora DDL의 컬럼 정합성 재검증이 필요하다.
3. `prod_change`, `trace`, `issue` 외 테이블의 CDC 범위를 결정해야 한다.
4. `event_intake`를 CDC로 보낼지, 별도 event raw ingestion path로 보낼지 결정해야 한다.
5. `evidence`의 `payload` / `source_ref` PII 가능성을 판정해야 한다.
6. `run` / `run_state_log`를 ClickHouse read model에 넣을지 결정해야 한다.
7. ClickHouse-backed API repository가 아직 없다.
8. M2 smoke script가 아직 없다.
9. CDC lag / slot WAL growth / connector failure 관측 기준이 아직 로컬 검증 script로 고정되지 않았다.
10. Terraform M2 비용과 destroy 절차를 실제 실행 계획으로 확정해야 한다.

## 7. Aurora Table Priority

### Priority 1: 첫 CDC/read-model 후보

| Aurora table | 목적 | M2-1 권장 |
| --- | --- | --- |
| `prod_change` | release/flag/rule marker | 포함 |
| `trace` | suspected trace link | 포함 |
| `issue` | issue family/status/severity safe projection | 포함, raw PII 제외 |

이 세 테이블은 이미 `sources/aurora_logical_replication.sql`, `sources/strimzi_connectors.yaml`, `sources/clickhouse_ddl_v2_1.sql`에 반영되어 있다. M2-1의 가장 작은 CDC vertical slice로 적합하다.

### Priority 2: M2-1 후반 또는 M2-2 후보

| Aurora table | 목적 | 결정 필요 |
| --- | --- | --- |
| `event_intake` | product/support event fact | CDC vs explicit event ingestion path 결정 필요 |
| `evidence` | trace reasoning details | payload/source_ref PII 판정 후 포함 |
| `run` | reliability aggregate | safe column만 포함 가능 |
| `run_state_log` | recovery history aggregate | reason/metadata 제외 또는 sanitize 필요 |

### Priority 3: 우선 제외

| Aurora table | 이유 |
| --- | --- |
| `change_intake_idempotency` | 운영 멱등 원장. 분석 read model 불필요 |
| `issue_intake_idempotency` | 운영 멱등 원장. 분석 read model 불필요 |
| `issue_ops_meta` | 운영 메타 성격. M2-1 read path에 불필요 |
| `cd_mstr`, `cd_cmmn` | 작은 reference data. 필요 시 별도 static mapping 가능 |

## 8. Raw Operational Facts로 복제할 데이터

M2에서 raw operational fact로 보존할 수 있는 후보:

- `prod_change`
  - `change_id`
  - `chgt_cd`
  - `title`
  - `target_service`
  - `target_component`
  - `variation`
  - `cohort`
  - `source`
  - `occurred_at`
  - `received_at`
  - `created_at`
  - `updated_at`
- `trace`
  - `trace_id`
  - `change_id`
  - `primary_issue_id`
  - `status`
  - `confidence`
  - `anomaly_window_start`
  - `anomaly_window_end`
  - `anomaly_type`
  - `anomaly_metric`
  - `linked_event_count`
  - `linked_issue_count`
  - `evidence_count`
  - `generated_by_run_id`
  - timestamps
- `issue`
  - `issue_id`
  - `external_id`
  - `source`
  - `issue_family`
  - `severity`
  - `status`
  - `keywords`
  - `affected_variation`
  - `occurred_at`
  - `received_at`
  - `resolved_at`
  - timestamps

복제 금지 또는 보류:

- issue `body`
- issue `payload`
- issue `reporter`
- issue `title`
- run `input_ref`
- run `output_ref`
- run `error_detail`
- idempotency key 원문
- secret, token, DB URL 계열 값

## 9. ClickHouse / Read-model Priority

### M2-1 read model

권장:

1. `prod_change_cdc`
2. `trace_cdc`
3. `issue_cdc`
4. trace overview용 join/aggregation query
5. dashboard timeline의 `change_markers`

이 단계에서는 metric series와 anomaly marker를 꾸며내지 않는다. 실제 `events_agg_1m` 또는 `anomaly_detection_results`가 생기기 전까지는 빈 series / 빈 anomaly marker가 맞다.

### M2-2 read model

권장:

1. `event_intake` 또는 event raw ingestion path
2. `events_raw`
3. `events_agg_1m`
4. real metric series
5. real anomaly detection input

### M2-3 read model

권장:

1. `anomaly_detection_results`
2. `anomaly_trace_link`
3. Airflow-based anomaly detection / trace evaluation
4. long-window trend dashboard

## 10. CDC / ETL Decision Points

M2 구현 전 결정해야 할 사항:

### 10.1 event path

선택지:

- A. Aurora `event_intake`를 CDC로 ClickHouse에 복제한다.
- B. API event intake 시 MSK `events.raw`로도 발행한다.
- C. batch backfill로 `event_intake`를 ClickHouse `events_raw`에 적재한다.

권장:

- M2-1에서는 event path를 보류한다.
- 먼저 `prod_change` / `trace` / safe `issue` CDC를 끝까지 검증한다.
- event analytics는 M2-2에서 별도 결정한다.

### 10.2 evidence path

선택지:

- A. `evidence` 전체를 CDC로 복제한다.
- B. `summary`, `evdt_cd`, `evds_cd`, `source_ref`, `event_refs`만 복제한다.
- C. evidence는 계속 Aurora에서 읽고 ClickHouse에는 trace rollup만 둔다.

권장:

- M2-1에서는 evidence CDC를 보류한다.
- V1 evidence detail은 Aurora safe read path로 이미 동작한다.
- M2-2에서 payload/source_ref PII 판정 후 safe subset만 복제한다.

### 10.3 run / run_state_log path

선택지:

- A. `run` safe columns만 CDC로 복제한다.
- B. `run_state_log` safe columns만 CDC로 복제한다.
- C. reliability panel은 계속 Aurora read path를 사용한다.

권장:

- M2-1에서는 reliability panel을 Aurora에 유지한다.
- M2-2 이후 `run_type/status/created_at` aggregate가 필요할 때 safe subset으로 확장한다.

### 10.4 API read switch

선택지:

- A. 기존 endpoint contract를 유지하고 repository만 ClickHouse-backed로 교체한다.
- B. 새 endpoint를 추가한다.
- C. frontend에서 ClickHouse 전용 endpoint를 직접 호출한다.

권장:

- M2-1에서는 기존 API contract를 유지한다.
- backend repository boundary에서 ClickHouse-backed read model을 선택하도록 한다.
- frontend contract를 먼저 흔들지 않는다.

## 11. V1 Screens That Benefit First

우선 수혜 화면:

1. `#traceability`
   - real timeline context
   - trace / issue / change read-heavy query
   - future anomaly markers
2. `#changes`
   - change timeline scale-out
   - linked trace count/query 속도 개선
3. `#issues`
   - issue family trend
   - linked trace rollup
4. `#runs`
   - M2-1에서는 낮은 우선순위
   - reliability action UX는 Aurora operational source of truth가 더 적합

M2-1에서는 `#traceability`와 `#changes`에 집중하는 것이 가장 작고 안전하다.

## 12. Recommended M2-1 Scope

가장 작은 안전한 M2-1 slice:

```text
Aurora prod_change / trace / safe issue
-> Debezium CDC
-> MSK topics
-> ClickHouse prod_change_cdc / trace_cdc / issue_cdc
-> read-only validation query
-> existing API contract behind repository boundary
```

M2-1에 포함:

- M2 Terraform plan review with `-var='enable_m2=true'`
- 비용/중지/destroy 계획 확정
- ClickHouse DDL 정합성 점검
- Aurora logical replication prerequisite 점검
- Debezium connector placeholder 제거
- `prod_change`, `trace`, safe `issue` CDC vertical slice
- ClickHouse row count / latest timestamp / PII exclusion validation
- API read path는 contract 유지
- frontend 변경은 가능하면 없음

M2-1에서 제외:

- event metric series
- anomaly detection job
- `anomaly_detection_results`
- `anomaly_trace_link`
- Airflow DAG 구현
- Argo rollout 시연
- run/reliability ClickHouse read model
- evidence payload CDC
- portfolio README polish

## 13. Implementation Order

권장 순서:

1. Worktree clean 확인.
2. M1 smoke 재실행 여부 결정.
3. Terraform M2 plan만 실행하고 apply하지 않는다.
4. M2 비용과 destroy owner를 확정한다.
5. ClickHouse DDL을 현재 Aurora DDL과 대조한다.
6. `infra/sql/clickhouse` 적용 경로를 정리한다.
7. Aurora logical replication prerequisite를 확인한다.
8. Debezium connector placeholder와 secret 주입 방식을 정리한다.
9. `prod_change` CDC만 먼저 end-to-end 검증한다.
10. `trace` CDC를 추가한다.
11. safe `issue` CDC를 추가한다.
12. ClickHouse validation query와 M2 smoke script를 작성한다.
13. API repository boundary에서 read model 사용 여부를 feature flag로 검토한다.
14. `#traceability` / `#changes` 화면에서 contract drift 없이 데이터가 유지되는지 확인한다.

## 14. Validation Strategy

M2 validation은 단계별로 나눠야 한다.

### 14.1 Repository / static validation

```bash
git status --short
git diff --check
```

Terraform:

```bash
terraform -chdir=infra/terraform/envs/dev validate
terraform -chdir=infra/terraform/envs/dev plan -var='enable_m2=true'
```

주의: readiness 단계에서는 apply하지 않는다.

### 14.2 Aurora validation

확인 항목:

- PostgreSQL 15+ 여부
- logical replication parameter 활성화 여부
- publication 컬럼 목록
- issue PII column 제외 여부
- replication slot lag 감시 쿼리

금지:

- raw DB URL 출력
- password / SecretString 출력

### 14.3 CDC validation

확인 항목:

- connector status
- topic message count
- Debezium `op`, `ts_ms` field 존재
- delete rewrite behavior
- snapshot completion
- connector restart 후 중복 허용성

### 14.4 ClickHouse validation

확인 항목:

- `prod_change_cdc` row count
- `trace_cdc` row count
- `issue_cdc` row count
- `_deleted = 0` filter
- latest `_ts_ms`
- PII column absence
- `FINAL` 없이도 argMax pattern으로 최신 row 조회 가능 여부

PII audit 예:

```sql
SELECT name
FROM system.columns
WHERE table = 'issue_cdc'
  AND name IN ('body', 'payload', 'reporter', 'title');
```

결과는 0 row여야 한다.

### 14.5 API/UI validation

확인 항목:

- 기존 endpoint contract 유지
- `?data=api` 정상 동작
- `?data=api&demo=m1` 정상 동작
- empty / loading / error state 유지
- fake series / fake anomaly marker 미생성
- raw field 미노출

## 15. Risk List

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Terraform M2 비용 증가 | 불필요한 장기 비용 | apply 전 cost/destroy owner 확정 |
| Replication slot WAL 누적 | Aurora storage pressure | slot lag alarm, 장기 중단 시 slot 삭제 절차 |
| issue PII CDC 유출 | 보안/신뢰성 손상 | publication column filter + Debezium exclude + CH column audit |
| event payload PII | analytics layer 오염 | M2-1 event path 보류, PII 판정 후 확장 |
| Debezium snapshot 중 DDL | CDC consistency 깨짐 | snapshot 중 Aurora ALTER 금지 |
| CH schema drift | consume failure 또는 silently dropped field | Aurora -> CH target -> Kafka engine -> MV 순서 준수 |
| at-least-once 중복 | 집계 오차 | CDC table은 ReplacingMergeTree, event raw는 dedupe 전략 별도 |
| API contract drift | V1 frontend regression | repository boundary 내부 변경 우선 |
| fake analytics 유혹 | 프로젝트 정체성 훼손 | 실제 event/read model 전까지 series/anomaly marker는 빈 값 유지 |

## 16. Files Not To Touch Yet

M2-1 시작 전에는 다음을 임의로 바꾸지 않는다.

- `personal_project_openapi_v0_2.yaml`
- OpenAPI / DTO / endpoint contract
- V1 frontend layout
- V1 demo seed script
- M1 smoke script
- Aurora baseline DDL
- Terraform apply state
- root README / portfolio polish
- issue raw field handling
- run retry/reprocess contract

M2-1에서 수정이 필요해질 수 있지만, 별도 task로 분리해야 하는 파일:

- `infra/sql/clickhouse/README.md`
- `sources/clickhouse_ddl_v2_1.sql`
- `sources/aurora_logical_replication.sql`
- `sources/strimzi_connect.yaml`
- `sources/strimzi_connectors.yaml`
- `infra/terraform/envs/dev/*`
- ClickHouse-backed repository 후보 파일
- M2 smoke script 후보 파일

## 17. 최종 판정

M2 준비를 시작할 수 있다.

하지만 M2 구현 착수 전 첫 작업은 전체 플랫폼을 한 번에 올리는 것이 아니라, 다음 vertical slice를 검증하는 것이다.

```text
prod_change -> trace -> safe issue CDC
```

이 slice가 ClickHouse에 안전하게 도착하고, PII가 제외되며, 기존 API contract를 깨지 않는다는 것이 확인된 후에 event analytics, anomaly detection, Airflow, Argo, reliability read model을 순차 확장한다.

이 문서 작성 시점 기준으로 **M2는 아직 구현되지 않았다**.

