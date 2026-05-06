# Platform-scale Profile

## 목적

대규모 점포/이벤트/분석 부하에 대비한 Terraform skeleton이다. 기본값은 비활성이고, apply 전에 비용/운영 계획 검토가 필요하다.

## 구성 역할

- ClickHouse: analytical read model
- MSK: high-throughput event stream
- Airflow: DAG/backfill orchestration
- CDC: Aurora changes to analytical/event layer
- Worker runtime: long-running consumers
- Observability stack: 운영 알람/로그/추적 확장

## Topic Contract

- `revenue.upload.accepted`
- `revenue.fact.normalized`
- `context.observation.collected`
- `benchmark.snapshot.loaded`
- `cause.candidate.generated`
- `action.status.changed`
- `action.outcome.evaluated`
- `platform.dlq`

## DAG Contract

- `daily_public_context_ingest`
- `daily_revenue_mart_build`
- `daily_cause_candidate_generation`
- `daily_action_outcome_evaluation`
- `weekly_commercial_benchmark_ingest`
- `reprocess_failed_uploads`
- `backfill_store_context`

## Cost Caution

MSK, ClickHouse, Airflow, CDC worker runtime은 small-merchant 초기 runtime의 기본값이 아니다. 실제 tenant 수, query concurrency, backfill volume이 확인된 뒤 활성화한다.
