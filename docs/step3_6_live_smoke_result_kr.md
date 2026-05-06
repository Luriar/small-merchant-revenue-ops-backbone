# STEP 3.6 Live Smoke Result

## 문서 목적

이 문서는 `small-merchant-revenue-ops-backbone` 프로젝트의 STEP 3.6 live smoke 결과를 정리한다.

검증 목적은 다음과 같다.

- API Gateway route persistence 이후 `/api/v1/stores` 계열 route가 실제 AWS에서 동작하는지 확인
- Cognito JWT 인증이 적용된 상태에서 Lambda Revenue API가 호출되는지 확인
- Aurora-backed SaaS runtime이 실제로 사용되는지 확인
- 신규 store 생성 후 revenue upload, context collect, brief/anomaly, cause candidate, action planner, outcome placeholder까지 이어지는 핵심 evidence flow가 live 환경에서 닫히는지 확인

본 검증은 실제 외부 공공 API 실호출이 아니라, seed/fallback context collector를 사용한 production-lite live smoke이다.

---

## 검증 환경

- Project: `~/projects/small-merchant-revenue-ops-backbone`
- AWS Region: `ap-northeast-2`
- API Gateway endpoint: `https://7q8hxxta67.execute-api.ap-northeast-2.amazonaws.com`
- Lambda function: `revenue-ops-revenue-dev-revenue-api`
- Lambda runtime: `nodejs20.x`
- Persistence backend: Aurora PostgreSQL
- Auth: Cognito JWT authorizer
- Context mode: `seed`

---

## 사전 배경

초기 live smoke에서 `/api/v1/stores`는 API Gateway 단계에서 다음과 같은 404를 반환했다.

```json
{"message":"Not Found"}
```

원인은 Lambda 내부 route 문제가 아니라 API Gateway route set에 `/api/v1/stores` 계열 route가 없었기 때문이다.

당시 API Gateway에는 아래 route만 존재했다.

```text
ANY /api/v1/revenue/{proxy+}
OPTIONS /api/v1/revenue/{proxy+}
```

이후 live hotfix 및 Terraform persistence를 통해 아래 route가 추가 및 관리 상태로 편입됐다.

```text
ANY /api/v1/me
OPTIONS /api/v1/me
ANY /api/v1/stores
OPTIONS /api/v1/stores
ANY /api/v1/stores/{proxy+}
OPTIONS /api/v1/stores/{proxy+}
```

Post-apply plan은 no-op으로 확인되었다.

---

## Lambda 배포 확인

최신 Lambda package에는 Step 3.5/3.6 runtime 파일이 포함되었다.

주요 포함 파일:

```text
src/revenue-ops/revenue-ops-saas-aurora-store.js
src/revenue-ops/revenue-ops-saas-store-factory.js
src/revenue-ops/revenue-upload-parsers.js
src/revenue-ops/runtime-boundaries.js
src/revenue-ops/context-collectors.js
src/revenue-ops/connectors/toss-place-client.js
src/revenue-ops/revenue_ops_step3_4_lite.sql
```

Lambda update result:

```text
FunctionName: revenue-ops-revenue-dev-revenue-api
Runtime: nodejs20.x
Handler: index.handler
LastModified: 2026-05-06T09:30:20.000+0000
```

로컬 패키징 중 `EBADENGINE` 경고가 발생했지만, 이는 로컬 Node v18.19.1과 AWS SDK 패키지의 Node 20 요구사항 차이에서 발생한 경고다. 배포 대상 Lambda runtime은 `nodejs20.x`다.

---

## Live Smoke 1 — Store 생성

### Command

```bash
STORE_RESPONSE=$(curl -sS -X POST "$API_BASE/api/v1/stores" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "store_name": "테스트 카페",
    "business_category": "cafe",
    "region": "Seoul"
  }')

echo "$STORE_RESPONSE" | jq .
```

### Result

```text
HTTP status: 201
```

생성된 주요 값:

```text
store_id: abf4284c-e1a9-481a-9fc1-d698d2362416
tenant_id: bbb66238-3416-4c1c-b71f-a82f938fab19
store_name: 테스트 카페
business_category: cafe
region: Seoul
member_role: owner
tenant_type: merchant
```

### 판단

