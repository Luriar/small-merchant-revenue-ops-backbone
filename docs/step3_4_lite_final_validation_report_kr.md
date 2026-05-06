# STEP 3 + STEP 4-lite Final Validation Report

## 변경 요약

- Store-scoped Revenue Ops SaaS foundation 추가
- User/tenant/store ownership schema 및 helper 추가
- Store-scoped API route 추가
- Revenue Cockpit Store Switcher 추가
- Revenue upload JSON ingest foundation 추가
- Synthetic Seongsu cafe POS seed data 추가
- Public context/commercial district seed/stub foundation 추가
- Cause candidate/evidence/action/outcome skeleton 추가

## 검증 결과

아래 검증을 실행했다.

```bash
node --test apps/api/src/revenue-ops/revenue-ops-routes.test.js apps/api/src/revenue-ops/revenue-ops-saas-routes.test.js apps/api/src/revenue-ops/revenue-ops-store.test.js apps/api/src/revenue-ops/aurora-health.test.js apps/api/src/lambda-handler.test.js
node --check apps/api/src/lambda-handler.js
node --check apps/api/src/revenue-ops/revenue-ops-handler.js
node --check apps/api/src/revenue-ops/revenue-ops-saas-store.js
node scripts/generate_step3_seed_data.js
node scripts/seed_step3_demo_data.js
node scripts/context/collect_public_context.js
npm --prefix apps/web run check
npm --prefix apps/web run build
```

결과:

- API route/unit tests: `22 pass, 0 fail`
- `node --check` for Lambda handler, Revenue Ops handler, SaaS store: pass
- `node scripts/generate_step3_seed_data.js`: `Generated STEP 3 seed data in data/seed/step3`
- `node scripts/seed_step3_demo_data.js`: skipped safely because `DATABASE_URL`/`AURORA_DATABASE_URL` is not set; seed files loaded `75` daily rows, `750` item rows, `7` context rows
- `node scripts/context/collect_public_context.js`: skipped live collectors safely; reported missing optional API keys and seed fallback
- `npm --prefix apps/web run check`: pass
- `npm --prefix apps/web run build`: pass, Vite built `dist/index.html`, CSS, and JS bundle

## API smoke checklist

```bash
curl -i "$API_BASE/api/v1/stores"
curl -i "$API_BASE/api/v1/stores" -H "Authorization: Bearer $ID_TOKEN"
curl -i -X POST "$API_BASE/api/v1/stores" -H "Authorization: Bearer $ID_TOKEN" -H "Content-Type: application/json" -d '{"store_name":"성수 커피음료 매장","business_category":"cafe","region":"Seoul Seongsu","tenant_name":"Demo Merchant Tenant"}'
curl -i "$API_BASE/api/v1/stores/$STORE_ID/actions" -H "Authorization: Bearer $ID_TOKEN"
curl -i -X POST "$API_BASE/api/v1/stores/$STORE_ID/revenue/uploads" -H "Authorization: Bearer $ID_TOKEN" -H "Content-Type: application/json" -d '{"source_type":"manual_template","daily_rows":[{"business_date":"2026-05-01","channel":"offline_pos","gross_sales_amount":1250000,"net_sales_amount":1180000,"order_count":82}],"item_rows":[{"business_date":"2026-05-01","item_name":"아메리카노","quantity":41,"gross_sales_amount":184500,"net_sales_amount":184500}]}'
curl -i -X POST "$API_BASE/api/v1/stores/$STORE_ID/context/collect" -H "Authorization: Bearer $ID_TOKEN" -H "Content-Type: application/json" -d '{"mode":"seed"}'
```

## 알려진 제한

- live POS API integration은 아직 없음
- external public API collectors는 key-gated stub
- Excel binary parsing은 아직 없음
- 공식 상권 코드/정확한 실제 점포 위치는 검증 전 단정하지 않음
- 고급 AI generation 대신 rule-based cause/action seed 사용

## 다음 권장 단계

STEP 4 full hardening에서 Aurora-backed runtime store 적용 범위, RBAC 권한, upload UX, live collector scheduler, WAF/rate limit, tenant isolation 운영 검증을 진행한다.
