# M3 Medallion 아키텍처 (한국어)

> 문서 버전: v0.1 | 최종 수정: 2026-05-05 | 대상 마일스톤: M3

---

## 1. Medallion 아키텍처 개요

M3 Revenue Ops 파이프라인은 **Medallion 아키텍처** 패턴을 채택한다. Medallion 아키텍처는 데이터를 3개의 품질 계층(Bronze, Silver, Gold)으로 분리하여 관리하는 데이터 레이크 설계 패턴이다.

### 1.1 계층 구조

```
                    [공공 API / CSV 원천]
                            │
                            ▼
    ┌───────────────────────────────────────────┐
    │                BRONZE 레이어               │
    │  원천 데이터 그대로 보존 (변환 없음)          │
    │  7개 소스: 추정매출, 생활인구, 상권경계,      │
    │          점포수, 기상, 공휴일, 지역행사       │
    └───────────────────────────────────────────┘
                            │
                   Glue Python Shell 변환
                            │
                            ▼
    ┌───────────────────────────────────────────┐
    │                SILVER 레이어               │
    │  정규화된 신호 스키마 (6개)                  │
    │  revenue_signal, demand_signal,           │
    │  weather_signal, competition_snapshot,    │
    │  holiday_context, local_event_context     │
    └───────────────────────────────────────────┘
                            │
                   Glue Python Shell 마트 빌드
                            │
                            ▼
    ┌───────────────────────────────────────────┐
    │                 GOLD 레이어                │
    │  운영 판단 마트 (5개)                        │
    │  revenue_context_mart                     │
    │  revenue_anomaly_results                  │
    │  cause_evidence_candidates                │
    │  action_recommendation_candidates         │
    │  revenue_brief_view                       │
    └───────────────────────────────────────────┘
                            │
                    Revenue Brief 출력
                    run_log.jsonl 기록
```

### 1.2 각 레이어의 목적

| 레이어 | 목적 | 변환 여부 | 책임 |
|--------|------|----------|------|
| Bronze | 원천 보존 | 없음 | 원천 데이터 무결성 보장 |
| Silver | 정규화 | 있음 | 신호 스키마 정합성 보장 |
| Gold | 판단 마트 | 있음 | 운영 판단 로직 구현 |

---

## 2. Bronze 레이어

### 2.1 설계 원칙

Bronze 레이어는 **원천 데이터를 변환 없이 그대로 보존**한다. 이 계층의 핵심 원칙은:

- 원천 API 응답 또는 CSV를 최대한 원본 형태로 저장한다.
- 스키마 변환, 필드명 변경, 데이터 타입 캐스팅을 하지 않는다.
- 수집 타임스탬프(`ingested_at`)와 소스 메타데이터를 추가한다.
- 파일 형식: **Parquet** (압축: Snappy)
- 파티션: 연도/분기 또는 연도/월 기준

이 원칙 덕분에 Silver/Gold 변환 로직에 오류가 있어도 Bronze를 기반으로 재처리가 가능하다.

### 2.2 폴더 구조

```
bronze/
├── seoul_sales/
│   ├── year=2024/
│   │   ├── quarter=3/
│   │   │   └── seoul_sales_2024_Q3.parquet
│   │   └── quarter=4/
│   │       └── seoul_sales_2024_Q4.parquet
│   └── year=2023/
│       └── ...
├── seoul_population/
│   ├── year=2024/
│   │   ├── month=7/
│   │   │   └── seoul_population_202407.parquet
│   │   ├── month=8/
│   │   ├── month=9/
│   │   ├── month=10/
│   │   ├── month=11/
│   │   └── month=12/
│   └── ...
├── seoul_trade_area/
│   └── seoul_trade_area_boundary.parquet
├── store_count/
│   ├── year=2024/
│   │   ├── month=7/
│   │   │   └── store_count_202407.parquet
│   │   └── ...
│   └── ...
├── weather/
│   ├── year=2024/
│   │   └── weather_2024.parquet
│   └── ...
├── holidays/
│   ├── year=2024/
│   │   └── holidays_2024.parquet
│   └── ...
└── local_events/
    ├── year=2024/
    │   ├── quarter=3/
    │   │   └── local_events_2024_Q3.parquet
    │   └── quarter=4/
    │       └── local_events_2024_Q4.parquet
    └── ...
```

