# M4 최종 종료 요약

## 1. M4 한 줄 요약

M4는 M3의 medallion/Gold 레이어를 소상공인이 읽고 판단할 수 있는 merchant-facing Revenue Ops 코크핏으로 제품화한 단계다.

핵심 흐름은 다음과 같다.

```text
source -> structure -> evidence -> action -> reliability
```

M4는 단순 대시보드가 아니라, Gold 데이터의 구조화된 신호를 가능성 높은 원인 후보, 실행 액션 후보, 데이터 신뢰도까지 이어 주는 매출 운영 브리프다.

## 2. 완료 범위

- Gold parquet 결과를 API가 제공할 수 있는 JSON으로 내보내는 `scripts/export_gold_to_json.py`를 추가했다.
- `apps/api/src/revenue-ops/`에 Revenue Ops API foundation을 추가했다.
- `infra/db/revenue_ops_action_tracking.sql`에 Aurora action tracking용 스키마 초안을 추가했다.
- Claude Design A+ 기준 산출물을 `docs/design/m4/claude-design/` 아래에 보관했다.
- `#revenue-cockpit` 단독 라우트를 추가했다.
- Revenue Brief, Cause Evidence, Action Planner, Data Reliability 네 화면을 구현했다.
- KO/EN 언어 전환을 지원한다.
- Light/Dark/System 테마 전환을 지원한다.
- Action Planner 상태 흐름을 구현했다.
- Revenue Brief 주간 실행 계획 카드의 clipping 문제를 수정했다.
- 기존 Product Ops/TraceOps 화면을 유지하고 Revenue Cockpit이 이를 대체하지 않도록 분리했다.

## 3. M3에서 M4로 바뀐 점

M3는 매출 운영 데이터를 medallion 구조로 정리하고 Gold 레이어까지 만드는 기반 단계였다.

M4는 그 결과를 사람이 판단할 수 있는 제품 표면으로 올렸다. Gold 파일은 JSON export를 통해 API 응답 형태로 구조화되고, 프론트엔드는 이를 소상공인 관점의 브리프, 근거, 액션, 신뢰도 화면으로 표현한다.

즉 M3가 `source -> structure`를 닫았다면, M4는 `structure -> evidence -> action -> reliability`까지 사용자 경험으로 연결했다.

## 4. 아키텍처 요약

### Source

M3에서 생성한 Gold parquet가 Revenue Ops의 데이터 출발점이다. 주요 Gold 영역은 매출 브리프, 이상 신호, 원인 근거 후보, 액션 후보, 상권/업종 컨텍스트다.

### Structure

`scripts/export_gold_to_json.py`가 Gold parquet를 `apps/api/src/revenue-ops/data/revenue_ops_export.json`으로 변환한다. API는 이 JSON을 읽어 브리프, 이상 신호, 근거, 액션, 컨텍스트를 제공한다.

### Evidence

Cause Evidence 화면은 매출 변화와 함께 관측된 신호를 근거 후보로 보여준다. 표현은 인과관계 확정이 아니라 가능성 높은 원인 후보와 함께 관측된 신호에 맞춘다.

### Action

Action Planner는 실행 액션 후보를 상태 흐름으로 관리한다. 액션은 매출 회복을 보장하는 처방이 아니라 의사결정을 돕는 후보로 취급한다.

### Reliability

Data Reliability 화면은 데이터 소스 상태, 커버리지, 갱신 정보, 상권/업종 단위 추정의 한계를 노출한다. 사용자가 브리프를 신뢰할 수 있는 범위와 주의점을 확인하도록 한다.

## 5. UI/Product 요약

Revenue Cockpit은 기존 Product Ops AppShell/Sidebar를 사용하지 않는 단독 경험이다.

- Revenue Brief: 2024 Q4 성수 커피음료 매출 하락을 결론 먼저 보여주고, 함께 관측된 원인 후보와 이번 주 실행 계획을 연결한다.
- Cause Evidence: 가능성 높은 원인 후보별 근거와 신호 강도를 탐색한다.
- Action Planner: 추천 액션을 `recommended`, `selected`, `planned`, `done`, `dismissed` 상태로 관리한다.
- Data Reliability: 데이터 출처, 커버리지, 갱신 상태, 한계를 표시한다.

