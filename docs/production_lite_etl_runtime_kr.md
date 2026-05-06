# Production-lite ETL Runtime

## 목적

ETL은 단순 적재가 아니라 evidence pipeline이다.

`POS revenue upload -> revenue facts -> public context observed together -> cause candidates -> actions -> outcome feedback`

## Bronze

- `revenue_uploads`
- `revenue_upload_raw_rows`
- `revenue_upload_rejected_rows`
- S3 prefixes:
  - `raw/revenue_uploads/`
  - `raw/context/`
  - `rejected/revenue_uploads/`
  - `bronze/revenue/`

## Silver

- `revenue_daily_facts`
- `revenue_item_facts`
- `context_observations`
- `public_revenue_benchmarks`
- `store_context_links`

## Gold

- `store_revenue_daily_mart`
- `cause_candidates`
- `cause_candidate_evidence`
- `action_planner_items`
- `action_outcome_snapshots`

## Runtime Tables

- `platform_event_outbox`: transactional event boundary
- `job_runs`: upload/context/mart/outcome job audit
- `mart_build_runs`: mart build audit
- `store_revenue_daily_mart`: store/day evidence-ready mart

## Operational Flow

1. Upload JSON/CSV preview validates mapping without committing facts.
2. Upload commit writes raw/rejected/fact rows and outbox event.
3. Context collect writes seed/live-gated context observations.
4. Mart build joins revenue facts and context signals where available.
5. Action done status creates outcome placeholder, not success claims.

## Reliability Note

이 분석은 업로드된 매출 데이터와 공개 맥락 데이터를 함께 관측한 결과입니다. 인과가 확정된 것은 아니며, 실행 전 추가 확인이 필요합니다.
