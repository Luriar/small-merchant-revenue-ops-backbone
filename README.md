# Event-Driven Product Ops Backbone

**Aurora를 operational source of truth로 사용하는 AI-era Product Ops Backbone**

제품 변경, 외부 이벤트, 이슈, 근거, 실행 복구 흐름을 하나로 연결해 운영자가 **“무엇이 바뀌었고, 어떤 문제가 생겼으며, 어떤 근거로 연결되었고, 지금 무엇을 해야 하는지”** 판단할 수 있게 하는 M1 기반 MVP입니다.

이 프로젝트는 단순 CRUD backend가 아니라, AI 시대의 제품 운영을 위한 **evidence-backed operational reasoning layer**를 목표로 합니다.

---

## 1. Why this exists

AI SaaS와 product operations 환경에서는 다양한 외부 신호가 계속 들어옵니다.

- release / feature flag / rule change
- product event
- support issue
- VOC / review / incident signal
- failed processing run
- retry / reprocess operation

하지만 실제 운영에서는 이 신호들이 분리되어 있어 다음 질문에 답하기 어렵습니다.

```text
무엇이 바뀌었는가?
그 이후 어떤 문제가 발생했는가?
이 문제와 변경은 어떤 근거로 연결되는가?
지금 retry해야 하는가, reprocess해야 하는가?
AI나 운영자가 신뢰할 수 있는 safe projection은 무엇인가?
```

이 프로젝트는 이 흐름을 **구조화된 operational source of truth** 위에 연결합니다.

---

## 2. Product concept

MVP는 다음 운영 흐름을 보여줍니다.

```text
Product Change
→ Event / Issue Intake
→ Suspected Trace
→ Evidence
→ Failed Run
→ Retry / Reprocess
→ Append-only State Log
```

핵심은 “분석 dashboard처럼 보이게 만드는 것”이 아니라, 실제 운영 데이터가 안전하고 추적 가능한 방식으로 연결되는 것입니다.

즉, 이 MVP는 단순히 데이터를 저장하는 것이 아니라 **change, issue, trace, evidence, recovery action**을 하나의 판단 흐름으로 묶습니다.

---

## 3. MVP demo flow

M1 MVP demo story는 다음과 같습니다.

1. Checkout release가 배포된다.
2. `payment_failed` event signal이 발생한다.
3. `checkout_payment_failure` issue가 intake된다.
4. `suspected trace`가 change + issue + evidence를 연결한다.
5. `failed normalization run`이 존재한다.
6. retry 요청으로 `pending retry run`이 생성된다.
7. reprocess 요청으로 `pending reprocess run`이 생성된다.
8. 화면은 raw data가 아니라 safe projection만 보여준다.

MVP demo는 실제 Aurora-backed row를 사용합니다.  
`demo=m1` 모드는 smoke row와 일반 API row를 제외하고 demo seed row만 보여주도록 분리되어 있습니다.

---

## 4. MVP screens

Demo mode URL:

```text
http://127.0.0.1:5173/?data=api&demo=m1#traceability
http://127.0.0.1:5173/?data=api&demo=m1#changes
http://127.0.0.1:5173/?data=api&demo=m1#issues
http://127.0.0.1:5173/?data=api&demo=m1#runs
```

### Traceability Overview

Shows:

- suspected trace
- linked change
- linked issue
- evidence rows
- confidence
- operational action context

이 화면은 “어떤 change가 어떤 issue와 연결되었는지”를 evidence 중심으로 보여줍니다.

### Change Timeline

Shows:

- checkout release
- release count
- linked suspected trace

이 화면은 “어떤 product change가 후속 운영 이슈와 연결되었는가”를 보여줍니다.

### Linked Issue View

Shows:

- `checkout_payment_failure` issue
- safe issue projection
- linked trace

Raw issue body나 reporter email은 노출하지 않습니다.

### Reliability Panel

Shows:

- failed source run
- pending retry run
- pending reprocess run
- run state log

이 화면은 실패한 실행과 recovery action이 어떻게 기록되는지 보여줍니다.

---

## 5. Architecture

```text
apps/web
  React + Vite frontend
  API mode: ?data=api
  M1 demo mode: ?data=api&demo=m1

apps/api
  Node.js API server
  Change / Event / Issue intake
  Trace / Evidence read path
  Run / Retry / Reprocess reliability path

Aurora PostgreSQL
  Operational source of truth
  change, event_intake, issue, trace, evidence, run, run_state_log
  idempotency ledgers

scripts/smoke
  Reproducible Aurora-backed smoke checks

scripts/demo
  M1 MVP synthetic demo seed
```

Local development에서는 private Aurora 접근을 위해 SSM port forwarding을 사용합니다.

---

## 6. M1 implementation scope

M1에서 구현하고 검증한 범위는 다음과 같습니다.

- Aurora operational source of truth
- change intake
- event intake
- issue intake
- idempotency replay
- trace / evidence
- safe issue read projection
- safe run read projection
- failed run seed
- retry
- reprocess
- append-only `run_state_log`
- reproducible smoke scripts
- MVP demo seed script
- frontend API mode
- M1 demo mode

Demo seed는 가능한 경우 public M1 API를 사용합니다.  
단, 현재 public run-create API가 없기 때문에 failed source run만 seed-only Aurora DML로 생성합니다.

---

## 7. M1 / M2 boundary

M1과 M2의 역할은 명확히 분리합니다.

```text
M1 = operational correctness + MVP demo
M2 = analytics + streaming + scale-out expansion
```

M1은 운영 정합성, idempotency, traceability, safe projection, retry/reprocess가 실제 API와 화면에서 성립하는지 검증하는 단계입니다.

