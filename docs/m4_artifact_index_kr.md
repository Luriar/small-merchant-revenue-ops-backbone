# M4 산출물 인덱스

## 1. Data/export

| 경로 | 역할 | 중요한 이유 | 유형 |
| --- | --- | --- | --- |
| `scripts/export_gold_to_json.py` | Gold parquet를 Revenue Ops API JSON으로 변환 | M3 Gold 레이어를 M4 API/UI가 읽을 수 있는 구조로 연결한다 | runtime/support script |
| `apps/api/src/revenue-ops/data/revenue_ops_export.json` | Revenue Ops API가 로드하는 JSON 산출물 | 로컬 데모와 API foundation의 데이터 원천 역할을 한다 | generated data artifact |
| `data/gold/revenue_brief_view/` | 매출 브리프 Gold 결과 | Revenue Brief의 요약과 헤드라인 데이터 기반 | data artifact |
| `data/gold/revenue_anomaly_results/` | 이상 신호 Gold 결과 | 매출/거래/컨텍스트 이상 신호를 API로 넘기는 기반 | data artifact |
| `data/gold/cause_evidence_candidates/` | 원인 근거 후보 Gold 결과 | 가능성 높은 원인 후보와 함께 관측된 신호를 설명한다 | data artifact |
| `data/gold/action_recommendation_candidates/` | 실행 액션 후보 Gold 결과 | Action Planner의 실행 액션 후보 기반 | data artifact |
| `data/gold/revenue_context_mart/` | 상권/업종 컨텍스트 Gold 결과 | Data Reliability와 상권/업종 단위 추정 설명에 필요 | data artifact |

## 2. API/backend

| 경로 | 역할 | 중요한 이유 | 유형 |
| --- | --- | --- | --- |
| `apps/api/src/revenue-ops/revenue-ops-store.js` | JSON export를 로드하고 action status를 관리 | Revenue Ops API foundation의 상태/조회 계층 | runtime code |
| `apps/api/src/revenue-ops/revenue-ops-handler.js` | Revenue Ops HTTP handler | 브리프, 이상 신호, 근거, 액션, 컨텍스트 API 응답을 구성 | runtime code |
| `apps/api/src/server.js` | API route registration | 기존 API 서버에 Revenue Ops route를 연결 | runtime code |

## 3. Frontend

| 경로 | 역할 | 중요한 이유 | 유형 |
| --- | --- | --- | --- |
| `apps/web/src/revenue-cockpit/RevenueCockpitApp.tsx` | Revenue Cockpit root app | KO/EN, Light/Dark/System, 내부 화면 전환을 관리 | runtime code |
| `apps/web/src/revenue-cockpit/RevenueBriefView.tsx` | Revenue Brief 화면 | 매출 변화 결론, annotated trend chart, 원인 후보, 주간 실행 계획을 표현 | runtime code |
| `apps/web/src/revenue-cockpit/RevenueTrendChart.tsx` | 매출 추세 차트 | 12.0% 하락과 함께 관측된 신호 pin을 시각화 | runtime code |
| `apps/web/src/revenue-cockpit/CauseEvidenceView.tsx` | Cause Evidence 화면 | 가능성 높은 원인 후보와 근거 신호를 탐색 | runtime code |
| `apps/web/src/revenue-cockpit/ActionPlannerView.tsx` | Action Planner 화면 | 실행 액션 후보의 상태 흐름을 관리 | runtime code |
| `apps/web/src/revenue-cockpit/DataReliabilityView.tsx` | Data Reliability 화면 | 데이터 신뢰도, 커버리지, 갱신 상태를 표시 | runtime code |
| `apps/web/src/revenue-cockpit/revenueCockpitCopy.ts` | 시나리오/copy 데이터 | KO/EN 문구와 데모 시나리오를 한 곳에서 관리 | runtime code |
| `apps/web/src/revenue-cockpit/revenueCockpitTypes.ts` | 타입 정의 | 화면 간 데이터 구조와 상태 값을 고정 | runtime code |
| `apps/web/src/revenue-cockpit/revenueCockpitShared.tsx` | 공통 UI atom | 아이콘, pill, state menu, theme chrome 등 재사용 요소 | runtime code |
| `apps/web/src/revenue-cockpit/revenueCockpit.css` | Cockpit scoped style | 기존 Product Ops 스타일과 분리된 warm premium SaaS tone 제공 | runtime code |
| `apps/web/src/revenue-cockpit/revenueCockpitApi.ts` | API adapter | Revenue Cockpit과 Revenue Ops API 연결 지점 | runtime code |
| `apps/web/src/revenue-cockpit/revenueCockpitData.ts` | 데이터 adapter/fallback | API 또는 로컬 시나리오 데이터를 화면에 공급 | runtime code |
| `apps/web/src/App.tsx` | hash route 연결 | `#revenue-cockpit` standalone route 진입점을 제공 | runtime code |
| `apps/web/src/types/navigation.ts` | navigation type 확장 | Revenue Cockpit route를 타입 레벨에 반영 | runtime code |