### 2.3 Bronze 소스별 상세

| 소스 | Bronze 경로 | 원천 형식 | 파티션 기준 |
|------|------------|----------|------------|
| 서울 추정매출 | `bronze/seoul_sales/` | API JSON → Parquet | year/quarter |
| 서울 생활인구 | `bronze/seoul_population/` | API JSON → Parquet | year/month |
| 서울 상권경계 | `bronze/seoul_trade_area/` | GeoJSON → Parquet | 없음 (전체) |
| 업종별 점포수 | `bronze/store_count/` | API JSON / CSV → Parquet | year/month |
| 기상 ASOS | `bronze/weather/` | API JSON → Parquet | year |
| 공휴일 정보 | `bronze/holidays/` | API JSON → Parquet | year |
| 서울 문화행사 | `bronze/local_events/` | API JSON → Parquet | year/quarter |

### 2.4 Bronze 검증 (ValidateBronze 단계)

Bronze 파일 생성 후 아래 항목을 검증한다:

```python
# Bronze 검증 체크리스트
checks = [
    "파일 존재 여부 확인",
    "파일 크기 > 0 바이트",
    "Parquet 파일 읽기 가능 여부",
    "필수 컬럼 존재 여부 (ingested_at, data_source)",
    "행 수 > 0",
    "null 비율 임계값 이내 (핵심 컬럼 기준)",
]
```

---

## 3. Silver 레이어

### 3.1 설계 원칙

Silver 레이어는 **정규화된 신호 스키마** 형태로 데이터를 변환한다. 이 계층의 핵심 원칙은:

- 모든 소스 데이터를 일관된 스키마로 변환한다.
- 데이터 타입을 명시적으로 캐스팅한다.
- 조인 키(상권 코드, 날짜, 분기)를 정규화한다.
- 불필요한 필드를 제거하고 핵심 신호 필드만 유지한다.
- 파일 형식: **Parquet** (압축: Snappy)

### 3.2 폴더 구조

```
silver/
├── revenue_signal/
│   ├── year=2024/
│   │   ├── quarter=3/
│   │   │   └── revenue_signal_2024_Q3.parquet
│   │   └── quarter=4/
│   │       └── revenue_signal_2024_Q4.parquet
│   └── ...
├── demand_signal/
│   ├── year=2024/
│   │   ├── quarter=3/
│   │   └── quarter=4/
│   └── ...
├── weather_signal/
│   ├── year=2024/
│   │   ├── quarter=3/
│   │   └── quarter=4/
│   └── ...
├── competition_snapshot/
│   ├── year=2024/
│   │   ├── quarter=3/
│   │   └── quarter=4/
│   └── ...
├── holiday_context/
│   └── year=2024/
│       └── holidays_silver_2024.parquet
└── local_event_context/
    ├── year=2024/
    │   ├── quarter=3/
    │   └── quarter=4/
    └── ...
```

### 3.3 Silver 스키마 상세

#### revenue_signal (추정매출 신호)

```
trade_area_code         : string    NOT NULL  # 상권 코드
trade_area_name         : string              # 상권명
category_code           : string    NOT NULL  # 업종 코드
category_name           : string              # 업종명
year                    : int       NOT NULL  # 연도
quarter                 : int       NOT NULL  # 분기 (1~4)
period_start_date       : date                # 분기 시작일
period_end_date         : date                # 분기 종료일
estimated_revenue_krw   : bigint    NOT NULL  # 추정 매출액 (원)
transaction_count       : bigint    NOT NULL  # 거래건수
data_source             : string    NOT NULL  # "seoul_open_api"
ingested_at             : timestamp NOT NULL  # 수집 시각
```

#### demand_signal (수요 신호)

