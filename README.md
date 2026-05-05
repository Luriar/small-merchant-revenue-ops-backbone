# Small Merchant Revenue Ops Backbone

Release-to-issue traceability 기반 Event-Driven Product Ops Backbone에서 출발해, M3-M6에서는 소상공인 매출 변화 설명과 실행 액션 제안을 보여주는 Revenue Ops 포트폴리오 데모로 패키징한 프로젝트입니다.

## Problem

소상공인은 POS, 주문, 매출, 상권 데이터를 어느 정도 가지고 있어도 "왜 매출이 변했는지"와 "이번 주에 어떤 액션을 검토해야 하는지"를 빠르게 판단하기 어렵습니다.

이 프로젝트는 매출 변화 신호를 구조화하고, 함께 관측된 컨텍스트 근거와 실행 액션 후보, 데이터 신뢰도까지 한 화면 흐름으로 연결하는 것을 목표로 합니다. 단, 현재 구현은 인과관계 확정이나 매출 회복 보장이 아니라 의사결정 지원 데모입니다.

## Current Scope

### M3: Revenue Ops Medallion Foundation

- 서울시 상권/매출/생활인구/점포/날씨/공휴일/지역행사 기반 샘플 파이프라인
- Bronze/Silver/Gold medallion 구조
- 매출 이상 탐지, 원인 근거 후보 연결, 액션 카탈로그 매핑
- Revenue Brief와 pipeline reliability 산출물 생성

### M4: Gold to API and Cockpit

- Gold parquet 결과를 deterministic JSON artifact로 export
- `apps/api/src/revenue-ops/` Revenue Ops API foundation
- standalone `#revenue-cockpit` frontend
- Revenue Brief, Cause Evidence, Action Planner, Data Reliability 화면

### M5: Engineering Hardening

- deterministic export/test hygiene
- `#revenue-cockpit?data=api` API mode
- API failure -> demo fallback
- Action Planner `PATCH /api/v1/revenue/actions/:id/status` wiring
- Revenue Ops API Node tests
- `npm run validate:m5:engineering` validation script
- AWS deployment readiness document

### M6: Portfolio Packaging

- README, demo guide, screenshot checklist, route/use guide
- architecture overview
- presentation/interview narrative
- final validation and closure reports

## Architecture

```text
M3 medallion/gold data
  -> scripts/export_gold_to_json.py
  -> apps/api/src/revenue-ops/data/revenue_ops_export.json
  -> Revenue Ops API (/api/v1/revenue/*)
  -> #revenue-cockpit frontend
```

The API currently reads static/export-backed JSON and keeps Action Planner status changes in memory for the local demo. The frontend can run in pure demo mode or request API-backed data and fall back to demo data if the API is unavailable.

## Demo Modes

- `#revenue-cockpit`: default standalone cockpit using bundled demo/static data.
- `#revenue-cockpit?data=api`: API mode. The frontend fetches `/api/v1/revenue/briefs`, `/anomalies`, `/actions`, `/context`, and `/pipeline-meta`.
- API failure fallback: if API mode cannot load data, the cockpit shows a notice and reverts to bundled demo data.

Other existing hash routes remain available:

- `#traceability`
- `#changes`
- `#issues`
- `#runs`

## Intentionally Not Implemented Yet

- No real AWS deployment has been performed.
- No `terraform apply` has been run for this M6 portfolio state.
- No real Aurora runtime persistence is connected for Revenue Ops action status.
- No live external context API collection is implemented.
- Current context data is static/export-backed from the M3 Gold/export path, not live API fetch.

## Local Run

Install dependencies first if needed:

```bash
npm install
pip install -r requirements-pipelines.txt
```

Run the web app:

```bash
npm --prefix apps/web run dev
```

Open the Vite URL and use one of:

```text
#revenue-cockpit
#revenue-cockpit?data=api
```

Run the API for API mode:

```bash
PORT=3000 node apps/api/src/server.js
```

Note: `apps/api/package.json` is not present, so the API currently uses the Node entrypoint directly rather than an API package script. The web Vite config proxies `/api` to `http://127.0.0.1:3000`.

Run the M3 sample pipeline:

```bash
python -m pipelines.orchestration.run_local_medallion_pipeline \
  --use-samples --target-year 2024 --target-quarter 4
```

Export Gold data to JSON:

```bash
python3 scripts/export_gold_to_json.py
```

## Validation

Discovered safe local validation scripts:

```bash
npm --prefix apps/web run check
npm --prefix apps/web run build
python3 -m pytest tests/ -q
node --test apps/api/src/**/*.test.js
npm run validate:m5:engineering
```

`npm run validate:m5:engineering` runs the web type check, web build, Python tests, and Node API tests. It may leave generated validation artifacts dirty, especially `apps/web/tsconfig.tsbuildinfo`.

Do not run AWS mutating commands, `terraform apply`, or deployment commands as part of M6 validation.

## Documentation

- M3 completion: [docs/m3_completion_checklist_kr.md](docs/m3_completion_checklist_kr.md)
- M4 closure: [docs/m4_final_closure_summary_kr.md](docs/m4_final_closure_summary_kr.md)
- M5 AWS readiness: [docs/m5_aws_deployment_readiness_kr.md](docs/m5_aws_deployment_readiness_kr.md)
- M6 demo guide: [docs/m6_demo_guide_kr.md](docs/m6_demo_guide_kr.md)
- M6 screenshot checklist: [docs/m6_screenshot_checklist_kr.md](docs/m6_screenshot_checklist_kr.md)
- M6 route/use guide: [docs/m6_route_use_guide_kr.md](docs/m6_route_use_guide_kr.md)
- M6 architecture overview: [docs/m6_architecture_overview_kr.md](docs/m6_architecture_overview_kr.md)
- M6 presentation/interview narrative: [docs/m6_presentation_interview_narrative_kr.md](docs/m6_presentation_interview_narrative_kr.md)
- M6 final validation report: [docs/m6_final_validation_report_kr.md](docs/m6_final_validation_report_kr.md)
- M6 closure summary: [docs/m6_closure_summary_kr.md](docs/m6_closure_summary_kr.md)

## Portfolio Positioning

This is best presented as a complete local portfolio slice:

1. M3 proves the data foundation: medallion pipeline, Gold mart, anomaly/evidence/action generation.
2. M4 proves productization: JSON export, API foundation, and merchant-facing cockpit.
3. M5 proves engineering reliability: API mode, fallback, status PATCH, tests, validation, AWS readiness.
4. M6 proves communication readiness: demo script, architecture narrative, screenshots, and honest closure.

## Roadmap

Future production work should be treated as a new milestone, not as completed M6 scope:

- live merchant ingestion from POS/order/sales systems
- scheduled external context collectors
- Aurora persistence for action tracking and operational state
- deployed API/frontend on AWS
- production observability, alerting, and runbooks
- stronger identity, tenant isolation, and access control