M2는 이후 확장 레이어입니다.

Deferred M2 components:

- ClickHouse
- CDC
- Debezium
- Strimzi
- MSK
- EKS
- Airflow
- Argo
- Karpenter
- high-speed analytical read models
- real metric series
- real anomaly markers

M2가 필요 없다는 뜻은 아닙니다.  
다만 MVP의 본질 검증 이후에 붙이는 것이 맞습니다.

---

## 8. Why this is not fake analytics

이 MVP는 analytics를 흉내내지 않습니다.

M1 demo mode는 다음 원칙을 따릅니다.

- fake ClickHouse data를 만들지 않는다.
- fake CDC stream을 만들지 않는다.
- fake anomaly marker를 만들지 않는다.
- fake metric series를 만들지 않는다.
- M2 infrastructure가 구현된 것처럼 주장하지 않는다.
- demo summaries는 실제 M1 demo row를 기준으로만 파생한다.
- trace와 evidence는 실제 Aurora-backed record로 존재한다.

따라서 이 MVP는 “가짜 분석 dashboard”가 아니라 **operational reasoning flow를 실제 데이터로 연결한 demo**입니다.

---

## 9. Verification status

| Area | Status |
|---|---|
| M1 private Aurora infra | PASS |
| Aurora DDL / permissions / runtime consistency | PASS |
| Aurora connection smoke | PASS |
| M1.1 intake / safe projection smoke | PASS |
| M1.2 retry / reprocess / state-log smoke | PASS |
| M1.3 reproducible smoke scripts | PASS |
| M1.5 M2 opt-in Terraform safety | PASS |
| Frontend API shape alignment | PASS |
| M1 MVP demo seed | PASS |
| M1 demo mode frontend verification | PASS |

---

## 10. Run demo locally

### Prerequisites

Required locally:

- AWS CLI configured
- active SSM port forwarding to Aurora
- `AURORA_DATABASE_URL` or `DATABASE_URL`
- Node.js / npm
- `curl`
- `jq`
- `psql`

실제 database URL, password, SecretString, bearer token, secret ARN, DB endpoint는 출력하거나 커밋하지 않습니다.

### API server

```bash
cd ~/projects/product-ops-backbone

export AURORA_DB_SSLMODE=require
export CHANGE_STORE_BACKEND=aurora
export EVENT_STORE_BACKEND=aurora
export ISSUE_STORE_BACKEND=aurora
export RUN_STORE_BACKEND=aurora
export TRACE_STORE_BACKEND=aurora
export DATABASE_URL="$AURORA_DATABASE_URL"

node apps/api/src/server.js
```

### Web dev server

```bash
cd ~/projects/product-ops-backbone

npm --prefix apps/web run dev -- --host 127.0.0.1
```

### Seed MVP demo data

```bash
cd ~/projects/product-ops-backbone

export API_BASE_URL="http://127.0.0.1:3000"
export WEB_BASE_URL="http://127.0.0.1:5173"

bash scripts/demo/m1_mvp_seed.sh
```

### Open demo screens

```text
http://127.0.0.1:5173/?data=api&demo=m1#traceability
http://127.0.0.1:5173/?data=api&demo=m1#changes
http://127.0.0.1:5173/?data=api&demo=m1#issues
http://127.0.0.1:5173/?data=api&demo=m1#runs
```

---

## 11. Smoke checks

```bash
cd ~/projects/product-ops-backbone

bash scripts/smoke/m1_1_aurora_api_smoke.sh
bash scripts/smoke/m1_2_run_retry_reprocess_smoke.sh
```

이 scripts는 다음을 전제로 합니다.

- API server is already running
- SSM port forwarding is active
- `AURORA_DATABASE_URL` or `DATABASE_URL` is set

Smoke rows are synthetic and intentionally not cleaned up.

---

## 12. Documentation map

Internal documentation:

- `docs/mvp_m1_completion_portfolio_summary_kr.md`
- `docs/m1_completion_handoff_m2_readiness_gate_kr.md`
- `docs/m1_1_aurora_backed_api_smoke_kr.md`
- `docs/m1_2_run_retry_reprocess_aurora_smoke_kr.md`

Smoke and demo tooling:

- `scripts/smoke/README.md`
- `scripts/demo/README.md`

Terraform:

- `infra/terraform/README.md`

---

## 13. Safety notes

- secrets를 커밋하지 않는다.
- 실제 `AURORA_DATABASE_URL`을 커밋하지 않는다.
- password, SecretString, bearer token, secret ARN, DB endpoint를 커밋하지 않는다.
- demo rows는 synthetic이며 의도적으로 cleanup하지 않는다.
- M2는 readiness review 이후 opt-in으로만 진행한다.
- `enable_m2=true`는 명시적인 결정이어야 한다.
- M1 demo를 ClickHouse / CDC / MSK / EKS가 이미 구현된 것처럼 설명하지 않는다.

---

## 14. Portfolio framing

이 프로젝트는 다음과 같이 설명하는 것이 가장 적절합니다.

```text
AI-era Product Ops Backbone
```

또는:

```text
Evidence-backed operational reasoning layer for AI product operations
```

이 프로젝트는 다음 역량을 결합합니다.

- product operations thinking
- event-driven system design
- data platform expansion planning
- safe projection design
- operational reliability workflows
- traceable evidence modeling

중요한 것은 많은 도구를 붙였다는 점이 아닙니다.  
중요한 것은 **MVP의 본질 기능과 확장 레이어를 의도적으로 분리했다는 점**입니다.

```text
M1: operational correctness and MVP demo
M2: analytics, streaming, and scale-out data platform expansion
```

이 분리는 프로젝트의 핵심 설계 결정입니다.