```
trade_area_code         : string    NOT NULL  # 상권 코드
reference_date          : date      NOT NULL  # 기준일
hour_band               : int                 # 시간대 (0~23, NULL=일 합계)
total_population        : bigint    NOT NULL  # 총 생활인구수
male_population         : bigint              # 남성 생활인구수
female_population       : bigint              # 여성 생활인구수
age_10s                 : bigint              # 10대
age_20s                 : bigint              # 20대
age_30s                 : bigint              # 30대
age_40s                 : bigint              # 40대
age_50s                 : bigint              # 50대
age_60s_plus            : bigint              # 60대 이상
quarter                 : int       NOT NULL  # 분기 (파티션용)
data_source             : string    NOT NULL  # "seoul_population_api"
ingested_at             : timestamp NOT NULL
```

#### weather_signal (기상 신호)

```
station_id              : string    NOT NULL  # 관측소 코드 (108: 서울)
station_name            : string              # 관측소명
reference_date          : date      NOT NULL  # 관측일
avg_temp_celsius        : float               # 일 평균기온 (°C)
max_temp_celsius        : float               # 일 최고기온 (°C)
min_temp_celsius        : float               # 일 최저기온 (°C)
precipitation_mm        : float               # 일 강수량 (mm)
avg_humidity_pct        : float               # 일 평균 상대습도 (%)
avg_wind_speed_ms       : float               # 일 평균 풍속 (m/s)
is_rainy_day            : boolean             # 강수량 > 0mm 여부
quarter                 : int       NOT NULL  # 분기 (파티션용)
data_source             : string    NOT NULL  # "kma_asos"
ingested_at             : timestamp NOT NULL
```

#### competition_snapshot (경쟁 환경 스냅샷)

```
trade_area_code         : string    NOT NULL  # 상권 코드
category_code           : string    NOT NULL  # 업종 코드
category_name           : string              # 업종명
year                    : int       NOT NULL  # 연도
quarter                 : int       NOT NULL  # 분기
active_store_count      : int       NOT NULL  # 영업 중인 점포 수
data_source             : string    NOT NULL  # "data_go_kr_store"
ingested_at             : timestamp NOT NULL
```

#### holiday_context (공휴일 맥락)

```
reference_date          : date      NOT NULL  # 날짜
holiday_name            : string              # 공휴일명
holiday_type            : string              # "legal" / "substitute"
is_holiday              : boolean   NOT NULL  # 공휴일 여부
year                    : int       NOT NULL  # 연도
quarter                 : int       NOT NULL  # 분기
data_source             : string    NOT NULL  # "data_go_kr_holiday"
ingested_at             : timestamp NOT NULL
```

#### local_event_context (지역 행사 맥락)

```
event_id                : string    NOT NULL  # 행사 고유 ID
event_name              : string    NOT NULL  # 행사명
event_category          : string              # 분류 (공연/전시/축제)
venue_name              : string              # 장소명
district                : string              # 자치구
dong                    : string              # 행정동
trade_area_code         : string              # 연관 상권 코드 (NULL 허용)
event_start_date        : date      NOT NULL  # 행사 시작일
event_end_date          : date      NOT NULL  # 행사 종료일
year                    : int       NOT NULL  # 연도
quarter                 : int       NOT NULL  # 분기 (시작일 기준)
data_source             : string    NOT NULL  # "seoul_cultural_events"
ingested_at             : timestamp NOT NULL
```

---

## 4. Gold 레이어

### 4.1 설계 원칙

Gold 레이어는 **운영 판단을 위한 마트**이다. 이 계층의 핵심 원칙은:

- Silver 레이어 데이터를 결합하여 비교 기간 vs 기준 기간 분석을 수행한다.
- 이상 탐지, 근거 후보 연결, 액션 추천, Revenue Brief 생성이 이 계층에서 이루어진다.
- 파일 형식: **Parquet** (로컬 실행) 또는 **Athena 테이블** (AWS 실행)
- 마트별로 단일 파일 또는 파티션된 파일로 저장한다.