신규 store 생성이 Aurora-backed runtime에서 정상 동작했다.

---

## Live Smoke 2 — Store 목록 조회

### Command

```bash
curl -sS "$API_BASE/api/v1/stores" \
  -H "Authorization: Bearer $ID_TOKEN" | jq .
```

### Result

조회 결과에 다음 store들이 포함되었다.

```text
1. 성수 커피음료 매장
   - store_type: demo
   - tenant_type: demo

2. 테스트 카페
   - store_type: single_store
   - tenant_type: merchant
```

### 판단

`app_user`, `tenant`, `store`, `store_members` 관계가 Aurora에서 정상 조회되었다.

---

## Live Smoke 3 — Revenue Upload

### Command

```bash
curl -i -X POST "$API_BASE/api/v1/stores/$STORE_ID/revenue/uploads" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "source_type": "manual_template",
    "original_filename": "manual_seed.json",
    "daily_rows": [
      {
        "business_date": "2026-05-01",
        "channel": "offline_pos",
        "gross_sales_amount": 1250000,
        "net_sales_amount": 1180000,
        "order_count": 82,
        "cancel_count": 1,
        "refund_amount": 12000,
        "discount_amount": 58000,
        "payment_card_amount": 1080000,
        "payment_cash_amount": 100000
      }
    ],
    "item_rows": [
      {
        "business_date": "2026-05-01",
        "channel": "offline_pos",
        "item_name": "아메리카노",
        "item_category": "coffee",
        "quantity": 41,
        "gross_sales_amount": 184500,
        "discount_amount": 0,
        "net_sales_amount": 184500
      }
    ]
  }'
```

### Result

```text
HTTP status: 201
upload_id: 5904d3dd-e1a9-411a-80c2-261f9bede6d3
status: accepted
row_count: 2
accepted_count: 2
rejected_count: 0
```

### 판단

store-scoped revenue upload가 Aurora에 정상 저장되었다.

---

## Live Smoke 4 — Upload 목록 조회

### Command

```bash
curl -sS "$API_BASE/api/v1/stores/$STORE_ID/revenue/uploads" \
  -H "Authorization: Bearer $ID_TOKEN" | jq .
```

### Result

`manual_seed.json` upload가 `accepted` 상태로 조회되었다.

### 판단

`revenue_uploads` persistence와 store-scoped 조회가 정상이다.

---

## Live Smoke 5 — Pipeline Meta 조회

### Command

```bash
curl -sS "$API_BASE/api/v1/stores/$STORE_ID/pipeline-meta" \
  -H "Authorization: Bearer $ID_TOKEN" | jq .
```

### Result

주요 값:

```text
latest_revenue_upload: 5904d3dd-e1a9-411a-80c2-261f9bede6d3
latest_context_observation: null
latest_public_benchmark_period: 2026-04-01 ~ 2026-04-30
context_freshness_note: 공개 맥락 데이터가 아직 충분하지 않습니다.
runtime_backend: aurora
```

Reliability note:

```text
이 분석은 업로드된 매출 데이터와 공개 맥락 데이터를 함께 관측한 결과입니다. 인과가 확정된 것은 아니며, 실행 전 추가 확인이 필요합니다.
```

### 판단

`runtime_backend = aurora`가 확인되었고, latest revenue upload가 pipeline-meta에 정상 반영되었다.

---

## Live Smoke 6 — Context Collect

### Command

```bash
curl -i -X POST "$API_BASE/api/v1/stores/$STORE_ID/context/collect" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "mode": "seed" }'
```

### Result

```text
HTTP status: 202
collector_name: collectStorePublicContext
collector_run.status: completed
job_run.job_type: context_collect
job_run.status: completed
resolved_mode: seed
context_observation_count: 3
```

Collector plan included:

```text
holiday
weather
commercial_benchmark
geocoding
foot_traffic_proxy
nearby_store_density
```

### 판단

context collector framework, collector_runs, job_runs가 정상 동작했다. 외부 API key 없이 seed path로 안전하게 실행되었다.

---

## Live Smoke 7 — Context 조회

### Command

```bash
curl -sS "$API_BASE/api/v1/stores/$STORE_ID/context" \
  -H "Authorization: Bearer $ID_TOKEN" | jq .
```

### Result

조회된 context:

