# M6 Route / Use Guide

## 1. 실제 프론트엔드 라우팅

`apps/web/src/App.tsx` 기준으로 hash route를 해석한다. hash에서 `?` 뒤 query는 route 판정에서 제외한다.

지원 route:

- `#traceability`: 기본 Traceability Overview
- `#changes`: Change Timeline
- `#issues`: Linked Issue View
- `#runs`: Reliability Panel
- `#revenue-cockpit`: Revenue Cockpit

알 수 없는 hash 또는 hash가 없으면 `traceability` 화면으로 fallback한다.

## 2. Revenue Cockpit

기본 데모/static mode:

```text
#revenue-cockpit
```

이 모드는 API를 요구하지 않고 bundled scenario data를 사용한다.

## 3. API Mode

API-backed mode:

```text
#revenue-cockpit?data=api
```

`apps/web/src/revenue-cockpit/revenueCockpitData.ts`의 API mode 판정에 따라 프론트는 Revenue Ops API를 호출한다. 호출 대상은 다음과 같다.

- `GET /api/v1/revenue/briefs`
- `GET /api/v1/revenue/anomalies`
- `GET /api/v1/revenue/actions`
- `GET /api/v1/revenue/context`
- `GET /api/v1/revenue/pipeline-meta`
- `PATCH /api/v1/revenue/actions/:id/status`

## 4. Fallback Behavior

API mode에서 fetch가 실패하면 화면은 bundled demo data로 fallback한다. 이때 cockpit 상단에 "API 데이터를 불러오지 못해 데모 데이터를 표시합니다." 안내가 표시된다.

Action status PATCH가 실패하면 화면 상태는 유지하고 "상태 변경을 API에 저장하지 못했습니다. 화면 상태는 유지됩니다." 안내가 표시된다.

## 5. Supported User Actions

현재 구현된 사용자 액션:

- Revenue Cockpit 네 탭 이동: Revenue Brief, Cause Evidence, Action Planner, Data Reliability
- KO/EN 언어 전환
- Light/Dark/System theme 전환
- Action Planner 상태 변경
- API mode에서 Action Planner 상태 PATCH 요청

Action status 값:

- `recommended`
- `selected`
- `planned`
- `done`
- `dismissed`

## 6. Data Boundary

현재 컨텍스트 데이터는 M3 Gold/export 기반 static data다. API mode도 live external API를 호출하는 것이 아니라 `apps/api/src/revenue-ops/data/revenue_ops_export.json`을 읽는 Revenue Ops API를 통해 export-backed 데이터를 제공한다.

아직 구현하지 않은 것:

- live external context API collection
- Aurora runtime persistence for Revenue Ops action status
- deployed production API
- AWS-hosted frontend/API
