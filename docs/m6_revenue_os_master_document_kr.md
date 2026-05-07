# Revenue OS M6 Master Document

## 1. 서비스 기획 서사
Revenue OS는 소상공인이 "매출이 줄었다"에서 멈추지 않고 "어떤 외부 맥락과 함께 관측됐고, 어떤 액션을 작게 실행해볼 수 있는가"까지 이동하게 하는 Revenue Ops SaaS다. POS 데이터는 무엇이 일어났는지는 보여주지만, 비/공휴일/상권/검색 관심/주변 점포 같은 외부 맥락 없이는 왜 그랬을지 판단하기 어렵다. Revenue OS는 매출 결과, 외부 맥락, 근거 관측, 원인 후보, 실행 액션, 결과 추적을 한 흐름으로 묶는다.

## 2. 철학적 세계관
이 서비스는 단순 dashboard가 아니다. 인과를 확정하지 않고, 구조화되고 추적 가능한 evidence flow를 만든다. 핵심 문구는 "함께 관측되었습니다", "가능성 높은 원인 후보", "추가 확인이 필요합니다", "인과가 확정된 것은 아닙니다"다. AI 시대에는 모델의 답변보다 신뢰 가능한 지식 흐름이 중요하다. Revenue OS는 AI-assisted operational reasoning을 위한 초기 knowledge operations layer다.

## 3. 제품 정의
대상 사용자는 POS/배달/광고 데이터를 모두 직접 해석하기 어려운 소상공인 또는 소형 프랜차이즈 운영자다.

As-is:
- POS는 결과만 보여준다.
- 외부 맥락은 흩어져 있다.
- 액션은 감으로 정한다.

To-be:
- 매장 등록 후 외부 맥락을 자동 bootstrap한다.
- 매출 데이터를 업로드한다.
- evidence observations와 candidate causes가 생성된다.
- action planner에서 실행 후보를 고른다.
- action status/result를 추적한다.

M6 scope:
- Cognito login, store registration, live context collection, revenue upload/manual input, cause/action loop, action status, CloudWatch/CodeDeploy readiness.

## 4. 기술 아키텍처
Frontend는 S3 + CloudFront에 배포된다. Auth는 Cognito Hosted UI/JWT다. Backend는 API Gateway HTTP API + Lambda nodejs20.x다. 운영 정본은 Aurora PostgreSQL이다. Lambda는 VPC/NAT를 통해 Kakao/KMA/Seoul/Naver/Holiday public context API에 접근한다. Secrets Manager는 외부 API credential과 Aurora secret을 보관한다.

ALB가 필요 없는 이유는 API Gateway가 Lambda invoke path를 제공하기 때문이다. Grafana가 아직 필수가 아닌 이유는 현재 runtime metric이 CloudWatch native alarm으로 충분하기 때문이다. 플랫폼 규모가 커지면 MSK/EKS/Airflow/ClickHouse/Grafana가 단계적으로 들어간다.

## 5. 데이터 모델 / ERD 요약
핵심 엔티티:
- `tenants`: merchant tenant boundary.
- `stores`: 매장, 주소, 업종, metadata.
- `tenant_members`, `store_members`: 사용자 권한.
- `revenue_uploads`: 업로드 단위.
- `revenue_daily_facts`, `revenue_item_facts`: 정규화된 매출 fact.
- `context_sources`, `context_observations`: 외부 맥락 source와 관측치.
- `nearby_store_snapshots`, `public_revenue_benchmarks`, `commercial_area_mappings`: 상권/주변 맥락.
- `collector_runs`: 맥락 수집 실행 상태.
- `platform_event_outbox`, `job_runs`, `mart_build_runs`: 비동기/운영 골격.
- `cause_candidates`, `cause_candidate_evidence`: 원인 후보와 근거.
- `action_planner_items`, `action_outcome_snapshots`: 실행 계획과 결과 관측.

설계 이유:
- Aurora는 운영 정본이다.
- evidence류 데이터는 append-only 성격을 유지한다.
- raw PII/payload를 UI/log에 노출하지 않는다.
- demo data는 `metadata.is_demo=true`로 명확히 표시한다.

