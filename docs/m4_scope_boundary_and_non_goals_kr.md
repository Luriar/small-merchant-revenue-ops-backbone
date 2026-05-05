# M4 범위 경계와 비목표

## 1. 문서 목적

이 문서는 M4가 완료한 범위와 의도적으로 하지 않은 범위를 분리한다.

M4는 M3 Gold 레이어를 merchant-facing Revenue Ops Cockpit으로 제품화한 단계다. 다만 인프라 확장, 실시간 운영 서비스화, 인과관계 확정, 매출 회복 보장은 M4 범위가 아니다.

## 2. M4 완료 범위

- Gold -> API JSON export
- Revenue Ops API foundation
- Aurora action tracking schema 준비
- Claude Design A+ reference 보관
- Standalone `#revenue-cockpit` route
- Revenue Brief 화면
- Cause Evidence 화면
- Action Planner 화면
- Data Reliability 화면
- KO/EN language support
- Light/Dark/System theme support
- Action Planner status workflow
- Revenue Brief weekly plan clipping fix
- 기존 Product Ops/TraceOps page 보존

## 3. 명시적으로 제외한 범위

M4에서 다음은 포함하지 않았다.

- 새로운 M3 pipeline 로직
- Terraform 변경
- 운영 인프라 배포 자동화
- 외부 SaaS 양방향 연동
- 사용자 계정/RBAC/멀티테넌시
- 모든 데이터의 실시간 수집
- 실시간 Aurora runtime을 로컬 데모 필수 조건으로 만드는 것
- Product Ops legacy page 대체
- Claude Design prototype HTML을 production HTML로 직접 사용하는 것
- 인과관계 확정 표현
- 매출 회복 보장 표현

## 4. Aurora runtime 준비와 로컬 데모의 관계

`infra/db/revenue_ops_action_tracking.sql`은 운영 환경에서 Action Planner 상태 전환을 저장하기 위한 준비물이다.

스키마는 다음 목적을 가진다.

- action status 변경 이력을 append-only log로 남긴다.
- action별 현재 상태를 current status table로 조회 가능하게 한다.
- 향후 `PATCH /api/v1/revenue/actions/:id/status`가 Aurora persistence와 연결될 수 있는 경계를 만든다.

다만 M4 로컬 데모는 Aurora 연결을 필수로 요구하지 않는다.

이유는 다음과 같다.

- M4의 핵심 목적은 Gold 데이터를 브리프/근거/액션/신뢰도 UI로 제품화하는 것이다.
- 로컬에서는 `revenue_ops_export.json`과 in-memory action status만으로 UI 흐름을 검증할 수 있다.
- Aurora persistence는 운영 전환을 위한 준비이지, M4 데모의 필수 runtime dependency가 아니다.

## 5. Revenue Cockpit이 standalone인 이유

Revenue Cockpit은 기존 Product Ops/TraceOps 화면을 대체하지 않는다.

분리한 이유는 다음과 같다.

- 기존 Product Ops는 release-to-issue traceability 중심의 운영 콘솔이다.
- Revenue Cockpit은 M3 Gold 매출 운영 데이터를 소상공인 관점으로 보여주는 별도 제품 표면이다.
- 두 화면은 문제 영역과 사용자가 다르므로 같은 AppShell/Sidebar에 섞으면 M4의 merchant-facing 맥락이 흐려진다.
- `#revenue-cockpit` route는 기존 route를 보존하면서 M4를 독립적으로 시연할 수 있게 한다.

## 6. Claude Design output의 위치

`docs/design/m4/claude-design/`의 파일은 reference다.

이 파일들은 다음 용도로 보관한다.

- visual direction 확인
- layout/copy/design tone 비교
- M4 구현 의사결정의 근거 보존
- 포트폴리오/발표에서 디자인 발전 과정을 설명

반대로 다음을 의미하지 않는다.

- production HTML을 그대로 배포한다는 의미가 아니다.
- prototype 내부 구조를 React production 구조로 그대로 복사한다는 의미가 아니다.
- reference가 실제 런타임 코드보다 우선한다는 의미가 아니다.

Production UI는 `apps/web/src/revenue-cockpit/`의 React 코드와 scoped CSS다.

## 7. 인과관계를 주장하지 않는 이유

M4의 원인 후보는 가능성 높은 원인 후보이며, 함께 관측된 신호다.

예를 들어 매출 하락과 생활인구 감소, 강수일수 증가, 점포수 증가가 함께 보일 수 있다. 그러나 이 사실만으로 특정 요인이 매출 하락의 원인이라고 확정할 수 없다.

따라서 M4 copy와 UI는 다음 표현을 사용한다.

- 가능성 높은 원인 후보
- 함께 관측된 신호
- 추가 확인이 필요합니다
- 인과관계를 확정하거나 매출 회복을 보장하지 않습니다

피해야 하는 표현은 다음과 같다.

- 특정 요인을 단정적으로 원인이라고 말하는 표현
- 이 요인이 매출 하락의 원인이다
- 이 액션을 하면 매출이 회복된다

## 8. 액션 추천의 의미

Action Planner의 액션은 실행 액션 후보다.

역할은 다음과 같다.

- 소상공인이 이번 주에 검토할 수 있는 실행 후보를 정리한다.
- 원인 후보와 연결된 이유를 함께 보여준다.
- 선택, 계획, 완료, 보류 상태로 의사결정을 추적한다.

보장하지 않는 것은 다음과 같다.

- 매출 회복
- 원인 해결
- 모든 업종/상권에서의 동일 효과
- 실제 운영 시스템의 자동 실행

액션은 decision support이며, 사용자가 본인 매장 상황에 맞춰 판단해야 한다.

## 9. 데이터 신뢰도 경계

M4는 상권/업종 단위 추정과 공공/집계 데이터 기반 신호를 사용한다.

한계는 다음과 같다.

- 개별 매장 POS 실데이터와 다를 수 있다.
- 상권 단위 집계는 매장별 상황을 완전히 설명하지 못한다.
- 데이터 소스별 갱신 주기와 커버리지가 다르다.
- 날씨/공휴일/경쟁/생활인구는 설명 후보이지 확정 원인이 아니다.

Data Reliability 화면은 이 한계를 숨기지 않고 사용자가 신뢰 범위를 판단하게 하는 장치다.

## 10. M4 종료 기준

M4는 다음 기준으로 종료한다.

- 구현 범위 완료
- 기존 Product Ops/TraceOps page 보존
- validation command 통과
- closure documentation 작성
- M5를 presentation/portfolio packaging 중심으로 넘길 수 있는 상태

M4 이후에는 새로운 기능을 즉시 추가하기보다, M5에서 시연 가이드와 포트폴리오 정리를 우선한다.