```text
context_observations:
- commercial_area_sales_delta_pct: -8
- rainfall_mm: 38
- foot_traffic_proxy_delta_pct: -14

benchmarks:
- Seoul cafe benchmark
- Seoul Seongsu cafe benchmark

nearby_store_snapshots:
- radius_m: 500
- same_category_store_count: 61
- total_store_count: 228

commercial_area_mappings:
- mapping_method: manual_seed
- confidence: medium
```

### 판단

context observations, benchmark, nearby store snapshot, commercial area mapping이 store_id 기준으로 조회되었다.

---

## Live Smoke 8 — Brief 조회

### Command

```bash
curl -sS "$API_BASE/api/v1/stores/$STORE_ID/briefs" \
  -H "Authorization: Bearer $ID_TOKEN" | jq .
```

### Result

Brief headline:

```text
테스트 카페: 매출 변화와 공개 맥락 신호가 함께 관측되었습니다
```

Brief summary:

```text
이 분석은 업로드된 매출 데이터와 공개 맥락 데이터를 함께 관측한 결과입니다. 인과가 확정된 것은 아니며, 실행 전 추가 확인이 필요합니다.
```

Recommended actions included:

```text
매장 앞 메뉴판/홍보 문구 업데이트
대표 메뉴 재포지셔닝
리뷰 응답 우선 관리
```

### 판단

store-scoped brief projection이 정상 동작했다. 문구는 hard causality를 피하고 “함께 관측” framing을 유지한다.

---

## Live Smoke 9 — Anomaly 조회

### Command

```bash
curl -sS "$API_BASE/api/v1/stores/$STORE_ID/anomalies" \
  -H "Authorization: Bearer $ID_TOKEN" | jq .
```

### Result

```text
anomaly_type: store_revenue_pattern
metric: revenue_amount
baseline_period: uploaded revenue facts
compare_period: lowest observed day
interpretation_note: Revenue change pattern only. It is not proven causality.
```

### 판단

store-scoped anomaly projection이 정상 동작했다.

---

## Live Smoke 10 — Cause Candidate 생성/조회

### Command

```bash
curl -sS "$API_BASE/api/v1/stores/$STORE_ID/cause-candidates" \
  -H "Authorization: Bearer $ID_TOKEN" | jq .
```

### Result

새 store 기준으로 다음 candidate들이 생성 및 조회되었다.

```text
benchmark_downturn
foot_traffic_drop
item_category_decline
rainy_day_offline_drop
```

각 candidate에는 `cause_candidate_evidence`가 포함되었다.

Evidence examples:

```text
benchmark:
- commercial_area_sales_delta_pct = -8
- source: Manual seed commercial district benchmark

foot_traffic:
- foot_traffic_proxy_delta_pct = -14
- source: Manual seed foot traffic proxy

revenue_change:
- net_sales_amount = 1180000
- source: Aurora revenue_daily_facts

weather:
- rainfall_mm = 38
- source: Manual seed weather context

competition:
- same_category_store_count = 61
- source: Nearby store snapshot seed
```

### 판단

새 store에서도 generated cause_candidates와 cause_candidate_evidence persistence가 정상 동작했다.

---

## Live Smoke 11 — Action Planner 생성/조회

### Command

```bash
curl -sS "$API_BASE/api/v1/stores/$STORE_ID/actions" \
  -H "Authorization: Bearer $ID_TOKEN" | jq .
```

### Result

새 store 기준으로 다음 actions가 생성 및 조회되었다.

```text
rainy_day_delivery_boost
offpeak_promotion
benchmark_watch
bundle_attach_rate_recovery
```

각 action은 다음 정보를 포함했다.

```text
action_id
store_id
cause_candidate_id
action_family
dedupe_key
title
description
why_this_action
expected_effect
risk_note
difficulty
status
evidence_snippets
outcome_tracking
cause_candidate
```

대표 action:

```text
비 오는 날 배달/포장 세트 메뉴를 테스트하세요
```

Risk note:

```text
인과가 확정된 것은 아닙니다. 실행 전 추가 확인이 필요합니다.
```

Outcome tracking:

```text
결과 추적 대기 중
```

### 판단

새 store의 Action Planner generation과 evidence-backed action response가 정상 동작했다.

---