## 6. Collector / Operational Flow
1. Store onboarding: 주소/업종이 있으면 `store_onboarding_bootstrap` 권장.
2. Context collect: Kakao geocoding, KMA weather, Seoul benchmark/traffic/density, Naver local/trend, Korean holiday.
3. Connector foundation: Toss Place, delivery provider는 credential 없으면 `연동 대기`.
4. Revenue upload: manual daily input 또는 POS/delivery CSV.
5. Cause/action generation: 매출 fact와 context observations를 함께 보고 후보 생성.
6. Pipeline meta: collector counts, durations, persisted counts, latest upload/context.
7. Action tracking: status를 selected/planned/done/dismissed로 관리하고 결과 추적 대기 상태를 남긴다.

## 7. Technology Stack Rationale
- CloudFront/S3: 정적 frontend 배포와 release-prefix rollback에 적합.
- Cognito: 초기 SaaS 인증을 빠르게 제공.
- API Gateway: Lambda와 직접 통합되고 JWT authorizer를 제공.
- Lambda: 소형 SaaS runtime에 비용/운영 부담이 낮음.
- Aurora PostgreSQL: 운영 정본, 관계/트랜잭션/권한 분리에 적합.
- NAT Gateway: VPC Lambda의 외부 API egress.
- Secrets Manager: API keys와 DB secret을 코드 밖에서 관리.
- Kakao Local API: 주소를 좌표/행정구역으로 정규화.
- KMA/data.go.kr: 날씨 맥락.
- Seoul Open Data: 상권 benchmark/유동인구/점포 밀도.
- Naver Local/DataLab: 주변 점포/검색 관심도.
- Korean holiday API: 공휴일/특일.
- Toss/Delivery foundation: credential 전까지 연동 대기 상태로 표현.
- Terraform: runtime infra 재현성.
- GitHub Actions: CI와 manual release.
- CloudWatch: M6 관측/rollback alarm.
- CodeDeploy/Lambda alias: 백엔드 canary traffic shift.
- EKS/ClickHouse/MSK/Airflow deferred: 현재 검증 범위보다 운영 표면이 큼.

## 8. Deployment / Operations
CI는 backend tests, frontend build, Terraform fmt/validate를 수행한다. Frontend rollback은 S3 release prefix를 root로 sync하는 방식이다. Backend rollback은 Lambda alias를 이전 version으로 되돌리거나 CodeDeploy alarm rollback을 사용한다. Terraform apply 전에는 canary 리소스가 plan-ready일 뿐 active가 아니다.

## 9. Live Validation Results
이미 검증된 deployed runtime 결과:
- store onboarding POST 성공.
- `context_bootstrap_hint.recommended=true`.
- mode `live`, reason `store_onboarding_bootstrap`.
- active live collectors completed 8.
- Toss/Delivery foundation skipped 2, secret not configured.
- failed 0, timed_out 0.
- pipeline meta persisted: completed 8, skipped 2, failed 0, timed_out 0, duration 약 1570ms.
- context observations 10, nearby snapshots 2, benchmark 1, store location updated true.

## 10. Demo Data
M6는 6개 합성 demo store를 제공한다:
- 성수 카페 / 디저트
- 강남 점심 샐러드/도시락
- 연남/홍대 디저트 카페
- 여의도 직장인 카페
- 잠실 치킨/배달 매장
- 신촌 분식/간편식

각 매장은 10주 daily revenue rows를 가진다. 데이터는 plausible synthetic이며 실제 merchant data가 아니다. live external APIs와 synthetic revenue를 혼동하지 않도록 `예시 데이터`/`Demo`로 표시한다.

## 11. Limitations / Next Steps
- Toss/Delivery는 credential 전까지 foundation-only.
- Terraform apply 전 자동 rollback은 active가 아니다.
- Real partner integrations require contracts/credentials.
- Long-running collectors should move to EventBridge/SQS/worker Lambda.
- Platform-scale read model은 ClickHouse/CDC가 필요해지는 시점에 도입한다.

## 산출물 분류
- 구현 및 로컬 검증 대상: UX, address search, revenue upload UI, no-revenue empty state, demo dataset, scripts, CI.
- Terraform plan-ready: Lambda alias, API Gateway alias integration, CodeDeploy, alarms.
- Apply 필요: 실제 alias/canary/automatic rollback activation.
- Deferred: MSK/EKS/Airflow/ClickHouse active runtime.
