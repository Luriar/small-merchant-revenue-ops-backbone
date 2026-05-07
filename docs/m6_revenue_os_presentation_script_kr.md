# Revenue OS M6 Presentation Script

## 1. Title / Value Proposition
Revenue OS는 소상공인을 위한 Revenue Ops SaaS입니다. POS 결과를 외부 맥락과 연결하고, 근거 기반 원인 후보와 실행 액션으로 이어줍니다.

## 2. Problem
소상공인은 매출 하락을 매일 확인하지만 왜 그런지, 무엇을 해볼지 판단하기 어렵습니다. POS는 결과를 보여주지만 날씨, 상권, 검색 관심도, 주변 경쟁, 공휴일 맥락을 함께 설명하지 못합니다.

## 3. Why POS Alone Is Insufficient
POS data alone shows what happened. It does not explain what was observed together. Revenue OS는 외부 맥락을 구조화해 "가능성 높은 원인 후보"를 만듭니다.

## 4. Product Concept
흐름은 store registration, context bootstrap, revenue upload, evidence observations, candidate causes, action planner, action status/result tracking입니다.

## 5. User Journey
사용자는 매장을 등록하고 주소 검색으로 위치를 선택합니다. live collectors가 실행되고, 사용자는 CSV 또는 직접 입력으로 매출 데이터를 등록합니다. 이후 브리프와 액션이 갱신됩니다.

## 6. Live Context Collectors
현재 Kakao, KMA, Seoul benchmark/traffic/density, Naver local/trend, holiday collector가 live로 동작합니다. Toss/Delivery는 credential이 없으면 실패가 아니라 연동 대기입니다.

## 7. Technical Architecture
CloudFront/S3, Cognito, API Gateway, Lambda, Aurora, VPC/NAT, Secrets Manager, CloudWatch로 구성했습니다. ALB는 필요하지 않습니다.

## 8. ERD / Data Model
tenants, stores, memberships, revenue uploads/facts, context observations, collector runs, cause candidates, evidence, actions, jobs/outbox가 핵심입니다.

## 9. Revenue Upload + Action Planner
POS CSV와 배달 주문/정산 CSV foundation을 지원합니다. 업로드가 성공하면 원인 후보와 실행 액션이 갱신됩니다.

## 10. Demo Stores
6개 매장에 대해 10주 합성 daily revenue를 만들었습니다. 실제 merchant data가 아니며 Demo/예시 데이터로 라벨링합니다.

## 11. Live Validation
deployed runtime에서 live context bootstrap이 completed 8, skipped 2, failed 0, timed_out 0으로 검증되었습니다.

## 12. CI/CD + Rollback + Canary
CI는 backend/frontend/Terraform 검증을 수행합니다. Frontend rollback은 S3 release prefix 방식입니다. Backend는 Lambda alias와 CodeDeploy canary가 Terraform plan-ready입니다.

## 13. Current Runtime vs Platform Evolution
M6는 paid SaaS 검증을 위한 serverless runtime입니다. MSK/EKS/Airflow/ClickHouse는 규모와 비동기 처리 요구가 명확해지는 시점에 도입합니다.

## 14. Limitations / Roadmap
자동 인과 확정은 하지 않습니다. Toss/Delivery는 partner credential 필요합니다. Terraform apply 전 automatic rollback은 active가 아닙니다.

## 15. Closing
Revenue OS의 핵심은 raw dashboard가 아니라 신뢰 가능한 evidence flow와 실행 가능성입니다. AI 시대에 필요한 것은 구조화되고 추적 가능한 operational knowledge입니다.
