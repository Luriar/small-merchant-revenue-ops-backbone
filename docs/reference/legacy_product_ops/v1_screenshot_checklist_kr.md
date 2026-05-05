# V1 Screenshot Checklist

## 1. 목적

이 체크리스트는 현재 M1/Aurora-backed V1 productized MVP를 수동 캡처하기 위한 기준이다.

캡처 목표는 TraceOps가 단순 dashboard가 아니라 **AI product operations를 위한 evidence-backed operational reasoning layer**임을 보여주는 것이다.

주의:

- screenshots는 manual capture 기준이다.
- repository policy가 이미지 artifact 커밋을 허용하기 전까지 screenshot 파일은 커밋하지 않는다.
- M2가 구현된 것처럼 보이거나 fake analytics처럼 보이는 장면은 캡처하지 않는다.

## 2. 파일명 규칙

권장 파일명:

```text
docs/screenshots/v1_01_traceability_overview.png
docs/screenshots/v1_02_evidence_workbench.png
docs/screenshots/v1_03_evidence_strength_rail.png
docs/screenshots/v1_04_change_timeline.png
docs/screenshots/v1_05_issue_view.png
docs/screenshots/v1_06_reliability_failed_run.png
docs/screenshots/v1_07_reliability_pending_run.png
docs/screenshots/v1_08_error_state.png
docs/screenshots/v1_09_empty_state.png
```

## 3. 공통 금지 노출 항목

모든 screenshot에서 아래 값이 보이면 안 된다.

- raw DB URL
- SecretString
- bearer token
- raw payload
- stack trace
- `input_ref`
- `output_ref`
- `error_detail`
- fake analytics
- M2 구현 완료 claim

기술 토큰은 필요한 경우 노출 가능하다.

- `checkout`
- `checkout.payment_failed`
- `checkout_payment_failure`
- `retry`
- `reprocess`
- `DLQ`
- `run_id`

## 4. Screenshot Set

### 4.1 Traceability overview top

권장 파일:

```text
docs/screenshots/v1_01_traceability_overview.png
```

URL:

```text
http://127.0.0.1:5173/?data=api&demo=m1#traceability
```

클릭/선택:

- 첫 번째 suspected trace가 선택된 상태를 사용한다.
- 선택이 풀려 있으면 review queue에서 M1 demo trace를 선택한다.

증명하는 것:

- M1 Demo badge가 표시된다.
- selected suspected trace가 표시된다.
- change -> signal -> issue -> evidence -> action path가 한 화면에서 이어진다.
- Aurora-backed demo row가 실제 API mode에서 렌더링된다.

나오면 안 되는 것:

- fake metric series
- fake anomaly marker
- raw payload
- M2 구현 완료처럼 보이는 문구

### 4.2 Evidence detail / right workbench

권장 파일:

```text
docs/screenshots/v1_02_evidence_workbench.png
```

URL:

```text
http://127.0.0.1:5173/?data=api&demo=m1#traceability
```

클릭/선택:

- suspected trace를 선택한다.
- 오른쪽 Investigation Workbench가 잘 보이도록 캡처한다.

증명하는 것:

- “이 연결이 의심되는 이유”가 표시된다.
- linked change와 linked issue가 보인다.
- Korean copy가 자연스럽고 기술 토큰은 유지된다.
- full UUID는 축약되어 표시된다.

나오면 안 되는 것:

- raw issue body
- reporter email
- stack trace
- `input_ref` / `output_ref` / `error_detail`

### 4.3 Evidence strength rail

권장 파일:

```text
docs/screenshots/v1_03_evidence_strength_rail.png
```

URL:

```text
http://127.0.0.1:5173/?data=api&demo=m1#traceability
```

클릭/선택:

- Evidence Strength rail이 잘 보이도록 trace spine 영역을 캡처한다.

증명하는 것:

- event spike / timing / rule match 근거가 보인다.
- `source_ref`가 축약 또는 ellipsis 처리되어 레이아웃을 깨지 않는다.
- evidence strength가 실제 evidence row 기반으로 표시된다.
- fake analytics 없이 reasoning evidence만 보여준다.

나오면 안 되는 것:

- baseline / actual / delta를 꾸며낸 값
- affected users를 꾸며낸 값
- fake anomaly marker
- raw metadata

### 4.4 Change timeline

권장 파일:

```text
docs/screenshots/v1_04_change_timeline.png
```

URL:

```text
http://127.0.0.1:5173/?data=api&demo=m1#changes
```

클릭/선택:

- checkout release change를 선택한다.

증명하는 것:

- release change가 표시된다.
- linked suspected trace가 표시된다.
- smoke row가 아닌 M1 demo story row만 보인다.

