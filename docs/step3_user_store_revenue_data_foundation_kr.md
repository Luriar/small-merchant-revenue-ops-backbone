# STEP 3 User/Store-scoped Revenue Data SaaS Foundation

## 목표

STEP 3는 인증된 Revenue Cockpit을 실제 SaaS 골격으로 전환한다. Cognito 사용자는 내부 `app_users`로 매핑되고, 사용자는 가게를 생성/선택하며, 매출 브리프/이상 신호/액션/컨텍스트/파이프라인 메타는 선택된 `store_id` 범위에서 조회된다.

제품 원칙은 단순 대시보드가 아니다. 매출 변화, 함께 관측된 맥락/근거, 가능성 높은 원인 후보, 실행 가능한 액션, 액션 상태와 결과 추적 흐름을 유지한다. 모든 문구는 인과를 단정하지 않고 "함께 관측되었습니다", "가능성 높은 원인 후보", "추가 확인이 필요합니다", "인과가 확정된 것은 아닙니다"를 기준으로 작성한다.

## 완료 범위

- `app_users`, `tenants`, `tenant_members`, `stores`, `store_members` DDL 추가
- JWT claims 기반 내부 앱 사용자 upsert helper 추가
- 가게 목록/생성 helper 및 store access guard 추가
- 신규 API:
  - `GET /api/v1/me`
  - `GET /api/v1/stores`
  - `POST /api/v1/stores`
  - `GET /api/v1/stores/:storeId/briefs`
  - `GET /api/v1/stores/:storeId/anomalies`
  - `GET /api/v1/stores/:storeId/actions`
  - `PATCH /api/v1/stores/:storeId/actions/:actionId/status`
  - `GET /api/v1/stores/:storeId/context`
  - `GET /api/v1/stores/:storeId/pipeline-meta`
  - `GET /api/v1/stores/:storeId/revenue/uploads`
  - `POST /api/v1/stores/:storeId/revenue/uploads`
  - `GET /api/v1/stores/:storeId/cause-candidates`
  - `GET /api/v1/stores/:storeId/cause-candidates/:causeCandidateId`
  - `POST /api/v1/stores/:storeId/context/collect`
- 기존 `/api/v1/revenue/*` compatibility route 유지
- Revenue Cockpit Store Switcher 추가
- 선택된 store 기준 API refetch 및 action status update
- 로그아웃 시 선택 store id 제거

## 데이터 모델

운영 정본은 Aurora 기준으로 `infra/db/revenue_ops_step3_4_lite.sql`에 정의했다. 핵심 모델은 사용자/테넌트/가게 소유권, 매출 업로드, 일/품목 매출 facts, 공개 컨텍스트, 원인 후보, 액션 플래너, 결과 추적이다.

기존 export/demo 데이터는 seed store인 `성수 커피음료 매장`에 연결되는 방식으로 유지했다. 신규 사용자가 store 목록을 조회하면 seed store가 생성되어 데모 흐름이 사라지지 않는다.

## API 동작

- 인증 누락: `401`
- store membership 없음: `403`
- 잘못된 JSON/body/status: `400`
- OPTIONS preflight: `204`
- 기존 Revenue Cockpit demo/export route: 유지
- 신규 Revenue Cockpit API mode: 선택된 `store_id` route 사용

## 검증 명령

```bash
node --test apps/api/src/revenue-ops/revenue-ops-routes.test.js apps/api/src/revenue-ops/revenue-ops-saas-routes.test.js apps/api/src/lambda-handler.test.js
npm --prefix apps/web run check
npm --prefix apps/web run build
```

## 남은 STEP 4/full automation 항목

- live POS API 연동
- Excel binary parser
- public API key 기반 실제 collector 실행
- EventBridge/Airflow scheduling
- 운영용 RBAC/plan limit/rate limit
- 실제 상권 코드 검증 및 attribution 보강
