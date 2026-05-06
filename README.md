# Small Merchant Revenue Ops Backbone

Release-to-issue traceability 기반 Event-Driven Product Ops Backbone에서 출발해, M6에서는 소상공인 Revenue Ops SaaS runtime과 cockpit으로 제품화한 프로젝트입니다.

핵심 흐름:

```text
store registration
  -> revenue/POS upload
  -> public/private context collection
  -> normalized evidence observations
  -> candidate causes
  -> action planner
  -> action status/result tracking
```

인과관계를 확정하지 않습니다. 화면과 API copy는 `함께 관측되었습니다`, `가능성 높은 원인 후보`, `추가 확인이 필요합니다`, `인과가 확정된 것은 아닙니다`를 기준으로 합니다.

## Current Live Capabilities

- API Gateway + Cognito + Lambda + Aurora 기반 Revenue API
- Lambda private subnet + Aurora access
- `single_nat` VPC egress profile
- Seoul Open Data TCP 8088 egress
- Secrets Manager 기반 public context credential loading
- Store-scoped Revenue Ops APIs
- Store onboarding 후 automatic context bootstrap
- Revenue upload/preview, rejected rows, reprocess skeleton
- Context collectors with timeout-safe partial results
- Action Planner status tracking
- `#revenue-cockpit` frontend with KO/EN and theme switch

Verified live before this packaging pass:

- Kakao/KMA/Seoul full live context collection: 5 completed, 0 skipped, 0 failed
- Naver Local smoke: HTTP 200, item_count 5
- Naver DataLab smoke: HTTP 200, result_count 2
- Korean holiday API HTTPS smoke: HTTP 200, resultCode 00

## Architecture Summary

```text
#revenue-cockpit
  -> API Gateway + Cognito
  -> Revenue API Lambda in VPC private subnets
  -> Aurora operational SaaS tables
  -> NAT egress for public context APIs
  -> collector_runs / context_observations / action planner
```

Aurora는 운영 정본입니다. ClickHouse는 기준 문서상 분석/집계/CDC read-model layer이며, 이번 M6 pass에서는 신규 ClickHouse/Terraform 변경을 하지 않습니다.

## Live Collector List

- Kakao geocoding
- KMA weather
- Seoul commercial benchmark
- Seoul foot traffic proxy
- Seoul store density proxy
- Naver Local Search
- Naver DataLab
- Korean holiday calendar
- Toss Place connector smoke foundation
- Delivery provider connector smoke foundation

Toss Place는 foundation only입니다. 사업자 등록/공식 credential 없이 real live integration으로 주장하지 않습니다.

Delivery apps는 CSV upload/parser와 provider skeleton 우선입니다. Baemin/CoupangEats raw login credentials를 저장하지 않고 direct login automation을 구현하지 않습니다.

## Demo Route

```bash
npm --prefix apps/web run dev
PORT=3000 node apps/api/src/server.js
```

Open:

```text
#revenue-cockpit?data=api
```

API mode가 실패하면 bundled demo data로 fallback합니다.

## Validation

Common checks:

```bash
node --test apps/api/src/revenue-ops/context-collectors.test.js
node --test apps/api/src/revenue-ops/revenue-ops-saas-routes.test.js
node --test apps/api/src/revenue-ops/revenue-upload-parsers.test.js
npm --prefix apps/web run check
npm --prefix apps/web run build
node scripts/validate_step3_lambda_package_manifest.js
```

Do not run `terraform apply` as part of M6 packaging validation.

## M6 Docs

- [M6 live smoke result](docs/m6_live_smoke_result_kr.md)
- [M6 architecture overview](docs/m6_architecture_overview_kr.md)
- [M6 demo guide](docs/m6_demo_guide_kr.md)
- [M6 screenshot checklist](docs/m6_screenshot_checklist_kr.md)
- [M6 presentation/interview narrative](docs/m6_presentation_interview_narrative_kr.md)
- [M6 route/use guide](docs/m6_route_use_guide_kr.md)
- [M6 cost/runtime profile](docs/m6_cost_runtime_profile_kr.md)
- [Public context live collectors](docs/public_context_live_collectors_kr.md)

## Known Limitations

- Naver/Holiday live collectors require deployed secret/env state for repeat smoke.
- Toss Place needs valid business/developer registration and official credentials before live integration.
- Binary XLSX parsing is documented as a follow-up; CSV and normalized rows are supported first.
- Platform-scale async collector architecture with SQS/EventBridge/S3 is a future milestone.
- No hard causality claim is made from observed context signals.
