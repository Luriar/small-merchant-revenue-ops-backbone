# M1 기반 MVP 완료 및 포트폴리오 요약

## 1. 한 줄 정의

이 프로젝트는 **Aurora를 operational source of truth로 사용하는 Event-Driven Product Ops Backbone**이다.

제품 변경, 이벤트, 이슈, 추적 근거, 실행 실패, 재시도, 재처리 흐름을 하나의 운영 정본 위에서 연결하고, AI 시대의 제품 운영자가 “무엇이 바뀌었고, 어떤 문제가 생겼으며, 어떤 근거로 연결되었고, 지금 무엇을 해야 하는지”를 판단할 수 있게 하는 것이 핵심이다.

이 MVP는 단순 백엔드 CRUD 프로젝트가 아니다. 목표는 **구조화되고 추적 가능한 운영 판단 흐름**을 만드는 것이다.

---

## 2. MVP를 M1만으로 완료할 수 있는 이유

MVP의 본질은 대규모 분석 인프라가 아니라, 다음 운영 흐름이 실제로 동작하는지 검증하는 것이다.

- 제품 변경이 기록된다.
- 외부 이벤트와 이슈가 intake된다.
- 같은 요청이 반복되어도 idempotency로 중복 생성되지 않는다.
- change, issue, evidence가 suspected trace로 연결된다.
- 실패한 실행 run을 기준으로 retry/reprocess가 새 run으로 생성된다.
- `run_state_log`가 append-only로 남는다.
- 읽기 API는 raw body, reporter, payload, input_ref, error_detail 같은 민감하거나 내부적인 값을 노출하지 않는다.
- 이 흐름이 실제 화면에서 demo story로 보인다.

이 조건들은 M1에서 이미 Aurora-backed API와 프론트 화면으로 검증되었다.

따라서 **ClickHouse, CDC, MSK, EKS, Airflow, Argo, Karpenter는 MVP 필수 조건이 아니라 M2 확장 레이어**로 분리한다.

---

## 3. M1에서 구현된 것

### 3.1 Aurora operational source of truth

M1의 운영 정본은 Aurora PostgreSQL이다.

Aurora에는 다음 운영 데이터가 저장된다.

- product change
- event intake
- issue intake
- trace
- evidence
- run
- run_state_log
- idempotency ledger

M1에서는 ClickHouse나 CDC 없이도 운영 판단에 필요한 핵심 데이터 흐름을 Aurora에서 검증한다.

### 3.2 Change / Event / Issue intake

M1은 다음 intake API를 사용한다.

- `POST /api/v1/changes`
- `POST /api/v1/events/intake`
- `POST /api/v1/issues/intake`

각 intake는 idempotency를 기준으로 중복 요청을 안전하게 처리한다.

M1.1 smoke에서 다음이 확인되었다.

- change create/replay
- event create/replay
- issue create/replay
- Aurora persistence
- issue safe read projection

### 3.3 Trace / Evidence

M1 MVP는 suspected trace를 통해 다음 관계를 표현한다.

```text
change → anomaly/signal window → issue → evidence
```

데모 seed에서는 checkout release 이후 payment failure signal이 발생했고, issue와 trace/evidence가 연결되는 형태로 구성했다.

Trace/evidence는 M1에서 운영 판단 근거를 보여주는 핵심 레이어다. M2 analytics가 없어도 “이 변경과 이 이슈가 왜 연결되었는가”를 보여줄 수 있다.

### 3.4 Safe read projection

M1의 읽기 API는 원문 데이터를 그대로 노출하지 않는다.

Issue read projection은 다음과 같은 안전 필드 중심으로 구성된다.

- issue_id
- summary
- issue_family
- severity
- status
- source
- external_id_present
- body_present
- reporter_present
- keywords_count
- created_at

Run read projection도 내부 실행 입력이나 raw error payload를 직접 노출하지 않는다.

노출하지 않는 값:

- issue raw body
- reporter email
- raw payload
- run input_ref
- run output_ref
- run error_detail
- idempotency_key
- reason
- secret/token/password 계열 값

이 구조는 “AI가 믿고 쓸 수 있는 운영 정보”를 만들기 위해, 원문을 무조건 노출하는 방식이 아니라 **필요한 판단 정보만 안전하게 투영하는 방식**을 따른다.

### 3.5 Run / Retry / Reprocess

M1.2에서는 run lifecycle이 검증되었다.

확인된 흐름은 다음과 같다.

```text
failed source run
→ retry requested
→ new pending retry run
→ reprocess requested
→ new pending reprocess run
```

중요한 원칙은 기존 run을 되감거나 덮어쓰지 않는 것이다.

- retry는 새 run을 만든다.
- reprocess도 새 run을 만든다.
- 같은 idempotency key로 반복 요청하면 같은 `new_run_id`를 반환한다.
- `run_state_log`는 append-only로 남는다.
- replay 중 `run_state_log`가 중복 증가하지 않는다.

이 구조는 운영 복구 흐름을 추적 가능하게 만든다.

### 3.6 Smoke scripts

M1.3에서 수동 smoke 절차를 재현 가능한 script로 고정했다.

