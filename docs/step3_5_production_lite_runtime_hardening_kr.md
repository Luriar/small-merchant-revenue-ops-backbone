# STEP 3.5 Production-lite Runtime Hardening

## 목표

STEP 3+4-lite의 store-scoped SaaS foundation을 production-lite runtime에 맞게 강화했다. 핵심은 인메모리 기반을 테스트/로컬 fallback으로 유지하면서, Aurora 설정이 있는 런타임에서는 Aurora-backed repository가 기본으로 선택되도록 하는 것이다.

## 완료 범위

- `createRevenueOpsSaasStoreFromEnv` factory 추가
- Aurora SaaS repository 추가
- Lambda/server runtime에서 Aurora 설정 감지 시 Aurora repository 사용
- 인메모리 store는 명시적 `REVENUE_OPS_SAAS_STORE_BACKEND=memory` 또는 DB 설정 부재 시 fallback
- store access check를 async repository에 맞게 수정
- revenue upload preview/rejected/reprocess endpoints 추가
- outbox/job/mart runtime 구조 추가
- Lambda package script에 Aurora SaaS runtime 파일과 SQL bootstrap 포함

## Aurora-backed Persistence

사용 테이블:

- `app_users`, `tenants`, `tenant_members`, `stores`, `store_members`
- `revenue_uploads`, `revenue_upload_raw_rows`, `revenue_upload_rejected_rows`
- `revenue_daily_facts`, `revenue_item_facts`
- `context_sources`, `context_observations`, `public_revenue_benchmarks`, `store_context_links`
- `store_locations`, `commercial_area_mappings`, `nearby_store_snapshots`, `collector_runs`
- `cause_candidates`, `cause_candidate_evidence`, `action_planner_items`, `action_outcome_snapshots`
- `platform_event_outbox`, `job_runs`, `mart_build_runs`, `store_revenue_daily_mart`

## Compatibility

- 기존 `/api/v1/revenue/*` compatibility route는 유지
- 신규 primary route는 `/api/v1/stores/:storeId/*`
- missing auth는 401
- 다른 store 접근은 403
- OPTIONS preflight는 204 유지
- 액션 상태 변경은 store membership 확인 후 수행

## Copy Guardrail

분석/액션 문구는 인과를 단정하지 않는다. 응답과 문서에 `함께 관측되었습니다`, `가능성 높은 원인 후보`, `추가 확인이 필요합니다`, `인과가 확정된 것은 아닙니다`를 사용한다.

## 검증 명령

```bash
node --test apps/api/src/revenue-ops/revenue-ops-saas-routes.test.js apps/api/src/revenue-ops/revenue-ops-saas-store-factory.test.js apps/api/src/revenue-ops/revenue-upload-parsers.test.js apps/api/src/revenue-ops/context-collectors.test.js apps/api/src/revenue-ops/runtime-boundaries.test.js
node --check apps/api/src/lambda-handler.js
node --check apps/api/src/server.js
terraform -chdir=infra/terraform/envs/revenue-dev validate
```

## 남은 작업

- Aurora repository live smoke with deployed Lambda package
- 실제 운영 migration 절차 분리
- SQS/Step Functions 실제 AWS resource wiring review
