# V1 Demo Guide - TraceOps Product Ops Backbone

## 1. 목적

이 문서는 현재 V1 제품화 MVP를 시연하기 위한 가이드다.

V1 데모는 Aurora-backed operational reasoning flow를 보여준다.

```text
Product Change
-> Event / Issue Intake
-> Suspected Trace
-> Evidence
-> Run Failure
-> Retry / Reprocess UX
-> Safe State Handling
```

핵심은 단순 대시보드가 아니라, 제품 운영 레코드를 **근거 기반 운영 판단 흐름**으로 연결하는 것이다. 이 프로젝트는 AI-era product operations를 위한 evidence-backed operational reasoning layer이며, 범용 관측 대시보드나 fake analytics 화면이 아니다.

## 2. 범위

이 데모는 **M1/Aurora-backed V1** 범위만 다룬다.

포함 범위:

- Aurora operational source of truth
- change / event / issue intake
- idempotency
- suspected trace / evidence
- safe issue/run read projection
- run failure / retry / reprocess UX
- empty / loading / error state polish
- M1 demo mode frontend

제외 범위:

- ClickHouse
- CDC / Debezium / Strimzi
- MSK
- EKS
- Airflow
- Argo
- Karpenter
- analytics read model

M2 인프라와 분석/스트리밍 확장은 MVP 이후로 연기되어 있다. V1은 M2가 구현된 것처럼 주장하지 않는다.

## 3. 전제 조건

시연 전 다음이 준비되어 있어야 한다.

- Aurora로 향하는 SSM tunnel이 실행 중이다.
- `AURORA_DATABASE_URL` 또는 `DATABASE_URL`이 로컬 환경에 설정되어 있다.
- API server가 `127.0.0.1:3000`에서 실행 중이다.
- Web dev server가 `127.0.0.1:5173`에서 실행 중이다.
- M1 demo seed가 `scripts/demo/m1_mvp_seed.sh`로 실행되어 있다.

주의:

- secret, password, bearer token, SecretString, 실제 DB endpoint를 화면이나 로그에 출력하지 않는다.
- 실제 `AURORA_DATABASE_URL` 값을 문서나 커밋에 남기지 않는다.
- demo row는 synthetic data이며 정리하지 않는 것을 전제로 한다.

## 4. 안전한 실행 명령 템플릿

아래 명령은 형태만 보여준다. 실제 secret 값이나 endpoint는 포함하지 않는다.

```bash
cd ~/projects/product-ops-backbone
```

API server:

```bash
export RUN_STORE_BACKEND=aurora
export CHANGE_STORE_BACKEND=aurora
export EVENT_STORE_BACKEND=aurora
export ISSUE_STORE_BACKEND=aurora
export TRACE_STORE_BACKEND=aurora
export AURORA_DB_SSLMODE=require
export DATABASE_URL="$AURORA_DATABASE_URL"

node apps/api/src/server.js
```

Web dev server:

```bash
npm --prefix apps/web run dev -- --host 127.0.0.1
```

Demo seed:

```bash
export API_BASE_URL="http://127.0.0.1:3000"
export WEB_BASE_URL="http://127.0.0.1:5173"

bash scripts/demo/m1_mvp_seed.sh
```

`AURORA_DATABASE_URL` 또는 `DATABASE_URL`은 이미 안전한 로컬 환경 변수로 설정되어 있어야 한다. 명령 예시에 실제 값을 직접 쓰지 않는다.

## 5. 데모 URL

Traceability:

```text
http://127.0.0.1:5173/?data=api&demo=m1#traceability
```

Changes:

```text
http://127.0.0.1:5173/?data=api&demo=m1#changes
```

Issues:

```text
http://127.0.0.1:5173/?data=api&demo=m1#issues
```

Runs:

```text
http://127.0.0.1:5173/?data=api&demo=m1#runs
```

`?data=api&demo=m1`은 실제 API mode에서 M1 demo seed row만 보여주는 명시적 demo mode다. 일반 API mode는 `?data=api`로 유지된다.