스크립트 위치:

```text
scripts/smoke/README.md
scripts/smoke/m1_1_aurora_api_smoke.sh
scripts/smoke/m1_2_run_retry_reprocess_smoke.sh
```

검증 대상:

- M1.1 intake / idempotency / safe projection
- M1.2 run / retry / reprocess / state-log / safe projection

이 스크립트들은 Aurora-backed API가 깨졌는지 빠르게 확인하는 safety net이다.

### 3.7 MVP demo seed

MVP 화면 데모를 위해 M1-only demo seed script를 추가했다.

스크립트 위치:

```text
scripts/demo/m1_mvp_seed.sh
scripts/demo/README.md
```

이 스크립트는 다음 synthetic demo story를 생성한다.

- checkout release change
- payment_failed event
- checkout_payment_failure issue
- suspected trace
- evidence 3개
- failed normalization run
- retry pending run
- reprocess pending run

Seed 방식은 다음과 같다.

| 데이터 | 생성 방식 |
|---|---|
| change | public M1 API |
| event | public M1 API |
| issue | public M1 API |
| trace/evidence | existing internal worker path |
| failed source run | seed-only Aurora DML |
| retry | public M1 API |
| reprocess | public M1 API |

Failed source run만 DML을 쓰는 이유는 현재 공개 run-create API가 없기 때문이다. 이는 demo seed 전용 gap bridge이며, 운영 API 계약을 변경하지 않는다.

### 3.8 Frontend demo mode

MVP 데모 화면은 다음 URL로 확인한다.

```text
http://127.0.0.1:5173/?data=api&demo=m1#traceability
http://127.0.0.1:5173/?data=api&demo=m1#changes
http://127.0.0.1:5173/?data=api&demo=m1#issues
http://127.0.0.1:5173/?data=api&demo=m1#runs
```

`?data=api`는 실제 API mode를 의미한다. `&demo=m1`은 smoke row와 일반 Aurora row를 제외하고, M1 MVP demo seed row만 보여주기 위한 명시적 demo mode다.

일반 Aurora API view는 여전히 다음 형태로 남아 있다.

```text
http://127.0.0.1:5173/?data=api#traceability
http://127.0.0.1:5173/?data=api#changes
http://127.0.0.1:5173/?data=api#issues
http://127.0.0.1:5173/?data=api#runs
```

---

## 4. MVP 포함 화면

### 4.1 Traceability Overview

URL:

```text
/?data=api&demo=m1#traceability
```

보여주는 것:

- demo suspected trace
- linked issue
- linked change
- evidence 3개
- confidence
- trace timeline
- recommended operational actions

M1에서는 metric series와 anomaly marker를 만들지 않는다. 이 화면은 실제 Aurora-backed trace/evidence row를 바탕으로 운영 판단 흐름을 보여준다.

### 4.2 Change Timeline

URL:

```text
/?data=api&demo=m1#changes
```

보여주는 것:

- M1 demo checkout release
- release count
- linked suspected trace

이 화면은 “어떤 변경이 후속 운영 이슈와 연결되었는가”를 보여준다.

### 4.3 Linked Issue View

URL:

```text
/?data=api&demo=m1#issues
```

보여주는 것:

- checkout_payment_failure issue
- safe issue projection
- linked trace

Raw issue body나 reporter email은 노출하지 않는다.

### 4.4 Reliability Panel

URL:

```text
/?data=api&demo=m1#runs
```

보여주는 것:

- failed source run 1개
- retry pending run 1개
- reprocess pending run 1개
- run status summary
- selected run detail
- state log

이 화면은 운영 복구 흐름을 보여준다.

---

## 5. Demo story

MVP demo story는 다음 순서로 설명한다.

```text
1. Checkout release가 배포된다.
2. 그 직후 payment_failed event signal이 발생한다.
3. checkout_payment_failure issue가 intake된다.
4. trace가 change와 issue를 evidence와 함께 연결한다.
5. 관련 normalization run 하나가 failed 상태가 된다.
6. retry 요청이 들어오고 새 pending retry run이 생성된다.
7. reprocess 요청이 들어오고 새 pending reprocess run이 생성된다.
8. 모든 read 화면은 raw data가 아니라 safe projection만 보여준다.
```

이 흐름을 통해 MVP는 “무슨 일이 있었는가”가 아니라 **무엇이 바뀌었고, 어떤 문제가 생겼으며, 어떤 근거로 연결되었고, 지금 무엇을 해야 하는지**를 보여준다.

---

## 6. M1과 M2의 경계

### 6.1 M1의 역할

M1은 operational correctness와 MVP demo를 담당한다.

M1의 핵심은 다음이다.

- operational source of truth
- idempotent intake
- trace/evidence
- safe projection
- retry/reprocess
- run_state_log
- frontend demo flow

즉 M1은 “운영 판단 흐름이 실제로 성립하는가”를 검증한다.

### 6.2 M2의 역할

M2는 MVP 이후 확장 레이어다.

M2에 포함될 수 있는 것:

