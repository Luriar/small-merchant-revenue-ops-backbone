# M3 Revenue ETL 계획 (한국어)

> 문서 버전: v0.1 | 최종 수정: 2026-05-05 | 대상 마일스톤: M3

---

## 1. 프로젝트 정체성

### 1.1 AI Revenue Ops OS for Small Merchants

본 프로젝트는 **소상공인이 매출 변화의 원인 후보를 근거와 함께 이해하고, 바로 실행할 액션까지 결정할 수 있게 돕는 AI Revenue Ops OS**를 구축하는 것을 목표로 한다.

핵심 가치 명제:

- 소상공인은 매출이 떨어졌을 때 "왜 떨어졌는가"를 파악하기 어렵다.
- 공공데이터(서울 상권 추정매출, 생활인구, 기상, 공휴일, 지역행사 등)를 수집·가공하면, 매출 변화와 함께 관측된 외부 요인 후보를 근거와 함께 제시할 수 있다.
- 근거 기반의 액션 추천은 소상공인이 "지금 무엇을 해야 하는가"를 판단하는 데 도움이 된다.

### 1.2 이 시스템이 아닌 것

| 구분 | 설명 |
|------|------|
| 상권 분석 대시보드 | 단순 시각화 도구가 아니다. 판단 지원 시스템이다. |
| POS 대체 시스템 | 개별 매장 POS 데이터를 대체하지 않는다. 공공 추정치 기반이다. |
| 인과관계 증명 엔진 | 원인을 확정하지 않는다. 가능성 높은 원인 후보를 근거와 함께 제시한다. |
| 매출 보장 솔루션 | 특정 액션이 매출을 보장한다고 약속하지 않는다. |

---

## 2. 기존 Product Ops Backbone에서의 전환 이유

### 2.1 기존 도메인: Product Ops Backbone

이전 마일스톤(M1, M2)은 **고볼륨 제품 이벤트 스트림** 처리에 초점을 맞췄다.

- 처리 대상: release 이벤트, feature flag 변경, rule change → 이벤트 이상 탐지 → 지원 이슈 연결
- 핵심 인프라: Aurora PostgreSQL (운영 source of truth), MSK (Kafka), Debezium CDC, ClickHouse, EKS 컨슈머
- 아키텍처 특성: 실시간 스트리밍, 고처리량, 복잡한 CDC 파이프라인

### 2.2 전환 결정 이유

Revenue Ops 도메인은 Product Ops 도메인과 본질적으로 다른 데이터 특성을 가진다.

| 항목 | Product Ops (M1/M2) | Revenue Ops (M3) |
|------|----------------------|-------------------|
| 데이터 특성 | 실시간 이벤트 스트림 | 일별/주별 공공 배치 데이터 |
| 업데이트 주기 | 초/분 단위 | 일/주 단위 |
| 데이터 소스 | 내부 DB CDC | 외부 공공 API |
| 필요 인프라 | EKS, MSK, Debezium, ClickHouse | Lambda, Glue, S3, Step Functions |
| 비용 구조 | 상시 가동 클러스터 | 배치 실행 시에만 과금 |

공공데이터는 실시간 스트리밍이 필요하지 않다. 서울 상권 추정매출 데이터는 분기별로 갱신되고, 기상 데이터는 일별로 수집된다. 이러한 특성에 실시간 Kafka 스트리밍 인프라를 적용하는 것은 과도한 복잡성과 비용을 초래한다.

따라서 M3부터는:
- 스트리밍 인프라(EKS, MSK, Debezium, Strimzi, ClickHouse, Kinesis)를 **완전히 제거**한다.
- **Scheduled Batch ETL** + **Medallion 아키텍처** + **AWS Serverless** 조합으로 재설계한다.

### 2.3 보존된 철학

아키텍처는 바뀌었지만 운영 철학은 동일하게 유지된다.

