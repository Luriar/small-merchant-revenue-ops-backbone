# M6 데모 가이드

## 1. 데모 목표

M6 데모의 목표는 새 기능을 보여주는 것이 아니라, M3/M4/M5에서 완성한 Revenue Ops 흐름을 포트폴리오와 인터뷰에서 명확하게 설명하는 것이다.

핵심 메시지:

- 소상공인은 매출 변화 원인과 다음 액션을 빠르게 판단하기 어렵다.
- 이 프로젝트는 Gold 데이터에서 매출 이상, 함께 관측된 근거 후보, 실행 액션, 데이터 신뢰도를 연결한다.
- 현재 데모는 static/export-backed 데이터와 로컬 API 기반이며, AWS 배포/Aurora persistence/live external API collection은 아직 구현하지 않았다.

## 2. Pre-demo Checks

데모 전 확인:

- `git status --short`로 예기치 않은 구현 변경이 없는지 확인한다.
- `npm run validate:m5:engineering`이 통과하는지 확인한다.
- validation 후 `apps/web/tsconfig.tsbuildinfo`가 dirty가 될 수 있음을 인지한다.
- API mode를 보여줄 경우 API와 web을 둘 다 실행한다.
- fallback을 보여줄 경우 API를 끄거나 API 없이 `#revenue-cockpit?data=api`를 연다.

## 3. 실행 방법

웹 실행:

```bash
npm --prefix apps/web run dev
```

API 실행:

```bash
PORT=3000 node apps/api/src/server.js
```

주의: `apps/api/package.json`은 현재 없다. API는 package script가 아니라 `apps/api/src/server.js` Node entrypoint로 실행한다. Vite dev server는 `/api` 요청을 `http://127.0.0.1:3000`으로 proxy한다.

## 4. 열어야 할 화면

기본 데모/static mode:

```text
#revenue-cockpit
```

API mode:

```text
#revenue-cockpit?data=api
```

API mode에서 API fetch가 실패하면 화면 상단에 안내가 뜨고 bundled demo data로 fallback한다.

## 5. Presenter Talk Track

### Revenue Cockpit Overview

"이 화면은 일반 BI 대시보드가 아니라 소상공인이 바로 판단할 수 있는 Revenue Brief입니다. 매출 변화 결론을 먼저 보여주고, 함께 관측된 신호와 이번 주 검토할 액션까지 이어 줍니다."

### Context Data Meaning

"현재 컨텍스트는 M3 Gold/export에서 나온 static 데이터입니다. 날씨, 상권, 점포, 생활인구 같은 신호를 함께 관측된 근거 후보로 보여주지만, 인과관계를 확정한다고 말하지 않습니다."

### Action Planner

"Action Planner는 추천 액션을 `recommended`, `selected`, `planned`, `done`, `dismissed` 상태로 관리합니다. M5에서 API mode일 때 상태 변경이 `PATCH /api/v1/revenue/actions/:id/status`로 연결되도록 보강했습니다. 로컬 데모에서는 in-memory 상태입니다."

### API Mode

"`#revenue-cockpit?data=api`는 프론트가 `/api/v1/revenue/*`를 호출해서 JSON export 기반 데이터를 받아오는 모드입니다. 기본 `#revenue-cockpit`은 API 없이도 보여줄 수 있는 demo/static mode입니다."

### Fallback Behavior

"API mode에서 API가 내려가 있거나 호출에 실패하면 데모가 깨지지 않도록 bundled demo data로 fallback합니다. 포트폴리오 시연 안정성을 위한 설계입니다."

### Current Limitations

"아직 AWS에 실제 배포하지 않았고, Terraform apply도 하지 않았습니다. Revenue Ops action status는 Aurora에 persistence하지 않았고, 외부 컨텍스트 API를 실시간으로 수집하지 않습니다. 이 프로젝트의 현재 완성점은 로컬에서 검증 가능한 Revenue Ops portfolio slice입니다."

## 6. 3분 데모 Flow

1. `#revenue-cockpit`을 연다.
2. Revenue Brief에서 매출 하락 요약과 원인 후보 수를 설명한다.
3. Action Planner에서 액션 하나의 상태를 변경한다.
4. Data Reliability에서 데이터 한계와 static/export-backed 경계를 짚는다.
5. `#revenue-cockpit?data=api`가 API mode임을 짧게 설명한다.

## 7. 5분 데모 Flow

1. 문제 정의를 20초로 설명한다.
2. Revenue Brief에서 결론-first 구조를 설명한다.
3. Cause Evidence에서 "함께 관측된 신호" 표현을 강조한다.
4. Action Planner에서 상태 변경을 보여준다.
5. Data Reliability에서 커버리지와 한계를 보여준다.
6. API mode와 fallback behavior를 설명한다.

## 8. 10분 데모 Flow

1. M3 -> M4 -> M5 -> M6 흐름을 설명한다.
2. `#revenue-cockpit` 기본 데모를 연다.
3. Revenue Brief, Cause Evidence, Action Planner, Data Reliability 네 탭을 차례로 보여준다.
4. 별도 터미널에서 API를 실행하고 `#revenue-cockpit?data=api`를 연다.
5. Action Planner status PATCH 흐름을 설명한다.
6. API를 끄거나 API 없이 API mode를 열어 fallback을 설명한다.
7. README와 M6 docs를 열어 packaging/validation/documentation readiness를 보여준다.
8. 마지막에 아직 하지 않은 것: AWS 배포, Terraform apply, Aurora persistence, live external collection을 명확히 말한다.