### 4.2 폴더 구조

```
gold/
├── revenue_context_mart/
│   └── run_id=RUN-2024-Q4-001/
│       └── revenue_context_mart.parquet
├── revenue_anomaly_results/
│   └── run_id=RUN-2024-Q4-001/
│       └── revenue_anomaly_results.parquet
├── cause_evidence_candidates/
│   └── run_id=RUN-2024-Q4-001/
│       └── cause_evidence_candidates.parquet
├── action_recommendation_candidates/
│   └── run_id=RUN-2024-Q4-001/
│       └── action_recommendation_candidates.parquet
└── revenue_brief_view/
    └── run_id=RUN-2024-Q4-001/
        └── revenue_brief_view.parquet
```

### 4.3 Gold 마트 상세

#### revenue_context_mart (매출 맥락 마트)

Silver 레이어의 모든 신호를 결합하여 상권/업종/기간별 맥락 지표를 계산한다.

```
run_id                  : string    NOT NULL  # 실행 ID
trade_area_code         : string    NOT NULL
trade_area_name         : string
category_code           : string    NOT NULL
category_name           : string
compare_year            : int       NOT NULL  # 비교 연도
compare_quarter         : int       NOT NULL  # 비교 분기
baseline_year           : int       NOT NULL  # 기준 연도
baseline_quarter        : int       NOT NULL  # 기준 분기
# 매출 지표
revenue_compare         : bigint              # 비교 기간 추정매출
revenue_baseline        : bigint              # 기준 기간 추정매출
revenue_change_rate     : float               # 매출 변화율
txn_compare             : bigint              # 비교 기간 거래건수
txn_baseline            : bigint              # 기준 기간 거래건수
txn_change_rate         : float               # 거래건수 변화율
# 수요 지표
population_compare      : bigint              # 비교 기간 생활인구 합계
population_baseline     : bigint              # 기준 기간 생활인구 합계
population_change_rate  : float               # 인구 변화율
# 기상 지표
rainy_days_compare      : int                 # 비교 기간 강수일수
rainy_days_baseline     : int                 # 기준 기간 강수일수
rainy_day_change_count  : int                 # 강수일수 변화
avg_temp_compare        : float               # 비교 기간 평균기온
avg_temp_baseline       : float               # 기준 기간 평균기온
# 경쟁 지표
store_count_compare     : int                 # 비교 기간 점포수
store_count_baseline    : int                 # 기준 기간 점포수
store_count_change_rate : float               # 점포수 변화율
# 공휴일/행사 지표
holiday_count_compare   : int                 # 비교 기간 공휴일 수
holiday_count_baseline  : int                 # 기준 기간 공휴일 수
local_event_count_compare: int                # 비교 기간 지역행사 수
created_at              : timestamp NOT NULL
```

#### revenue_anomaly_results (이상 탐지 결과)

```
run_id                  : string    NOT NULL
trade_area_code         : string    NOT NULL
category_code           : string    NOT NULL
compare_year            : int       NOT NULL
compare_quarter         : int       NOT NULL
anomaly_type            : string    NOT NULL  # revenue_drop / transaction_drop / severe_revenue_drop / weak_growth_warning
revenue_change_rate     : float
txn_change_rate         : float
anomaly_severity        : string              # high / medium / low
is_anomaly              : boolean   NOT NULL
anomaly_description     : string              # 사람이 읽을 수 있는 설명
created_at              : timestamp NOT NULL
```

#### cause_evidence_candidates (근거 후보)

```
run_id                  : string    NOT NULL
trade_area_code         : string    NOT NULL
category_code           : string    NOT NULL
compare_year            : int       NOT NULL
compare_quarter         : int       NOT NULL
anomaly_type            : string    NOT NULL  # 연관된 이상 유형
evidence_type           : string    NOT NULL  # demand / weather / competition / context / benchmark_or_conversion
evidence_metric         : string              # 근거 지표명 (예: population_change_rate)
evidence_value          : float               # 근거 지표값
evidence_direction      : string              # "negative" / "positive" / "neutral"
confidence_level        : string    NOT NULL  # strong / medium / weak
evidence_description    : string              # 사람이 읽을 수 있는 근거 설명
created_at              : timestamp NOT NULL
```