```
Source Ingestion (Bronze)
    → Structuring (Silver)
    → Evidence / Trust (Gold + 운영 기록)
    → Selection (이상 탐지 + 근거 연결)
    → Action (액션 추천 + Revenue Brief)
    → Feedback (다음 기간 비교 + run_log 신뢰성)
    → Reliability (CloudWatch 알람 + 파이프라인 모니터링)
```

---

## 3. M3 범위 정의

### 3.1 전체 파이프라인 흐름

```
공공 API / CSV
    ↓ (Lambda 소규모 추출 또는 로컬 샘플)
Bronze (원천 보존)
    ↓ (Glue Python Shell 변환)
Silver (정규화된 신호 스키마)
    ↓ (Glue Python Shell 마트 빌드)
Gold (운영 판단 마트)
    ↓
이상 탐지 (revenue_drop, transaction_drop 등)
    ↓
근거 후보 연결 (demand / weather / competition / context)
    ↓
액션 추천 매핑 (promotion / menu_update / operational 등)
    ↓
Revenue Brief 생성 (소상공인 대상 요약 판단)
    ↓
run_log.jsonl (신뢰성 로그)
```

### 3.2 Bronze 레이어 범위

원천 데이터를 **변환 없이** 보존한다. 총 7개 소스:

| # | 소스 | 내용 |
|---|------|------|
| 1 | 서울 상권 추정매출 | 상권·업종별 추정 매출액 및 거래건수 |
| 2 | 서울 생활인구 | 시간대별 유동인구 추정치 |
| 3 | 서울 상권경계 | 상권 폴리곤 및 메타데이터 |
| 4 | 업종별 점포수 | 인허가 기반 점포 수 (경쟁 스냅샷) |
| 5 | 기상청 ASOS | 일별 기온, 강수량, 습도 등 |
| 6 | 공휴일 정보 | 법정 공휴일, 대체 공휴일 |
| 7 | 서울 문화행사 | 지역 행사·이벤트 목록 |

### 3.3 Silver 레이어 범위

정규화된 신호 스키마 6개:

| 스키마 | 설명 |
|--------|------|
| `revenue_signal` | 상권·업종별 추정 매출 신호 |
| `demand_signal` | 생활인구 기반 수요 신호 |
| `weather_signal` | 일별 기상 신호 |
| `competition_snapshot` | 경쟁 환경 스냅샷 |
| `holiday_context` | 공휴일 맥락 |
| `local_event_context` | 지역 행사 맥락 |

### 3.4 Gold 레이어 범위

운영 판단 마트 5개:

| 마트 | 설명 |
|------|------|
| `revenue_context_mart` | 매출 신호와 맥락 요인 결합 |
| `revenue_anomaly_results` | 이상 탐지 결과 |
| `cause_evidence_candidates` | 근거 후보 목록 |
| `action_recommendation_candidates` | 액션 추천 후보 |
| `revenue_brief_view` | Revenue Brief 요약 뷰 |

### 3.5 M3 샘플 시나리오

모든 M3 문서와 샘플 데이터는 아래 시나리오를 기준으로 한다.

- **지역**: 서울 / 성수 (Seongsu)
- **업종**: 카페/커피음료
- **기준 기간**: 2024 Q3
- **비교 기간**: 2024 Q4
- **관측 사실**:
  - 추정 매출 약 12% 감소
  - 거래건수 약 10% 감소
  - 생활인구 약 8% 감소
  - 강수일수 증가
  - 업종 내 점포수 증가 (경쟁 심화)
- **근거 후보**: demand + weather + competition
- **액션 추천**: 3개 이상 생성 기대

---

## 4. 데이터 소스 목록

### 4.1 서울 열린데이터광장 (Seoul Open API)

**URL**: `https://data.seoul.go.kr/`

| 데이터셋 | 활용 목적 | 갱신 주기 |
|----------|----------|----------|
| 서울시 상권분석 추정매출 | 매출 신호 (revenue_signal) | 분기별 |
| 생활인구 데이터 | 수요 신호 (demand_signal) | 월별 |
| 상권 경계 폴리곤 | 상권 매핑 메타데이터 | 비정기 |

API 접근 방식: 서울 열린데이터광장 API 키 발급 후 REST API 호출.

