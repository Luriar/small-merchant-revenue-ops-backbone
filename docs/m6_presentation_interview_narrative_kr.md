# M6 Presentation / Interview Narrative

## 1. 30초 Pitch

소상공인은 매출이 떨어져도 왜 떨어졌는지, 이번 주에 무엇을 확인해야 하는지 바로 판단하기 어렵습니다. 이 프로젝트는 M3 medallion pipeline으로 매출/상권/컨텍스트 신호를 Gold 데이터로 만들고, M4/M5에서 이를 Revenue Ops API와 `#revenue-cockpit`으로 연결했습니다. 현재는 로컬에서 검증 가능한 static/export-backed portfolio demo이며, 원인 확정이 아니라 함께 관측된 신호와 실행 액션 후보를 보여주는 의사결정 지원 시스템입니다.

## 2. 1분 Pitch

이 프로젝트의 핵심은 "매출 변화 -> 근거 후보 -> 실행 액션 -> 데이터 신뢰도"를 하나의 판단 흐름으로 만드는 것입니다. M3에서는 public commerce/context sample data를 Bronze/Silver/Gold medallion 구조로 정리했고, M4에서는 Gold 결과를 JSON artifact로 export한 뒤 Revenue Ops API와 standalone cockpit을 만들었습니다. M5에서는 API mode, fallback, Action Planner status PATCH, 전용 API tests, validation script로 발표 안정성을 높였습니다. M6는 새 기능이 아니라 README, demo guide, screenshot checklist, architecture narrative, validation report로 포트폴리오 제출 가능한 상태를 닫는 단계입니다.

## 3. 3분 Technical Explanation

데이터 흐름은 단순하게 유지했습니다. M3 pipeline이 sample commerce/context 데이터를 Gold mart로 만들고, `scripts/export_gold_to_json.py`가 이 결과를 deterministic JSON으로 내보냅니다. API layer는 `apps/api/src/revenue-ops/data/revenue_ops_export.json`을 읽어 `/api/v1/revenue/briefs`, `/anomalies`, `/actions`, `/context`, `/pipeline-meta`를 제공합니다.

Frontend는 hash route 기반입니다. `#revenue-cockpit`은 API 없이 bundled demo data로 동작하고, `#revenue-cockpit?data=api`는 Revenue Ops API를 호출합니다. API가 실패하면 사용자에게 notice를 보여주고 demo data로 fallback합니다. 이 설계는 발표 중 API가 꺼져 있어도 데모가 깨지지 않게 하면서, API integration도 검증할 수 있게 합니다.

Action Planner는 status를 `recommended`, `selected`, `planned`, `done`, `dismissed`로 관리합니다. API mode에서는 status 변경이 `PATCH /api/v1/revenue/actions/:id/status`로 연결됩니다. 다만 현재 로컬 데모의 persistence는 in-memory이며, Aurora persistence는 future production expansion입니다.

검증은 `npm run validate:m5:engineering`으로 web check/build, Python tests, Node API tests를 묶어 실행합니다. AWS 배포 readiness는 문서화했지만 실제 AWS deployment, Terraform apply, Aurora 연결, live external API collection은 아직 수행하지 않았습니다.

## 4. Interview Q&A

### 왜 이 프로젝트를 만들었나?

소상공인은 데이터가 있어도 매출 변화의 원인 후보와 다음 액션을 연결해서 보기 어렵다. 단순 매출 그래프가 아니라 판단 가능한 Revenue Ops cockpit을 만들고 싶었다.

### 핵심 기술 아키텍처는 무엇인가?

M3 Gold/export data -> deterministic JSON artifact -> Revenue Ops API -> standalone `#revenue-cockpit` frontend 흐름이다. API mode가 실패하면 bundled demo data로 fallback한다.

### M3/M4/M5는 각각 무엇을 달성했나?

M3는 medallion foundation과 Gold 산출물을 만들었다. M4는 Gold를 JSON/API/frontend로 제품화했다. M5는 API mode, fallback, status PATCH, tests, validation, AWS readiness로 engineering hardening을 완료했다.

### 무엇이 real이고 무엇이 demo/static인가?

실제로 구현된 것은 로컬 pipeline/export/API/frontend/tests/docs다. 데모 데이터는 M3 Gold/export 기반 static data다. AWS 배포, Aurora persistence, live external context collection은 아직 구현하지 않았다.

### 왜 API fallback을 넣었나?

포트폴리오 데모에서 API 서버 상태 때문에 화면 전체가 깨지는 것을 피하기 위해서다. 동시에 API mode가 있을 때는 실제 API contract와 frontend mapping을 검증할 수 있다.

### 왜 아직 AWS에 배포하지 않았나?

M6의 목적은 기능 확장이 아니라 완성된 로컬 portfolio slice를 정직하게 패키징하는 것이다. 배포는 비용, 보안, 도메인, persistence, observability 결정이 필요하므로 별도 milestone로 다루는 편이 맞다.

### productionize한다면 어떻게 할 것인가?

POS/order/sales ingestion을 붙이고, 외부 컨텍스트 collector를 scheduled pipeline으로 운영한다. Aurora를 action/status 운영 정본으로 연결하고, API를 AWS에 배포하며, observability와 runbook, tenant isolation을 추가한다.

### 이 프로젝트를 통해 개인적으로 무엇을 증명했나?

데이터 파이프라인, API contract, frontend product surface, validation, deployment readiness, presentation packaging을 한 흐름으로 닫을 수 있음을 증명했다. 또한 구현하지 않은 영역을 과장하지 않고 시스템 경계를 명확히 설명하는 습관을 보여준다.
