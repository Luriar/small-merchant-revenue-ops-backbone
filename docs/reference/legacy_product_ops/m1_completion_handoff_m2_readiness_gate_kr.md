# M1 Completion Handoff And M2 Readiness Gate

## 1. 맥락

이 문서는 M1 private Aurora infra, M1.1 Aurora-backed operational API smoke, M1.2 Run / Retry / Reprocess Aurora smoke, M1.3 reproducible local smoke script 결과를 하나의 handoff 기준으로 잠근다.

프로젝트 본체는 release-to-issue traceability 기반 Event-Driven Product Ops Backbone이다. M1 완료 기준은 Aurora를 operational source of truth로 두고 intake, run reliability, safe read projection이 실제 Aurora-backed API에서 동작함을 확인하는 것이다.

이 문서는 M2 구현 문서가 아니다. ClickHouse, CDC, MSK, EKS, Airflow, Argo, Terraform apply를 이 문서 작성 과정에서 시작하지 않는다.

## 2. 작업 범위

포함:

- M1 완료 사실과 증거 문서 위치 정리.
- M2 진입 전제 조건 정의.
- ClickHouse / CDC / MSK / EKS를 시작해도 되는 기준 정의.
- 비용 점검, 중지, 재시작, 검증 명령 정리.
- secret, DB URL, token, endpoint를 placeholder로만 기록하는 운영 규칙 재확인.

제외:

- OpenAPI, DTO, handler, frontend, endpoint contract 변경.
- ClickHouse, CDC, MSK, EKS, Airflow, Argo 리소스 생성.
- Terraform apply 실행.
- 실제 secret ARN, `AURORA_DATABASE_URL`, password, bearer token, DB endpoint 기록.
- fake analytics 또는 ClickHouse 없이 분석 결과를 흉내내는 구현.

## 3. M1 완료 상태

M1은 다음 상태로 완료 처리한다.

| 단계 | 상태 | 증거 |
| --- | --- | --- |
| M1 private Aurora infra | passed | private Aurora + SSM path + baseline apply가 완료된 상태로 후속 smoke 통과 |
| Aurora baseline / post-baseline SQL | passed | `sources/aurora_ddl_v2.sql`, post-baseline SQL, permissions 적용 완료 |
| Runtime consistency check | passed | `infra/sql/aurora/smoke/001_runtime_consistency_checks.sql` 통과 |
| Aurora connection smoke | passed | `node apps/api/src/aurora-connection-smoke.js` returned `status=ok` |
| M1.1 operational API smoke | passed | `docs/m1_1_aurora_backed_api_smoke_kr.md` |
| M1.2 run/retry/reprocess smoke | passed | `docs/m1_2_run_retry_reprocess_aurora_smoke_kr.md` |
| M1.3 reproducible smoke scripts | added | `scripts/smoke/README.md`, `scripts/smoke/m1_1_aurora_api_smoke.sh`, `scripts/smoke/m1_2_run_retry_reprocess_smoke.sh` |

Relevant commits:

- `b1c0dcf` Document M1.1 Aurora-backed API smoke
- `abb9e7d` Document M1.2 run retry reprocess Aurora smoke
- `5ed54ac` Record M1.2 Aurora smoke result
- `df124b9` Add M1 Aurora smoke scripts

## 4. M1 Invariants

M1 is locked with the following invariants:

- Aurora is the operational source of truth.
- ClickHouse remains out of the M1 write/read validation path.
- Intake API 3종 are validated against Aurora-backed stores:
  - `POST /api/v1/changes`
  - `POST /api/v1/events/intake`
  - `POST /api/v1/issues/intake`
- Issue read APIs expose safe projection only.
- Issue raw `title`, `body`, `payload`, `reporter` values do not appear in read responses.
- Retry and reprocess create new `run` rows; they do not rewind existing runs.
- Retry only targets `failed` or `dlq` runs.
- Reprocess creates `run_type = reprocess`, `attempt = 0`.
- Idempotent replay returns the same `new_run_id`.
- `run_state_log` remains append-only and trigger-owned.
- Run detail read APIs do not expose raw `input_ref`, `output_ref`, `error_detail`, `idempotency_key`, or `reason`.