## Live Smoke 12 — Action Status Done / Outcome Placeholder

### Command

```bash
export ACTION_ID=$(curl -sS "$API_BASE/api/v1/stores/$STORE_ID/actions" \
  -H "Authorization: Bearer $ID_TOKEN" | jq -r '.actions[0].action_id')

curl -i -X PATCH "$API_BASE/api/v1/stores/$STORE_ID/actions/$ACTION_ID/status" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "status": "done" }'
```

### Result

```text
HTTP status: 200
status: done
completed_at: 2026-05-06T09:30:38.581Z
status_updated_by: 619caecf-f470-4a18-a030-3162d7599df1
status_persistence: store_scoped
```

Outcome tracking:

```text
summary: 결과 추적 대기 중. 실행 효과를 단정하지 않습니다.
metric_name: net_sales_amount
baseline_value: null
result_value: null
observed_delta_pct: null
```

### 판단

Action status persistence와 outcome placeholder 생성이 정상 동작했다. 실행 효과는 단정하지 않고 result window 평가 전 대기 상태로 남긴다.

---

## 최종 검증된 Evidence Flow

이번 live smoke로 확인된 핵심 흐름은 다음과 같다.

```text
Cognito 로그인
→ app_user resolution
→ store 생성
→ revenue upload
→ revenue facts 저장
→ context collect
→ context observations / benchmark / nearby snapshot 저장
→ pipeline-meta 업데이트
→ brief 생성
→ anomaly 생성
→ cause candidate 생성
→ cause evidence 저장
→ action planner 생성
→ action status done
→ outcome placeholder 생성
```

제품 철학 기준으로는 아래 flow가 live에서 닫힌 것이다.

```text
매출 변화
→ 근거/맥락
→ 원인 후보
→ 실행 액션
→ 결과 추적
```

---

## 완료로 볼 수 있는 범위

아래 항목은 live 기준 완료로 판단한다.

```text
- API Gateway store-scoped routes
- Cognito JWT protected store API
- Aurora-backed app user / tenant / store runtime
- store-scoped revenue upload
- revenue upload persistence
- context seed collector
- collector_runs / job_runs
- context observations / benchmark / nearby snapshot
- pipeline-meta
- brief projection
- anomaly projection
- generated cause candidates
- cause candidate evidence
- generated action planner items
- action status persistence
- outcome placeholder
```

---

## 아직 완료로 보면 안 되는 범위

아래 항목은 후속 고도화 대상이다.

```text
- 실제 외부 public API live collector
  - 기상청
  - 서울시 상권
  - 카카오 geocoding
  - 공공데이터

- 실제 POS/channel connector
  - Toss Place Open API
  - 배민/쿠팡이츠 파일 parser
  - 네이버 리뷰/검색 signal

- production-lite infra resource actualization
  - S3 Bronze
  - SQS/DLQ
  - EventBridge Scheduler
  - Step Functions

- action outcome evaluator
  - baseline window vs result window 실제 비교
  - action impact 관측 리포트

- frontend UX final verification
  - Store Switcher
  - Action Planner
  - status update
  - refresh persistence

- M6 packaging
  - README
  - demo guide
  - screenshot checklist
  - architecture diagram
  - interview narrative
```

---

## 후속 추천 작업

우선순위는 다음과 같다.

```text
1. 현재 smoke 결과 문서화 및 커밋
2. 프론트에서 새 store 선택 후 Action Planner 표시 확인
3. README/M6 포트폴리오 패키징
4. production-lite infra 실제화
5. public context live collector v1
6. Toss Place connector v0
7. upload parser UX 강화
8. action outcome evaluator 실제 계산
9. lakehouse-ready/platform-scale 실제 확장
```

---

## 최종 판정

STEP 3.6 live smoke는 성공이다.

현재 시스템은 단순 demo cockpit이 아니라, 아래를 실제 AWS/Aurora 환경에서 수행하는 Revenue Ops SaaS foundation이다.

```text
Cognito 인증
+ Aurora-backed user/store runtime
+ store-scoped revenue upload
+ context collection
+ brief/anomaly generation
+ evidence-backed cause candidates
+ action planner
+ outcome placeholder tracking
```

핵심 backend evidence loop는 live 기준으로 닫혔다.
