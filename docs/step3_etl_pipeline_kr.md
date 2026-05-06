# STEP 3 ETL Pipeline

## 관점

이 ETL은 범용 데이터 적재가 아니라 evidence pipeline이다. POS 매출 데이터와 공개 맥락 데이터를 근거 가능한 형태로 정규화하고, 원인 후보와 액션, 결과 추적까지 연결한다.

## Bronze

- `revenue_uploads`
- `revenue_upload_raw_rows`
- `revenue_upload_rejected_rows`
- seed/public context raw payload

Bronze는 업로드 단위, 원본 row preview, rejected reason을 보존한다. 고객/카드 식별자 같은 민감 데이터는 저장 대상이 아니다.

## Silver

- `revenue_daily_facts`
- `revenue_item_facts`
- `context_observations`
- `public_revenue_benchmarks`
- `store_context_links`
- `store_locations`
- `commercial_area_mappings`
- `nearby_store_snapshots`

Silver는 store-scoped 분석 facts다. 같은 `store_id` 안에서 일 매출, 품목 매출, 날씨/상권/유동인구/점포밀도 컨텍스트를 같은 기간에 맞춰 볼 수 있다.

## Gold

- `cause_candidates`
- `cause_candidate_evidence`
- `action_planner_items`
- `action_outcome_snapshots`
- store-scoped brief response projection

Gold는 "매출 변화 -> 함께 관측된 근거 -> 가능성 높은 원인 후보 -> 실행 액션 -> 결과 추적" 흐름을 만든다. 인과 단정은 금지한다.

## Synthetic seed pipeline

`scripts/generate_step3_seed_data.js`는 75일짜리 성수 카페 합성 POS 데이터를 생성한다. 월요일 저점, 주말 강세, 비 오는 날 하락, 더운 날 아이스 음료 lift, 프로모션 기간, 15~20% 수준의 visible anomaly window를 포함한다.

## Revenue upload ETL

`POST /api/v1/stores/:storeId/revenue/uploads`는 JSON daily/item rows를 먼저 지원한다. 정상 row는 facts로 적재하고 실패 row는 rejected rows로 분리한다. CSV/Excel mapping UX는 다음 단계에서 확장한다.

## Public context ETL

STEP 4-lite collector skeleton은 API key 없이 seed/stub로 동작한다. API key가 준비되면 KMA, 공휴일, 서울 상권/생활인구/지하철, 소상공인 상권 정보, Kakao geocoding을 수동 실행 또는 스케줄링할 수 있다.

## Scheduling 방향

초기 운영안:

```text
EventBridge Scheduler -> Lambda collector -> Aurora context tables
```

고도화 운영안:

```text
Airflow DAG -> context ingest -> revenue/context mart build -> cause candidate/action generation
```

현재 단계에서는 scheduler Terraform을 적용하지 않는다.