## 5. M2 Readiness Gate

M2 may start only when every item below is true.

### 5.1 Required M1 Evidence

- Latest worktree is clean.
- M1.1 manual smoke is documented as passed.
- M1.2 manual smoke is documented as passed.
- M1.3 smoke scripts exist and pass syntax validation:

```bash
bash -n scripts/smoke/*.sh
```

- If the M1 environment was stopped and restarted, rerun:

```bash
node apps/api/src/aurora-connection-smoke.js
bash scripts/smoke/m1_1_aurora_api_smoke.sh
bash scripts/smoke/m1_2_run_retry_reprocess_smoke.sh
```

### 5.2 Terraform Gate

M1-only operation is the Terraform default. `infra/terraform/envs/dev/variables.tf` defaults `enable_m2 = false`.

Before any M1-only plan/apply, confirm that the plan does not include M2 components:

```bash
cd infra/terraform/envs/dev
terraform plan
```

M2 requires explicit opt-in after an explicit readiness decision:

```bash
cd infra/terraform/envs/dev
terraform plan -var='enable_m2=true'
```

Terraform apply without explicit M2 opt-in must not create EKS, MSK, ClickHouse, Airflow, Argo, Karpenter, Helm add-ons, or other M2 components.

Do not run `terraform apply` for M2 until:

- The plan shows expected M2 components only.
- Cost impact is accepted.
- Stop/destroy plan is agreed.
- M1 Aurora smoke can be rerun after the plan without schema or API drift.
- No Debezium snapshot or CDC operation is already in progress.

### 5.3 Cost Gate

Before enabling M2, review cost for these components:

- NAT Gateway
- EKS control plane and node group
- Karpenter-managed nodes
- MSK Serverless
- ClickHouse EC2 + EBS
- MWAA / Airflow
- Load balancers and observability add-ons
- Cross-AZ data transfer

Cost acceptance checklist:

- Confirm the expected demo duration.
- Confirm whether resources are stopped or destroyed after the demo.
- Confirm account budget / alert coverage.
- Confirm `terraform destroy` owner and timing.
- Confirm no long-running MWAA, NAT Gateway, EKS, ClickHouse, or MSK resource remains unintentionally.

Do not treat old cost notes in this repository as authoritative prices. Check the AWS Pricing Calculator or current AWS pricing pages before M2 apply.

## 6. When ClickHouse / CDC / MSK / EKS May Start

ClickHouse / CDC / MSK / EKS work may begin only after the M2 readiness gate passes.

Allowed first M2 scope:

- Terraform plan review for M2 components.
- EKS bootstrap plan.
- MSK / ClickHouse connectivity plan.
- CDC design check using existing schema change order.
- Debezium connector configuration review.

Not allowed before M2 gate:

- Applying M2 Terraform resources.
- Starting Debezium / Strimzi connectors.
- Creating ClickHouse CDC target tables from an unreviewed schema.
- Running initial snapshot.
- Faking anomaly or analytics data in API responses.
- Changing OpenAPI/DTOs to fit incomplete analytics.

CDC/schema order remains:

1. Aurora schema
2. ClickHouse target table
3. ClickHouse Kafka engine table
4. Materialized view recreation

Never run Aurora `ALTER TABLE` during Debezium initial snapshot.

## 7. Verification Commands

### 7.1 Local Repository Checks

```bash
git status --short
bash -n scripts/smoke/*.sh
git diff --check
```

### 7.2 Terraform Readiness Checks

```bash
cd infra/terraform/envs/dev
terraform fmt -check -recursive ../..
terraform validate
terraform plan
```

For M2 plan review:

```bash
cd infra/terraform/envs/dev
terraform plan -var='enable_m2=true'
```

### 7.3 Aurora Connectivity And Schema Checks

Do not print the raw DB URL.

```bash
node apps/api/src/aurora-connection-smoke.js
psql "$AURORA_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f infra/sql/aurora/smoke/001_runtime_consistency_checks.sql
```

### 7.4 Reproducible M1 Smoke

API server and SSM port forwarding must already be running.