#### action_recommendation_candidates (액션 추천 후보)

```
run_id                  : string    NOT NULL
trade_area_code         : string    NOT NULL
category_code           : string    NOT NULL
compare_year            : int       NOT NULL
compare_quarter         : int       NOT NULL
action_id               : string    NOT NULL  # 고유 액션 ID
action_type             : string    NOT NULL  # promotion / menu_update / operational / channel / customer_retention / cost_management / communication
action_title            : string    NOT NULL  # 액션 제목
action_description      : string    NOT NULL  # 액션 상세 설명 (소상공인 언어)
evidence_types          : string              # 연관된 근거 유형 목록 (콤마 구분)
priority                : int                 # 추천 우선순위 (1=최고)
created_at              : timestamp NOT NULL
```

#### revenue_brief_view (Revenue Brief 요약 뷰)

```
run_id                  : string    NOT NULL
trade_area_code         : string    NOT NULL
trade_area_name         : string
category_code           : string    NOT NULL
category_name           : string
compare_period          : string    NOT NULL  # 예: "2024-Q4"
baseline_period         : string    NOT NULL  # 예: "2024-Q3"
brief_headline          : string    NOT NULL  # 한 줄 요약
revenue_summary         : string    NOT NULL  # 매출 변화 요약 (소상공인 언어)
anomaly_summary         : string              # 이상 요약
top_evidence_summary    : string              # 주요 근거 후보 요약
top_actions_summary     : string              # 주요 액션 추천 요약
data_quality_note       : string              # 데이터 한계 고지
generated_at            : timestamp NOT NULL
```

---

## 5. 기존 철학과의 연결

Medallion 아키텍처는 기존 Product Ops Backbone에서 사용한 운영 철학을 계승한다.

| 기존 철학 단계 | Product Ops 구현 | Revenue Ops 구현 |
|--------------|-----------------|-----------------|
| Source Ingestion | Aurora CDC → Kafka | 공공 API → Bronze |
| Structuring | ClickHouse 인입 | Bronze → Silver |
| Evidence / Trust | DLQ 처리 + 운영 로그 | Silver → Gold 마트 |
| Selection | 이벤트 이상 탐지 | 매출 이상 탐지 |
| Action | 지원 이슈 연결 | 액션 추천 + Revenue Brief |
| Feedback | DLQ 재처리 | 다음 기간 비교 + run_log |
| Reliability | Prometheus/Grafana | CloudWatch + run_log.jsonl |

---

## 6. 로컬 실행 vs AWS 실행

### 6.1 로컬 실행 (M3 MVP)

| 구분 | 구현 |
|------|------|
| 데이터 소스 | `data/samples/revenue_ops_demo/` 샘플 파일 |
| Bronze 저장 | `data/bronze/` 로컬 디렉토리 |
| Silver 저장 | `data/silver/` 로컬 디렉토리 |
| Gold 저장 | `data/gold/` 로컬 디렉토리 |
| 처리 도구 | Python 3.11 + pandas + pyarrow |
| 오케스트레이션 | `pipelines/orchestration/run_local_medallion_pipeline.py` |
| 실행 이력 | `data/runs/run_log.jsonl` |

### 6.2 AWS 실행 (v1 배포)

| 구분 | 구현 |
|------|------|
| 데이터 소스 | 실제 공공 API (Lambda 추출) |
| Bronze 저장 | S3 버킷 `s3://revenue-ops-{env}-datalake/bronze/` |
| Silver 저장 | S3 버킷 `s3://revenue-ops-{env}-datalake/silver/` |
| Gold 저장 | S3 버킷 `s3://revenue-ops-{env}-datalake/gold/` |
| 처리 도구 | AWS Glue Python Shell |
| 오케스트레이션 | Step Functions Standard |
| 스케줄 | EventBridge Scheduler (주간 또는 분기별) |
| 쿼리 | Athena (Glue Data Catalog) |
| 실행 이력 | Aurora PostgreSQL + run_log.jsonl |