## 4. Design references

| 경로 | 역할 | 중요한 이유 | 유형 |
| --- | --- | --- | --- |
| `docs/design/m4/claude-design/README.md` | Claude Design handoff 안내 | 디자인 번들이 production code가 아니라 reference임을 명시 | design reference |
| `docs/design/m4/claude-design/project/Revenue Cockpit.html` | Claude Design prototype | M4 Revenue Cockpit의 visual/reference source | design reference |
| `docs/design/m4/claude-design/project/direction-a-plus.jsx` | A+ design direction | 최종 톤과 구성 방향의 기준 | design reference |
| `docs/design/m4/claude-design/project/direction-a.jsx` | 대안 디자인 방향 | 비교용 design reference | design reference |
| `docs/design/m4/claude-design/project/direction-b.jsx` | 대안 디자인 방향 | 비교용 design reference | design reference |
| `docs/design/m4/claude-design/project/direction-c.jsx` | 대안 디자인 방향 | 비교용 design reference | design reference |
| `docs/design/m4/claude-design/project/shared.jsx` | prototype shared pieces | production React 구현 시 참고한 prototype 구조 | design reference |
| `docs/design/m4/claude-design/project/uploads/*` | Claude Design에 제공된 입력 자료 | 디자인 생성에 사용된 M3/계획 문맥 | design reference |

## 5. Infrastructure/DB

| 경로 | 역할 | 중요한 이유 | 유형 |
| --- | --- | --- | --- |
| `infra/db/revenue_ops_action_tracking.sql` | Aurora action tracking schema | 운영 환경에서 action status log와 current status를 저장할 준비 | DB/infrastructure artifact |

## 6. Tests

| 경로 | 역할 | 중요한 이유 | 유형 |
| --- | --- | --- | --- |
| `tests/test_gold_json_export.py` | Gold -> JSON export 테스트 | M4 데이터 export 계약을 검증 | test |
| `apps/api/src/**/*.test.js` | Node API 테스트 | 기존 API safety/compatibility boundary가 M4 이후에도 유지됨을 검증 | test |
| `apps/web/package.json` | Web check/build script 정의 | `npm --prefix apps/web run check`, `build` 검증 명령의 근거 | config/test support |
| `package.json` | root validation scripts | 기존 M2 validation/test compatibility 스크립트 위치 | config/test support |

## 7. Documentation

| 경로 | 역할 | 중요한 이유 | 유형 |
| --- | --- | --- | --- |
| `docs/m4_cockpit_design_system_kr.md` | M4 설계 시스템/구현 가이드 | M4 UI/API/Gold export/Aurora schema의 초기 가이드 | documentation |
| `docs/m4_final_closure_summary_kr.md` | M4 종료 요약 | M4 완료 범위와 의미를 정리 | documentation |
| `docs/m4_validation_evidence_kr.md` | 검증 증거 | closure validation 결과를 기록 | documentation |
| `docs/m4_artifact_index_kr.md` | 산출물 인덱스 | M4 주요 파일의 역할과 중요도를 탐색 가능하게 정리 | documentation |
| `docs/m4_scope_boundary_and_non_goals_kr.md` | 범위/비목표 정리 | M4가 한 것과 하지 않은 것을 명확히 분리 | documentation |
| `docs/m5_next_phase_plan_kr.md` | M5 계획 | 발표/포트폴리오/최종 polish 중심의 다음 단계 계획 | documentation |