- ClickHouse
- CDC
- Debezium
- Strimzi
- MSK
- EKS
- Airflow
- Argo
- Karpenter
- 고속 분석 read model
- streaming analytics
- metric series
- anomaly marker
- scale-out infrastructure

M2는 필요 없다는 뜻이 아니다. 다만 MVP의 본질 검증 이후에 붙이는 것이 맞다.

---

## 7. 왜 fake analytics가 아닌가

이 MVP는 analytics를 흉내내지 않는다.

M1 demo mode는 다음 원칙을 따른다.

- metric series를 fabrication하지 않는다.
- anomaly markers를 fabrication하지 않는다.
- ClickHouse data를 만들지 않는다.
- CDC/MSK/EKS 없이 analytics가 있는 것처럼 말하지 않는다.
- demo summaries는 M1 demo row를 기준으로만 안전하게 파생한다.
- trace/evidence는 실제 Aurora row로 존재한다.

따라서 이 MVP는 “가짜 분석 대시보드”가 아니라 **운영 정본 데이터와 추적 근거를 실제로 연결한 demo**다.

---

## 8. 포트폴리오 포지셔닝

이 프로젝트는 일반적인 백엔드 프로젝트로 설명하면 안 된다.

권장 포지셔닝:

```text
AI-era Product Ops Backbone
```

또는 한국어로:

```text
AI 시대의 제품 운영 판단 백본
```

핵심 가치는 다음이다.

- 외부 신호를 운영 가능한 단위로 구조화한다.
- 변경, 이슈, 근거, 복구 실행을 하나의 흐름으로 연결한다.
- AI가 사용할 수 있는 신뢰 가능한 운영 context를 만든다.
- raw data를 무작정 노출하지 않고 safe projection으로 제공한다.
- M2 확장 시 streaming/analytics/data platform layer로 자연스럽게 확장된다.

이 프로젝트의 방향은 “백엔드 API를 만들었다”가 아니라, **AI와 운영자가 함께 사용할 수 있는 evidence-backed operational reasoning layer를 만들었다**에 가깝다.

---

## 9. 현재 검증 상태

현재 상태는 다음과 같이 잠근다.

| 단계 | 상태 |
|---|---|
| M1 private Aurora infra | PASS |
| Aurora DDL / permissions / runtime consistency | PASS |
| Aurora connection smoke | PASS |
| M1.1 intake / safe projection smoke | PASS |
| M1.2 retry / reprocess / state-log smoke | PASS |
| M1.3 reproducible smoke scripts | PASS |
| M1.5 M2 opt-in Terraform safety | PASS |
| M1 frontend API shape alignment | PASS |
| M1 MVP demo seed | PASS |
| M1 MVP demo mode | PASS |

---

## 10. 데모 실행 방법

### 10.1 전제 조건

다음이 실행 중이어야 한다.

- SSM port forwarding
- Aurora-backed API server
- Web dev server
- 현재 shell의 `AURORA_DATABASE_URL` 또는 `DATABASE_URL`

환경 예시:

```bash
export API_BASE_URL="http://127.0.0.1:3000"
export WEB_BASE_URL="http://127.0.0.1:5173"
export AURORA_DB_SSLMODE=require

export CHANGE_STORE_BACKEND=aurora
export EVENT_STORE_BACKEND=aurora
export ISSUE_STORE_BACKEND=aurora
export RUN_STORE_BACKEND=aurora
export TRACE_STORE_BACKEND=aurora
```

API server:

```bash
node apps/api/src/server.js
```

Web server:

```bash
npm --prefix apps/web run dev -- --host 127.0.0.1
```

Demo seed:

```bash
bash scripts/demo/m1_mvp_seed.sh
```

Demo URLs:

```text
http://127.0.0.1:5173/?data=api&demo=m1#traceability
http://127.0.0.1:5173/?data=api&demo=m1#changes
http://127.0.0.1:5173/?data=api&demo=m1#issues
http://127.0.0.1:5173/?data=api&demo=m1#runs
```

---

## 11. 안전 규칙

- 실제 `AURORA_DATABASE_URL`을 문서나 커밋에 남기지 않는다.
- password, SecretString, bearer token, secret ARN을 커밋하지 않는다.
- demo rows는 synthetic이며 의도적으로 cleanup하지 않는다.
- M2는 MVP 완료 이후 readiness gate를 통과한 뒤에만 진행한다.
- `enable_m2=true`는 명시적으로 결정된 경우에만 사용한다.
- M1 demo에서 ClickHouse/CDC/MSK/EKS가 있는 것처럼 말하지 않는다.

---

## 12. 최종 정리

M1 기반 MVP는 완료 상태로 본다.

이 MVP는 Aurora를 operational source of truth로 두고, 제품 변경부터 이슈, 추적 근거, 복구 실행까지 이어지는 운영 판단 흐름을 실제 API와 화면으로 검증했다.

M2는 이 MVP 위에 붙는 데이터 플랫폼 확장 레이어다. 따라서 다음 작업은 M2가 아니라, 이 MVP를 포트폴리오 README, 발표 흐름, 스크린샷, 데모 시나리오로 정리하는 것이다.