---

## 7. 파이프라인 단계별 흐름도

### 7.1 Step Functions 파이프라인 흐름

```
CreateRun
    │
    ▼
ExtractSources ──────────────────────────────────────────┐
    │  (Lambda / Glue: 7개 소스 동시 추출 또는 순차 추출)    │
    ▼                                                     │
ValidateBronze ←─────────────────────────────────────────┘
    │  (Bronze 파일 존재/크기/행수 검증)
    │
    ├── [실패] → FailRun (오류 기록)
    │
    ▼
BronzeToSilver
    │  (Glue Python Shell: 7개 소스 → 6개 Silver 스키마 변환)
    ▼
SilverToGold
    │  (Glue Python Shell: Silver → revenue_context_mart)
    ▼
DetectAnomalies
    │  (Glue Python Shell: 이상 탐지 → revenue_anomaly_results)
    ▼
LinkEvidence
    │  (Glue Python Shell: 근거 후보 연결 → cause_evidence_candidates)
    ▼
MapActions
    │  (Glue Python Shell: 액션 추천 → action_recommendation_candidates)
    ▼
PublishRevenueBrief
    │  (Glue Python Shell: Revenue Brief → revenue_brief_view)
    ▼
CompleteRun
    │  (run_log.jsonl 업데이트, 성공 기록)
    ▼
    END
```

### 7.2 오류 처리 흐름

```
각 단계에서 오류 발생
    │
    ▼
FailRun 상태로 전환
    │  (오류 유형, 스택 트레이스, 실행 ID 기록)
    ▼
CloudWatch 알람 발행
    │  (Lambda / Step Functions 실패 메트릭)
    ▼
run_log.jsonl에 실패 기록
    │  (status: FAILED, error_message, failed_at)
    ▼
    END (수동 재실행 또는 다음 스케줄 실행 대기)
```

---

## 8. 데이터 품질 관리

### 8.1 각 레이어별 품질 기준

| 레이어 | 품질 기준 |
|--------|----------|
| Bronze | 파일 존재, 크기 > 0, 행수 > 0, 핵심 컬럼 null 비율 < 5% |
| Silver | 스키마 일치, 타입 정합성, NOT NULL 컬럼 완전성, 상권 코드 유효성 |
| Gold | 기준/비교 기간 데이터 모두 존재, 변화율 계산 완전성, 이상 탐지 결과 > 0 (샘플 기준) |

### 8.2 run_log.jsonl 구조

```json
{
  "run_id": "RUN-2024-Q4-001",
  "pipeline_name": "revenue_ops_medallion",
  "status": "COMPLETED",
  "started_at": "2026-05-05T10:00:00Z",
  "completed_at": "2026-05-05T10:15:00Z",
  "target_year": 2024,
  "target_quarter": 4,
  "baseline_year": 2024,
  "baseline_quarter": 3,
  "bronze_sources_count": 7,
  "silver_schemas_count": 6,
  "gold_marts_count": 5,
  "anomalies_detected_count": 2,
  "evidence_candidates_count": 5,
  "action_recommendations_count": 4,
  "revenue_brief_generated": true,
  "use_samples": true,
  "error_message": null,
  "failed_at": null
}
```

---

## 9. 관련 문서

| 문서 | 경로 |
|------|------|
| M3 Revenue ETL 계획 | `docs/m3_revenue_etl_plan_kr.md` |
| 공공데이터 소스 목록 | `docs/m3_public_data_sources_kr.md` |
| AWS Serverless ETL 설계 | `docs/m3_aws_serverless_etl_design_kr.md` |
| Terraform 설계 | `docs/m3_terraform_design_kr.md` |
| 로컬 실행 런북 | `docs/m3_local_runbook_kr.md` |
| Revenue Ops 택소노미 | `docs/m3_revenue_ops_taxonomy_kr.md` |