UI 톤은 따뜻한 premium SaaS 스타일을 유지하며, 개발자용 모니터링 대시보드처럼 보이지 않도록 브리프와 액션 중심으로 구성했다.

## 6. API/Data 요약

Revenue Ops API foundation은 다음 역할을 가진다.

- `revenue-ops-store.js`: JSON export를 로드하고, 액션 상태를 로컬 in-memory 상태로 관리한다.
- `revenue-ops-handler.js`: Revenue Ops API 응답을 생성한다.
- `revenue_ops_export.json`: Gold 레이어에서 API로 전달되는 정적 JSON 산출물이다.

주요 API 범위는 브리프 목록/상세, 이상 신호, 근거, 액션, 컨텍스트, 파이프라인 메타다.

Aurora action tracking schema는 운영 환경에서 액션 상태 전환을 append-only 로그와 current status 패턴으로 저장할 수 있도록 준비했다. 다만 로컬 데모는 이 Aurora 런타임 연결을 필수로 요구하지 않는다.

## 7. Action 상태 워크플로 요약

상태 값은 다음 다섯 가지다.

- `recommended`: 추천됨
- `selected`: 선택됨
- `planned`: 계획됨
- `done`: 완료
- `dismissed`: 보류

UI 버튼 문구는 한국어 기준 `선택하기`, `계획함`, `완료`, `보류`를 사용한다. 상태 전환은 사용자의 검토와 실행 계획 관리를 돕기 위한 로컬 워크플로이며, 매출 회복을 보장하지 않는다.

## 8. 디자인 시스템 요약

M4 디자인은 Claude Design A+ reference를 참고하되, 프로덕션 UI는 React 컴포넌트로 재구성했다.

주요 원칙은 다음과 같다.

- 결론 먼저 보여주는 editorial brief 구조
- 가능성 높은 원인 후보와 함께 관측된 신호라는 안전한 표현
- 따뜻한 premium SaaS 컬러와 낮은 장식성
- KO/EN copy 분리
- Light/Dark/System 테마
- Revenue Cockpit 전용 scoped CSS
- 기존 Product Ops 화면과 독립된 route/module 구조

## 9. 의도적으로 포함하지 않은 것

- 새로운 M3 pipeline 기능 추가
- Terraform 또는 인프라 변경
- 기존 Product Ops 화면 대체
- Product Ops AppShell/Sidebar 재사용
- 모든 데이터의 실시간성 보장
- 인과관계 확정 표현
- 매출 회복 보장 표현
- 상용 서비스 수준의 사용자 계정, RBAC, 운영 배포 자동화
- 외부 SaaS와의 양방향 실제 연동

## 10. 남은 리스크와 한계

- 현재 Revenue Cockpit의 데모 데이터는 M4 산출물 기준이며, 운영 실시간 데이터 연결은 별도 단계가 필요하다.
- 로컬 API의 action status 변경은 in-memory 동작이다. Aurora action tracking schema는 준비되었지만 로컬 데모 필수 조건은 아니다.
- Node API 테스트는 기존 M2 compatibility 성격이 강하며, Revenue Ops API 전용 Node route 테스트는 M5에서 추가할 수 있다.
- Gold export 테스트는 JSON 산출물을 재생성할 수 있으므로 검증 후 worktree 상태 확인이 필요하다.
- 매출 하락과 원인 후보는 함께 관측된 신호 기반이며 인과관계 확정이 아니다.
- 실행 액션 후보는 decision support이며 매출 회복을 보장하지 않는다.

## 11. 최종 M4 상태

M4는 종료 가능한 상태다.

구현 범위는 완료되었고, `2026-05-05 18:56:40 KST` 기준 closure validation은 통과했다. M5는 새로운 엔지니어링 마일스톤이 아니라 발표/포트폴리오 패키징과 최종 정리 단계로 진행하는 것이 적절하다.
