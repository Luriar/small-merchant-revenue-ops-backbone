# STEP 3 Real-service Considerations

## 데이터 민감도

개별 가게 매출은 공개 데이터가 아니며 민감한 운영 데이터다. STEP 3 업로드 API는 분석에 필요한 매출/주문/취소/환불/할인/결제수단 합계와 품목 집계만 받는다. 카드번호, 고객 식별자, 원문 고객 정보, raw POS 고객 payload는 저장하지 않는다.

## POS 업로드 우선

초기 SaaS UX는 POS/API 직접 연동보다 JSON/CSV 업로드를 먼저 지원한다. 실제 매장 연동은 공급자별 OAuth/API 계약과 장애 대응이 필요하므로 이후 단계로 둔다. 현재 구현은 `manual_template`, `generic_pos_csv`, `synthetic_seed` 같은 source_type을 수용하는 foundation이다.

## 공개 데이터 attribution

날씨, 공휴일, 상권, 유동인구, 지하철, 점포 밀도, 검색 트렌드 등은 공개 맥락 데이터로만 취급한다. 개별 매출 변화의 원인으로 단정하지 않는다. UI/API copy는 "함께 관측되었습니다", "가능성 높은 원인 후보", "추가 확인이 필요합니다", "인과가 확정된 것은 아닙니다" 원칙을 따른다.

## 업로드 UX

업로드는 accepted/rejected count를 분리한다. 잘못된 날짜, 누락된 품목명, 음수 주문수 등은 rejected row로 남기고 전체 업로드를 무조건 실패시키지 않는다. 대량 업로드 UX에서는 row preview와 mapping 화면이 추가로 필요하다.

## 원인 후보와 액션 guardrail

Cause candidate는 `strong/medium/weak` confidence만 표현한다. 액션은 evidence-backed suggestion이며 효과를 보장하지 않는다. Done 상태로 변경되어도 즉시 성공으로 표시하지 않고 "결과 추적 대기 중" placeholder를 둔다.

## 멀티스토어 권한

`store_members` role은 `owner/admin/operator/viewer`를 기준으로 한다. 현재 구현은 조회와 상태 변경을 membership 기반으로 제한한다. 운영 전에는 role별 write permission, 초대 flow, disabled 상태 처리 UX가 더 필요하다.

## 가격/플랜 훅

향후 가격 정책은 tenant/store 수, 업로드 row count, collector run 수, public context cache refresh cadence 기준으로 붙일 수 있다. 현재 schema는 tenant/store/upload/collector_runs 단위로 usage 측정을 추가하기 쉽다.

## 배치/캐시 전략

공개 맥락 데이터는 실시간성이 낮을 수 있다. 날씨/공휴일은 일 단위, 상권 벤치마크는 월/분기 단위, 점포 밀도는 주/월 단위 refresh가 적절하다. Revenue Cockpit은 최신 업로드와 최신 context observation을 pipeline meta에 표시해 freshness를 사용자에게 노출한다.