나오면 안 되는 것:

- unrelated smoke row가 주 화면을 지배하는 상태
- fake analytics summary
- secret 또는 raw payload

### 4.5 Issue view

권장 파일:

```text
docs/screenshots/v1_05_issue_view.png
```

URL:

```text
http://127.0.0.1:5173/?data=api&demo=m1#issues
```

클릭/선택:

- `checkout_payment_failure` issue를 선택한다.

증명하는 것:

- linked issue가 safe projection으로 표시된다.
- trace summary가 issue 중심으로 연결된다.
- body/reporter/payload 원문 대신 안전한 presence/summary 계열 필드만 보인다.

나오면 안 되는 것:

- raw issue body
- reporter email
- raw payload
- SecretString

### 4.6 Reliability panel failed run

권장 파일:

```text
docs/screenshots/v1_06_reliability_failed_run.png
```

URL:

```text
http://127.0.0.1:5173/?data=api&demo=m1#runs
```

클릭/선택:

- failed normalization run을 선택한다.
- API server와 Aurora tunnel이 실행 중이고 의도한 경우에만 Retry를 클릭한다.

증명하는 것:

- failed run이 선택되어 있다.
- action readiness가 표시된다.
- retry safe error 또는 accepted feedback이 안전하게 표시된다.
- recovery history가 append-only state-log 관점으로 표시된다.

나오면 안 되는 것:

- fake retry success
- raw `input_ref`
- raw `output_ref`
- raw `error_detail`
- idempotency key 원문
- stack trace

### 4.7 Reliability panel pending run

권장 파일:

```text
docs/screenshots/v1_07_reliability_pending_run.png
```

URL:

```text
http://127.0.0.1:5173/?data=api&demo=m1#runs
```

클릭/선택:

- retry 또는 reprocess로 생성된 pending run을 선택한다.

증명하는 것:

- pending run이 선택되어 있다.
- read-only guidance가 표시된다.
- 현재 상태에서 조작 가능한 실제 API action이 없으면 fake action button이 나타나지 않는다.

나오면 안 되는 것:

- 실패하지 않은 run에 대한 fake retry button
- fake reprocess success
- raw internal run fields

### 4.8 Error state

권장 파일:

```text
docs/screenshots/v1_08_error_state.png
```

URL:

```text
http://127.0.0.1:5173/?data=api&demo=m1#traceability
```

클릭/선택:

- API server를 중지하거나 controlled failure 상태에서 새로고침한다.
- error copy가 보이는 화면을 캡처한다.

증명하는 것:

- 안전한 API/Aurora 확인 안내가 표시된다.
- 사용자가 다음 확인 대상을 이해할 수 있다.
- 내부 stack trace나 secret이 UI에 노출되지 않는다.

나오면 안 되는 것:

- raw DB URL
- SecretString
- bearer token
- stack trace
- raw payload

### 4.9 Empty state if feasible

권장 파일:

```text
docs/screenshots/v1_09_empty_state.png
```

URL:

```text
http://127.0.0.1:5173/?data=api&demo=m1#traceability
```

또는 controlled empty path:

```text
http://127.0.0.1:5173/?data=api#traceability
```

클릭/선택:

- 가능한 경우 demo seed row가 없는 환경 또는 controlled empty path에서 캡처한다.
- demo mode와 general API mode empty copy를 구분해 확인한다.

증명하는 것:

- `demo=m1`에서는 demo seed guidance가 표시된다.
- general `?data=api`에서는 일반 운영 데이터 empty copy가 표시된다.
- 비어 있는 상태에서도 fake trace/evidence/spine을 만들지 않는다.

나오면 안 되는 것:

- fake trace
- fake evidence
- fake metric series
- M2 analytics가 구현된 것처럼 보이는 문구

## 5. 캡처 전 최종 점검

캡처 전 다음을 확인한다.

- API server가 `127.0.0.1:3000`에서 실행 중이다.
- web dev server가 `127.0.0.1:5173`에서 실행 중이다.
- Aurora SSM tunnel이 실행 중이다.
- `scripts/demo/m1_mvp_seed.sh`가 실행되어 demo row가 존재한다.
- 화면 URL에 `?data=api&demo=m1`이 포함되어 있다.
- M1 Demo badge가 보인다.
- ClickHouse / CDC / MSK / EKS / Airflow / Argo / Karpenter가 구현 완료처럼 표시되지 않는다.

## 6. 커밋 정책 메모

이 문서는 screenshot capture checklist다.

실제 PNG 파일은 우선 수동 캡처 후 로컬에서 검토한다. repository policy가 이미지 artifact 커밋을 허용하지 않는다면 screenshot 파일은 커밋하지 않는다.

