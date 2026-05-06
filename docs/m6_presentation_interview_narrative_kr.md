# M6 Presentation / Interview Narrative

## 1. Problem

소상공인은 POS와 주문 데이터를 가지고 있어도 매출 변화의 원인 후보와 다음 액션을 빠르게 연결하기 어렵다. 매출 그래프만으로는 날씨, 상권, 주변 점포, 검색 관심도, 공휴일 같은 외부 맥락을 함께 판단하기 어렵다.

## 2. User

대상 사용자는 소규모 카페/음식점/로컬 매장 운영자 또는 매니저다. 이들은 데이터 분석가가 아니므로 “이번 주 무엇을 확인하고 실행할지”까지 이어지는 제품 흐름이 필요하다.

## 3. Why POS Alone Is Insufficient

POS는 `얼마나 팔렸는지`를 보여준다. 하지만 매출 변동 구간에 비가 왔는지, 주변 동종 점포가 늘었는지, 검색 관심도가 바뀌었는지, 공휴일 구조가 달랐는지는 POS 단독으로 알 수 없다.

이 프로젝트는 POS/upload 데이터와 공개/연동 맥락 데이터를 같은 operational flow에 올린다.

## 4. No Causal Overclaim

제품 표현은 원인 확정이 아니라 근거 기반 후보다.

- observed together
- candidate cause
- requires additional confirmation
- evidence-backed suggestion
- not proven causality

한국어 표현:

- 함께 관측되었습니다
- 가능성 높은 원인 후보
- 추가 확인이 필요합니다
- 인과가 확정된 것은 아닙니다
- 실행 효과를 단정하지 않습니다

## 5. Architecture

M6 runtime:

- API Gateway + Cognito
- Revenue API Lambda
- Lambda in VPC private subnet
- Aurora operational SaaS tables
- NAT Gateway public API egress
- Secrets Manager credential loading
- timeout-safe collector result
- `#revenue-cockpit` frontend

Aurora는 운영 정본이고, ClickHouse는 기준 문서상 분석/집계/CDC read-model layer다.

## 6. Live API Verification

이미 검증된 live 결과:

- Kakao/KMA/Seoul full live context collection: 5 completed, 0 skipped, 0 failed
- Naver Local smoke: HTTP 200, 5 items
- Naver DataLab smoke: HTTP 200, 2 result groups
- Korean holiday API HTTPS smoke: HTTP 200, resultCode 00, 2026-05 holiday rows 확인

따라서 Holiday는 blocked가 아니며 TCP 80 egress를 추가하지 않는다.

## 7. Limitations

- Toss Place는 foundation only다. 사업자 등록/공식 credential이 없어서 real live integration으로 주장하지 않는다.
- Delivery apps는 CSV/XLSX upload parser 우선이다. 직접 로그인 자동화와 raw ID/password 저장은 하지 않는다.
- Naver/Holiday live collector는 배포 환경 secret/IAM 상태에 따라 smoke 재검증이 필요하다.
- Platform-scale SQS/EventBridge orchestration은 이번 M6 범위가 아니다.

## 8. Next Platform-Scale Direction

다음 단계:

- public collector Lambda와 VPC writer 분리
- SQS/S3 buffering
- scheduled refresh
- multi-AZ NAT 검토
- ClickHouse read path 강화
- Toss/Delivery 공식 provider 계약 후 live connector 전환
- 운영 알림/재처리 runbook 강화

## 9. 30초 Pitch

“이 프로젝트는 소상공인 매출 변화에 대해 POS 데이터만 보여주는 것이 아니라, 매출 변동 구간에 함께 관측된 날씨, 상권, 주변 점포, 검색 관심도, 공휴일 신호를 모아 가능성 높은 원인 후보와 실행 액션 후보를 제시합니다. 인과를 단정하지 않고 추가 확인이 필요한 evidence-backed suggestion으로 보여주며, store onboarding부터 context bootstrap, action status/result tracking까지 Revenue Ops SaaS 흐름으로 구현했습니다.”
