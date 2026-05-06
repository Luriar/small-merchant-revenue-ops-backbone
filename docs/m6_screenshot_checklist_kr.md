# M6 Screenshot Checklist

## 1. Auth / Login

- Cognito 로그인 전 상태
- 로그인 후 `#revenue-cockpit?data=api`
- store switcher 표시
- KO/EN 전환
- Light/Dark/System theme 전환

## 2. Store Registration

- `새 가게 등록` form
- address_text + business_category 입력 상태
- 생성 후 선택된 store가 바뀐 상태
- `context_bootstrap_hint`에 따라 자동 수집이 시작된 onboarding panel

## 3. Context Bootstrap Progress

- 가게 등록 완료
- 위치 맥락 수집 중
- 날씨 맥락 수집 중
- 주변 상권 맥락 수집 중
- 검색/공휴일 맥락 수집 중
- 초기 분석 준비 완료
- partial copy: `일부 맥락데이터 수집이 지연되었습니다.`
- retry button: `맥락데이터 다시 수집`

## 4. Revenue Cockpit Overview

- 매출 변화 headline
- candidate cause 요약
- evidence-backed suggestion 문구
- `인과가 확정된 것은 아닙니다` 또는 equivalent caution

## 5. Cause Evidence

- cause sidebar
- observed metric comparison
- linked metrics `함께 관측되었습니다`
- source/evidence panel
- caution note: 추가 확인 필요

## 6. Action Planner

- recommended action list
- selected/planned/done/dismissed 상태 변경
- done 후 outcome tracking placeholder
- `실행 효과를 단정하지 않습니다` 취지의 risk note

## 7. Pipeline Health

- Kakao
- KMA
- Seoul commercial
- Seoul foot traffic
- Seoul store density
- Naver Local
- Naver DataLab
- Holiday
- Toss foundation 상태
- Delivery upload/provider 상태
- expandable collector detail section

## 8. Full Live Context Evidence

- pipeline-meta 최신 collector run
- context observations with `source_name`
- freshness / status / duration_ms
- no raw secrets
- no raw delivery login credentials