## 6. 데모 스토리

1. Checkout release가 배포된다.
2. `checkout.payment_failed` 신호가 나타난다.
3. `checkout_payment_failure` issue가 연결된다.
4. suspected trace가 change, issue, evidence를 연결한다.
5. evidence detail이 왜 이 연결이 suspected인지 설명한다.
6. failed run이 나타난다.
7. retry/reprocess UX가 안전한 운영 조치 논리를 보여준다.
8. API 실패 또는 empty 상태에서도 raw 내부 정보 없이 제품화된 상태 메시지를 보여준다.

## 7. 화면별 시연 흐름

### 7.1 Traceability

URL:

```text
http://127.0.0.1:5173/?data=api&demo=m1#traceability
```

시연 포인트:

- M1 Demo badge가 표시된다.
- selected suspected trace가 보인다.
- change -> signal -> issue -> evidence -> action path가 한 화면에서 이어진다.
- 오른쪽 workbench는 “이 연결이 의심되는 이유”를 보여준다.
- linked change, linked issue, evidence source_ref가 safe projection으로 표시된다.
- metric series나 anomaly marker를 꾸며내지 않는다.

### 7.2 Changes

URL:

```text
http://127.0.0.1:5173/?data=api&demo=m1#changes
```

시연 포인트:

- checkout release change가 보인다.
- linked suspected trace 요약이 보인다.
- smoke row가 아닌 coherent M1 demo story만 보인다.

### 7.3 Issues

URL:

```text
http://127.0.0.1:5173/?data=api&demo=m1#issues
```

시연 포인트:

- `checkout_payment_failure` issue가 safe projection으로 보인다.
- raw title/body/reporter/payload는 UI에 노출되지 않는다.
- linked trace summary가 issue 중심 검토 흐름을 만든다.

### 7.4 Runs

URL:

```text
http://127.0.0.1:5173/?data=api&demo=m1#runs
```

시연 포인트:

- failed normalization run을 선택한다.
- action readiness가 표시된다.
- retry 버튼은 실제 `POST /api/v1/runs/{run_id}/retry`가 가능한 경우에만 표시된다.
- reprocess는 실제 대상 정보가 충분한 경우에만 API action으로 제공된다.
- pending/reprocess run에서는 fake action button이 아니라 read-only guidance를 보여준다.
- state-log는 safe projection이며 raw metadata를 노출하지 않는다.

## 8. 말할 때 강조할 점

- 이 프로젝트는 단순 dashboard가 아니다.
- 운영 레코드를 evidence-backed reasoning으로 전환한다.
- Aurora는 V1의 operational source of truth다.
- UI는 raw sensitive data를 노출하지 않고 safe projection만 사용한다.
- retry/reprocess action은 이미 존재하는 실제 API가 있을 때만 clickable하다.
- API가 없거나 대상 정보가 부족한 조치는 read-only guidance로 표시한다.
- M2는 CDC/ClickHouse/analytics read model 확장 레이어이며, V1은 이를 구현된 것처럼 꾸미지 않는다.

## 9. 안전 상태 시연

Error state:

- API server를 중지하거나 controlled failure 상태에서 새로고침한다.
- 화면은 API/Aurora 연결 확인 안내를 보여준다.
- stack trace, DB URL, SecretString, bearer token, raw payload가 보이면 안 된다.

Empty state:

- `demo=m1`에서 row가 없으면 demo seed 안내가 표시된다.
- 일반 `?data=api` mode에서는 demo seed를 언급하지 않고 일반 운영 데이터 empty copy를 보여준다.

## 10. 금지 사항

- 실제 `AURORA_DATABASE_URL` 출력 또는 커밋 금지
- password, SecretString, bearer token, DB endpoint 문서화 금지
- raw payload, reporter, issue body, stack trace 노출 금지
- fake metric series, fake anomaly marker, fake affected users 추가 금지
- ClickHouse / CDC / MSK / EKS / Airflow / Argo / Karpenter를 V1 구현 완료로 설명 금지

