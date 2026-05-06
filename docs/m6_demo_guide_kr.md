# M6 Demo Guide

## 1. 데모 메시지

이 서비스는 소상공인이 매출 변화 후 `무엇이 함께 관측되었고`, `어떤 원인 후보를 추가 확인해야 하며`, `이번 주 어떤 액션을 실행 후보로 둘지` 판단하게 돕는 Revenue Ops SaaS다.

인과관계나 매출 회복을 단정하지 않는다.

## 2. 실행

Web:

```bash
npm --prefix apps/web run dev
```

Local API:

```bash
PORT=3000 node apps/api/src/server.js
```

화면:

```text
#revenue-cockpit?data=api
```

AWS live API를 볼 때는 배포된 frontend 설정의 `VITE_REVENUE_API_BASE_URL` 또는 기본 API endpoint를 사용한다.

## 3. Demo Flow

1. Login
   - Cognito 로그인 상태를 확인한다.
   - API mode에서 store switcher가 표시되는지 확인한다.

2. Register my store
   - `새 가게 등록`에서 store name, business category, region, address를 입력한다.
   - 응답의 `context_bootstrap_hint.recommended = true` 조건이면 frontend가 자동으로 context collection을 호출한다.

3. Auto context bootstrap
   - onboarding panel에서 다음 상태를 설명한다.
   - 가게 등록 완료
   - 위치 맥락 수집 중
   - 날씨 맥락 수집 중
   - 주변 상권 맥락 수집 중
   - 검색/공휴일 맥락 수집 중
   - 초기 분석 준비 완료
   - 일부 실패가 있어도 `현재 수집된 데이터만으로 초기 분석을 시작할 수 있습니다` 문구를 보여준다.

4. Upload/register revenue data
   - `/api/v1/stores/:storeId/revenue/uploads/preview`로 CSV preview를 보여준다.
   - `/api/v1/stores/:storeId/revenue/uploads`로 daily POS 또는 delivery CSV rows를 등록한다.
   - Baemin/CoupangEats는 CSV parser 우선이며 raw login credentials를 저장하지 않는다.

5. Revenue Cockpit
   - Revenue Brief에서 매출 변화와 candidate cause count를 설명한다.
   - “함께 관측되었습니다”와 “인과가 확정된 것은 아닙니다”를 명확히 말한다.

6. Cause Evidence
   - source_name, freshness, status가 있는 context evidence를 보여준다.
   - 기술 ID는 Data Reliability의 세부 보기로 보낸다.

7. Action Planner
   - recommended -> selected/planned/done 상태 변경을 보여준다.
   - done은 outcome tracking placeholder를 생성하지만 실행 효과를 단정하지 않는다.

8. Pipeline Health
   - Kakao/KMA/Seoul/Naver/Holiday 상태를 보여준다.
   - Toss Place와 Delivery provider는 foundation only 또는 missing credential 상태로 설명한다.

## 4. 말하면 안 되는 것

- Toss Place real live integration 완료
- Baemin/CoupangEats direct login automation 구현
- 특정 원인이 매출 변화를 일으켰다는 확정 표현
- TCP 80 egress 추가 필요
- Aurora public exposure

## 5. 3분 요약 스크립트

“POS만 보면 매출이 올랐는지 내렸는지는 보이지만 왜 그런지와 무엇을 해야 하는지는 바로 나오지 않습니다. 이 cockpit은 가게 등록 후 공개 맥락을 자동 수집하고, 매출 데이터와 함께 관측된 날씨, 상권, 주변 점포, 검색 관심도, 공휴일 신호를 정리합니다. 여기서 제시하는 것은 가능성 높은 원인 후보와 evidence-backed suggestion이며, 인과가 확정된 것은 아닙니다. 액션은 상태와 결과 추적까지 이어지지만 실행 효과를 단정하지 않습니다.”
