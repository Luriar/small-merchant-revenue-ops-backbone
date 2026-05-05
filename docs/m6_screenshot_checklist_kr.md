# M6 스크린샷 체크리스트

## 1. README Hero

- 파일명 제안: `m6_01_readme_overview.png`
- 캡처 조건: README 상단의 project definition, Problem, Current Scope가 보이도록 캡처한다.
- 포트폴리오 의미: 프로젝트가 단순 화면 구현이 아니라 문제, 범위, 구현 경계를 갖춘 완성 패키지임을 보여준다.

## 2. Revenue Cockpit Main Overview

- 파일명 제안: `m6_02_revenue_cockpit_brief_demo.png`
- 캡처 조건: `#revenue-cockpit` 기본 mode에서 Revenue Brief 탭을 연다.
- 포트폴리오 의미: 소상공인 관점의 매출 변화 요약, 원인 후보, 액션 연결을 한 장으로 보여준다.

## 3. API Mode

- 파일명 제안: `m6_03_revenue_cockpit_api_mode.png`
- 캡처 조건: API를 `PORT=3000 node apps/api/src/server.js`로 실행한 뒤 `#revenue-cockpit?data=api`를 연다.
- 포트폴리오 의미: M5에서 추가한 API-backed cockpit mode가 화면과 연결되어 있음을 보여준다.

## 4. Action Planner Status Update

- 파일명 제안: `m6_04_action_planner_status_update.png`
- 캡처 조건: Action Planner 탭에서 액션 하나를 `selected`, `planned`, 또는 `done` 상태로 변경한 뒤 캡처한다.
- 포트폴리오 의미: 브리프가 읽기 전용 대시보드에 머물지 않고 실행 액션 상태 흐름까지 포함함을 보여준다.

## 5. Fallback/Demo Behavior

- 파일명 제안: `m6_05_api_fallback_demo.png`
- 캡처 조건: API 서버를 실행하지 않은 상태에서 `#revenue-cockpit?data=api`를 열고 fallback notice가 보이게 캡처한다.
- 포트폴리오 의미: API 장애 시에도 데모가 깨지지 않고 bundled demo data로 안전하게 전환되는 M5 hardening 결과를 보여준다.

## 6. Validation/Test Terminal

- 파일명 제안: `m6_06_validation_terminal.png`
- 캡처 조건: `npm run validate:m5:engineering` 완료 후 PASS 결과와 마지막 `M5 engineering validation complete` 메시지가 보이게 캡처한다.
- 포트폴리오 의미: 프론트 type check/build, Python tests, Node API tests가 통합 검증된 상태임을 증명한다.

## 7. Architecture/Document

- 파일명 제안: `m6_07_architecture_overview.png`
- 캡처 조건: `docs/m6_architecture_overview_kr.md`의 data flow 또는 README Architecture 섹션을 캡처한다.
- 포트폴리오 의미: M3 Gold/export -> JSON -> API -> frontend -> fallback 구조를 설명 자료로 제시할 수 있다.

## 8. Optional Reliability Screen

- 파일명 제안: `m6_08_data_reliability.png`
- 캡처 조건: Data Reliability 탭에서 source/reliability/context limitation 정보가 보이게 캡처한다.
- 포트폴리오 의미: 현재 데이터가 static/export-backed이며 live external API collection이 아니라는 한계를 정직하게 드러낸다.