### 4.2 공공데이터포털 (data.go.kr)

**URL**: `https://www.data.go.kr/`

| 데이터셋 | 활용 목적 | 갱신 주기 |
|----------|----------|----------|
| 업종별 인허가 점포수 | 경쟁 스냅샷 (competition_snapshot) | 월별 |
| 법정 공휴일 정보 | 공휴일 맥락 (holiday_context) | 연간 |

API 접근 방식: data.go.kr API 키 발급 후 REST API 호출 또는 CSV 다운로드.

### 4.3 기상청 ASOS (KMA ASOS)

**URL**: `https://data.kma.go.kr/`

| 데이터셋 | 활용 목적 | 갱신 주기 |
|----------|----------|----------|
| 종관기상관측 일별 데이터 | 기상 신호 (weather_signal) | 일별 |

제공 항목: 일 최고기온, 일 최저기온, 일 평균기온, 일 강수량, 일 평균 습도, 일 평균 풍속.

### 4.4 서울 문화행사 데이터

**URL**: `https://data.seoul.go.kr/` (문화행사 API)

| 데이터셋 | 활용 목적 | 갱신 주기 |
|----------|----------|----------|
| 서울 문화행사 목록 | 지역 이벤트 맥락 (local_event_context) | 실시간 갱신 (배치 수집) |

---

## 5. M3 완료 기준

M3는 아래 기준을 모두 충족했을 때 완료로 간주한다.

### 5.1 파이프라인 실행 기준

- [ ] 로컬 환경에서 샘플 파이프라인이 오류 없이 완료 실행된다.
- [ ] Bronze 샘플 파일 7개 소스 모두 생성된다.
- [ ] Silver 데이터셋 6개 스키마 모두 생성된다.
- [ ] Gold 마트 5개 모두 생성된다.

### 5.2 분석 기준

- [ ] 매출 이상(revenue_drop, transaction_drop 등)이 탐지된다.
- [ ] 근거 후보(demand / weather / competition)가 생성된다.
- [ ] 액션 추천이 3개 이상 생성된다.
- [ ] Revenue Brief 출력이 생성된다.

### 5.3 신뢰성 기준

- [ ] `run_log.jsonl` 파일이 생성되어 파이프라인 실행 이력이 기록된다.
- [ ] `pytest` 테스트가 통과하거나 정확한 블로커가 문서화된다.

### 5.4 인프라 기준

- [ ] `infra/terraform/envs/revenue-dev/` 에 Serverless 스택 Terraform 스켈레톤이 존재한다.
- [ ] `terraform validate` 가 통과한다.
- [ ] (M3에서는 실제 AWS 배포는 선택 사항 — M4/v1에서 실행 예정)

---

## 6. 기술 스택 정의

### 6.1 M3에서 사용하는 기술

| 카테고리 | 기술 |
|----------|------|
| 언어 | Python 3.11 |
| 데이터 처리 | pandas, pyarrow |
| 저장소 | S3 (Bronze/Silver/Gold), 로컬 파일 시스템 |
| 스케줄러 | EventBridge Scheduler |
| 오케스트레이션 | Step Functions Standard |
| 소규모 추출 | Lambda |
| 변환/마트 빌드 | AWS Glue Python Shell |
| 메타데이터 | Glue Data Catalog |
| 쿼리 | Athena |
| 운영 기록 | Aurora PostgreSQL |
| 모니터링 | CloudWatch |
| 비밀 관리 | SSM Parameter Store, Secrets Manager |
| IaC | Terraform |

### 6.2 M3에서 사용하지 않는 기술 (명시적 제외)

| 제외 기술 | 이유 |
|-----------|------|
| EKS | 컨테이너 오케스트레이션 불필요 (배치 ETL) |
| MSK (Kafka) | 실시간 스트리밍 불필요 |
| Debezium / Strimzi | CDC 불필요 |
| ClickHouse | OLAP 열 지향 DB 불필요 |
| MWAA (Airflow) | Step Functions으로 대체 |
| Redshift | Athena로 대체 |
| EMR | Glue Python Shell로 대체 |
| Kinesis | 실시간 스트리밍 불필요 |
| Prometheus / Grafana | CloudWatch로 대체 |
| Argo CD / Rollouts | 배포 자동화 불필요 (배치 ETL) |