```bash
export API_BASE_URL='http://127.0.0.1:3000'
export AURORA_DB_SSLMODE=require
export CHANGE_STORE_BACKEND=aurora
export EVENT_STORE_BACKEND=aurora
export ISSUE_STORE_BACKEND=aurora
export RUN_STORE_BACKEND=aurora
export TRACE_STORE_BACKEND=aurora

bash scripts/smoke/m1_1_aurora_api_smoke.sh
bash scripts/smoke/m1_2_run_retry_reprocess_smoke.sh
```

Do not reuse the same `SMOKE_SUFFIX` unless intentionally testing idempotent replay.

## 8. Stop / Restart / Destroy Commands

These commands are templates. Replace placeholders locally and do not commit actual IDs, endpoints, account IDs, tokens, or secret values.

### 8.1 Find Terraform Outputs

```bash
cd infra/terraform/envs/dev
terraform output
terraform output -raw bastion_instance_id
terraform output -raw ssm_session_command
terraform output -raw aurora_secret_arn
```

### 8.2 Stop Local API

If the API was started in the foreground, use `Ctrl-C`.

If the API is running in a local process:

```bash
ps -ef | rg 'node apps/api/src/server.js'
kill <api-process-id>
```

### 8.3 Stop SSM Port Forwarding

If the SSM session is in the foreground, use `Ctrl-C`.

If it is running in the background:

```bash
ps -ef | rg 'aws ssm start-session'
kill <ssm-process-id>
```

### 8.4 Stop Aurora Temporarily

Use only when no smoke or migration is running.

```bash
aws rds stop-db-cluster \
  --db-cluster-identifier <aurora-cluster-identifier> \
  --region <aws-region>
```

Restart:

```bash
aws rds start-db-cluster \
  --db-cluster-identifier <aurora-cluster-identifier> \
  --region <aws-region>
```

After restart, re-run connectivity and M1 smoke before continuing:

```bash
node apps/api/src/aurora-connection-smoke.js
bash scripts/smoke/m1_1_aurora_api_smoke.sh
bash scripts/smoke/m1_2_run_retry_reprocess_smoke.sh
```

### 8.5 Destroy M2 Components

Use when M2 resources were intentionally created and the demo is complete.

```bash
cd infra/terraform/envs/dev
terraform destroy -target='module.argocd' -target='module.helm_addons'
terraform destroy -target='module.airflow'
terraform destroy -target='module.clickhouse' -target='module.msk'
terraform destroy -target='module.karpenter' -target='module.eks'
terraform destroy
```

If M1 Aurora must be preserved, stop before the final broad destroy and use a reviewed target plan instead.

## 9. M2 Start Checklist

Copy this checklist into the M2 execution note.

```text
M2 Readiness Gate

M1 evidence:
- M1.1 documented pass: yes | no
- M1.2 documented pass: yes | no
- M1.3 smoke scripts present: yes | no
- M1.3 smoke scripts syntax pass: yes | no
- Latest M1 smoke rerun after restart: yes | no | n/a

Terraform:
- git status clean: yes | no
- terraform fmt/validate pass: yes | no
- Default M1 plan reviewed and M2 components absent: yes | no
- M2 plan with enable_m2=true reviewed: yes | no

Cost:
- Cost owner accepted M2 resources: yes | no
- Stop/destroy owner assigned: yes | no
- Demo duration fixed: yes | no
- Budget/alert checked: yes | no

CDC safety:
- No Debezium snapshot currently running: yes | no
- Schema change order understood: yes | no
- No fake analytics planned: yes | no

Decision:
- Start M2: yes | no
- Notes:
```

## 10. 산출물 요약

M1.4 output is this handoff document.

Acceptance criteria:

- M1 completion state is summarized in one place.
- M2 readiness gate is explicit.
- ClickHouse / CDC / MSK / EKS start criteria are defined.
- Cost review and stop/restart/destroy commands are documented with placeholders only.
- No implementation or contract files are changed.

## 11. 남은 리스크 또는 TODO

- Actual M2 costs must be checked against current AWS pricing before apply.
- Existing smoke rows remain in Aurora by design.
- If M2 changes Aurora schema, update ClickHouse/CDC artifacts in the required order and re-run M1 smoke afterward.
- M2 remains opt-in. Use explicit `-var='enable_m2=true'` only after the M2 readiness gate passes.