---

## 7. 주의사항 및 데이터 한계

### 7.1 공공데이터 기반 추정치임을 명시

모든 Revenue Ops OS 출력물에는 아래 사실을 명확히 고지해야 한다.

- 본 시스템이 제공하는 매출 수치는 **공공데이터 기반 추정치**이며, 개별 매장의 실제 매출과 다를 수 있다.
- 분석 단위는 **상권/업종 수준**이다. 개별 매장 수준의 분석이 아니다.
- 개별 POS 데이터가 없으므로 매장별 정밀 분석은 M3 MVP 범위 외이다.

### 7.2 인과관계 확정 불가

이 시스템은 **원인 후보를 근거와 함께 제시**하는 시스템이지, 원인을 확정하는 시스템이 아니다.

**사용해야 할 표현**:
- "가능성 높은 원인 후보입니다"
- "함께 관측되었습니다"
- "영향을 주었을 가능성이 있습니다"
- "추가 확인이 필요합니다"

**사용하지 말아야 할 표현**:
- "원인으로 확정됩니다"
- "반드시 매출이 오릅니다"
- "이 액션을 하면 매출이 보장됩니다"

### 7.3 v1 확장 예고

M3 MVP 이후 v1에서는 아래 데이터 소스 추가를 검토한다.

- 개별 매장 POS 연동
- 배달앱 주문 데이터 (배달의민족, 쿠팡이츠)
- 네이버 SmartPlace 리뷰 데이터
- 소셜 미디어 트렌드 데이터

---

## 8. 디렉토리 구조 (참고)

```
/home/lunar/projects/small-merchant-revenue-ops-backbone/
├── data/
│   ├── samples/
│   │   └── revenue_ops_demo/        # 성수 카페 샘플 데이터
│   ├── bronze/                      # 로컬 Bronze 레이어
│   ├── silver/                      # 로컬 Silver 레이어
│   ├── gold/                        # 로컬 Gold 레이어
│   └── runs/
│       └── run_log.jsonl            # 파이프라인 실행 이력
├── pipelines/
│   ├── extract/                     # 데이터 추출 모듈
│   ├── transform/                   # Silver 변환 모듈
│   ├── marts/                       # Gold 마트 빌드 모듈
│   ├── analyze/                     # 이상 탐지 + 근거 연결
│   └── orchestration/               # 파이프라인 오케스트레이션
├── infra/
│   └── terraform/
│       ├── bootstrap/               # 백엔드 초기화
│       ├── envs/
│       │   └── revenue-dev/         # 개발 환경 Terraform
│       └── modules/
│           └── revenue_*/           # Revenue Ops 모듈
├── docs/                            # M3 계획 및 아키텍처 문서
│   └── reference/
│       └── legacy_product_ops/      # 구 Product Ops 문서 아카이브
└── tests/                           # pytest 테스트
```

---

## 9. 관련 문서

| 문서 | 경로 |
|------|------|
| 공공데이터 소스 목록 | `docs/m3_public_data_sources_kr.md` |
| Medallion 아키텍처 | `docs/m3_medallion_architecture_kr.md` |
| AWS Serverless ETL 설계 | `docs/m3_aws_serverless_etl_design_kr.md` |
| Terraform 설계 | `docs/m3_terraform_design_kr.md` |
| 로컬 실행 런북 | `docs/m3_local_runbook_kr.md` |
| AWS 배포 런북 | `docs/m3_aws_deployment_runbook_kr.md` |
| 도메인 마이그레이션 요약 | `docs/m3_domain_migration_summary_kr.md` |
| M3 완료 체크리스트 | `docs/m3_completion_checklist_kr.md` |
| Revenue Ops 택소노미 | `docs/m3_revenue_ops_taxonomy_kr.md` |
