# M3 공공데이터 소스 목록 (한국어)

> 문서 버전: v0.1 | 최종 수정: 2026-05-05 | 대상 마일스톤: M3

---

## 1. 개요

M3 Revenue Ops 파이프라인은 **한국 공공데이터**를 기반으로 동작한다. 모든 데이터는 서울 열린데이터광장, 공공데이터포털(data.go.kr), 기상청 ASOS 등 공개된 API 또는 CSV 다운로드를 통해 수집된다.

### 1.1 데이터 소스 전체 목록

| # | 소스 이름 | 제공 기관 | 접근 방식 | 필수 여부 |
|---|-----------|----------|----------|----------|
| 1 | 서울시 상권분석 추정매출 | 서울 열린데이터광장 | REST API | 필수 |
| 2 | 서울 생활인구 | 서울 열린데이터광장 | REST API | 필수 |
| 3 | 서울 상권경계 | 서울 열린데이터광장 | REST API / GeoJSON | 필수 |
| 4 | 업종별 인허가 점포수 | 공공데이터포털 | REST API / CSV | 필수 |
| 5 | 기상청 ASOS 종관기상관측 | 기상청 | REST API | 필수 |
| 6 | 법정 공휴일 정보 | 공공데이터포털 | REST API | 필수 |
| 7 | 서울 문화행사 | 서울 열린데이터광장 | REST API | 권장 |

### 1.2 MVP 데이터 흐름

```
공공 API / CSV 다운로드
    │
    ▼
Lambda (소규모 API 수집) 또는 로컬 스크립트 (샘플)
    │
    ▼
Bronze 레이어 (원천 보존, 변환 없음)
    │
    ▼
Glue Python Shell (Silver 변환)
    │
    ▼
Silver 레이어 (정규화된 신호 스키마)
```

---

## 2. 서울 열린데이터광장 (Seoul Open Data Plaza)

**포털 URL**: `https://data.seoul.go.kr/`
**API 기본 URL**: `http://openapi.seoul.go.kr:8088/{API_KEY}/json/{SERVICE_NAME}/`

### 2.1 서울시 상권분석 추정매출

**목적**: 상권·업종별 분기 추정 매출액 및 거래건수를 수집하여 `revenue_signal` Silver 스키마의 기반 데이터로 사용한다.

| 항목 | 내용 |
|------|------|
| 서비스명 | `VwsmTrdarSelngQq` (또는 상권분석서비스 API) |
| 데이터 갱신 주기 | 분기별 (Q1~Q4) |
| 기준 단위 | 상권 코드 + 업종 코드 + 연도 + 분기 |
| 주요 필드 | 상권코드, 상권명, 서비스업종코드, 서비스업종명, 기준년도, 기준분기, 분기당_매출_금액, 분기당_매출_건수 |
| Bronze 경로 | `bronze/seoul_sales/seoul_sales_YYYY_QQ.parquet` |
| Silver 스키마 | `revenue_signal` |

**Silver 스키마 (`revenue_signal`)**:

```
trade_area_code       : string    # 상권 코드
trade_area_name       : string    # 상권명
category_code         : string    # 업종 코드
category_name         : string    # 업종명
year                  : int       # 연도
quarter               : int       # 분기 (1~4)
period_start_date     : date      # 분기 시작일
period_end_date       : date      # 분기 종료일
estimated_revenue_krw : bigint    # 추정 매출액 (원)
transaction_count     : bigint    # 거래건수
data_source           : string    # "seoul_open_api"
ingested_at           : timestamp
```

**API 호출 예시** (Python):

```python
import requests

API_KEY = os.environ["SEOUL_API_KEY"]
SERVICE = "VwsmTrdarSelngQq"
start_idx = 1
end_idx = 1000

url = f"http://openapi.seoul.go.kr:8088/{API_KEY}/json/{SERVICE}/{start_idx}/{end_idx}/"
response = requests.get(url, timeout=30)
data = response.json()
```

---

### 2.2 서울 생활인구

**목적**: 상권 주변의 유동인구(생활인구) 추정치를 수집하여 `demand_signal` Silver 스키마의 기반 데이터로 사용한다.

| 항목 | 내용 |
|------|------|
| 서비스명 | `tbViewQpopSexowz` (서울 생활인구 집계구) |
| 데이터 갱신 주기 | 월별 |
| 기준 단위 | 집계구 코드 + 일자 + 시간대 |
| 주요 필드 | 기준일ID, 시간대구분, 집계구코드, 총생활인구수, 남성생활인구수, 여성생활인구수, 연령대별 인구수 |
| Bronze 경로 | `bronze/seoul_population/seoul_population_YYYYMM.parquet` |
| Silver 스키마 | `demand_signal` |

**Silver 스키마 (`demand_signal`)**:

```
trade_area_code       : string    # 상권 코드 (집계구 매핑 후)
reference_date        : date      # 기준일
hour_band             : int       # 시간대 (0~23)
total_population      : bigint    # 총 생활인구수
male_population       : bigint    # 남성 생활인구수
female_population     : bigint    # 여성 생활인구수
age_10s               : bigint    # 10대 인구수
age_20s               : bigint    # 20대 인구수
age_30s               : bigint    # 30대 인구수
age_40s               : bigint    # 40대 인구수
age_50s               : bigint    # 50대 인구수
age_60s_plus          : bigint    # 60대 이상 인구수
data_source           : string    # "seoul_population_api"
ingested_at           : timestamp
```

---

### 2.3 서울 상권경계

**목적**: 상권 폴리곤 좌표 및 메타데이터를 수집하여 상권 코드 기반 매핑에 사용한다. 직접 분석 신호는 아니지만 다른 데이터의 상권 조인 키로 활용된다.

| 항목 | 내용 |
|------|------|
| 형식 | GeoJSON 또는 SHP |
| 갱신 주기 | 비정기 (상권 경계 변경 시) |
| 주요 필드 | 상권코드, 상권명, 상권구분, geometry (폴리곤) |
| Bronze 경로 | `bronze/seoul_trade_area/seoul_trade_area_boundary.parquet` |
| 활용 용도 | Silver 스키마 조인 키 제공 (자체 Silver 스키마 없음) |

---

## 3. 공공데이터포털 (data.go.kr)

**포털 URL**: `https://www.data.go.kr/`
**API 기본 URL**: `https://apis.data.go.kr/{SERVICE_PATH}`

### 3.1 업종별 인허가 점포수

**목적**: 업종별 인허가된 점포 수를 수집하여 경쟁 환경 스냅샷(`competition_snapshot`) Silver 스키마를 구성한다. 점포수 증가는 경쟁 심화의 가능성 높은 원인 후보 신호이다.

| 항목 | 내용 |
|------|------|
| 데이터셋 | 소상공인시장진흥공단 상가(상권)정보 |
| 갱신 주기 | 월별 |
| 기준 단위 | 행정동 + 업종 코드 |
| 주요 필드 | 상가업소번호, 상호명, 업태구분명, 소분류명, 행정동코드, 행정동명, 위도, 경도, 영업상태구분코드 |
| Bronze 경로 | `bronze/store_count/store_count_YYYYMM.parquet` |
| Silver 스키마 | `competition_snapshot` |

**Silver 스키마 (`competition_snapshot`)**:

```
trade_area_code       : string    # 상권 코드 (행정동 → 상권 매핑)
category_code         : string    # 업종 코드
category_name         : string    # 업종명
reference_month       : string    # 기준 월 (YYYY-MM)
active_store_count    : int       # 영업 중인 점포 수
closed_store_count    : int       # 폐업 점포 수 (있는 경우)
data_source           : string    # "data_go_kr_store"
ingested_at           : timestamp
```

---

### 3.2 법정 공휴일 정보

**목적**: 법정 공휴일 및 대체 공휴일 목록을 수집하여 `holiday_context` Silver 스키마를 구성한다. 공휴일은 매출 변화의 맥락 요인 후보이다.

| 항목 | 내용 |
|------|------|
| 서비스명 | 한국천문연구원 특일 정보 (공휴일 API) |
| 갱신 주기 | 연간 |
| 기준 단위 | 날짜 |
| 주요 필드 | 날짜, 공휴일명, 공휴일구분(법정/대체) |
| Bronze 경로 | `bronze/holidays/holidays_YYYY.parquet` |
| Silver 스키마 | `holiday_context` |

**API 호출 예시** (Python):

```python
import requests

SERVICE_KEY = os.environ["DATA_GO_KR_API_KEY"]
url = "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getHoliDeInfo"
params = {
    "serviceKey": SERVICE_KEY,
    "solYear": "2024",
    "numOfRows": 100,
    "_type": "json",
}
response = requests.get(url, params=params, timeout=30)
```

**Silver 스키마 (`holiday_context`)**:

```
reference_date        : date      # 날짜
holiday_name          : string    # 공휴일명
holiday_type          : string    # "legal" (법정) / "substitute" (대체)
is_holiday            : boolean   # 공휴일 여부
data_source           : string    # "data_go_kr_holiday"
ingested_at           : timestamp
```

---

## 4. 기상청 ASOS (Korea Meteorological Administration)

**포털 URL**: `https://data.kma.go.kr/`
**API 기본 URL**: `https://apis.data.go.kr/1360000/AsosDalyInfoService/getWthrDataList`

### 4.1 종관기상관측 (ASOS) 일별 데이터

**목적**: 일별 기상 관측 데이터를 수집하여 `weather_signal` Silver 스키마를 구성한다. 강수량 증가 및 기온 변화는 외부 고객 방문에 영향을 주었을 가능성이 있는 원인 후보 신호이다.

| 항목 | 내용 |
|------|------|
| 관측소 | 서울 (지점번호: 108) |
| 갱신 주기 | 일별 |
| 기준 단위 | 관측일 + 관측소 |
| 주요 항목 | 일 평균기온, 일 최고기온, 일 최저기온, 일 강수량, 일 평균 상대습도, 일 평균 풍속 |
| Bronze 경로 | `bronze/weather/weather_YYYY.parquet` |
| Silver 스키마 | `weather_signal` |

**API 호출 예시** (Python):

```python
import requests

SERVICE_KEY = os.environ["KMA_API_KEY"]
url = "https://apis.data.go.kr/1360000/AsosDalyInfoService/getWthrDataList"
params = {
    "serviceKey": SERVICE_KEY,
    "pageNo": 1,
    "numOfRows": 365,
    "dataType": "JSON",
    "dataCd": "ASOS",
    "dateCd": "DAY",
    "startDt": "20240101",
    "endDt": "20241231",
    "stnIds": "108",  # 서울 관측소
}
response = requests.get(url, params=params, timeout=30)
```

**Silver 스키마 (`weather_signal`)**:

```
station_id            : string    # 관측소 코드
station_name          : string    # 관측소명
reference_date        : date      # 관측일
avg_temp_celsius      : float     # 일 평균기온 (°C)
max_temp_celsius      : float     # 일 최고기온 (°C)
min_temp_celsius      : float     # 일 최저기온 (°C)
precipitation_mm      : float     # 일 강수량 (mm), NULL = 0mm
avg_humidity_pct      : float     # 일 평균 상대습도 (%)
avg_wind_speed_ms     : float     # 일 평균 풍속 (m/s)
is_rainy_day          : boolean   # 강수량 > 0mm 여부
data_source           : string    # "kma_asos"
ingested_at           : timestamp
```

---

## 5. 서울 문화행사 데이터

**포털 URL**: `https://data.seoul.go.kr/`
**서비스명**: `culturalEventInfo` (서울 문화행사 정보)

### 5.1 서울 문화행사 목록

**목적**: 서울 지역 문화행사·이벤트 목록을 수집하여 `local_event_context` Silver 스키마를 구성한다. 주변 대형 행사는 유동인구 변화에 영향을 주었을 가능성이 있는 원인 후보 신호이다.

| 항목 | 내용 |
|------|------|
| 데이터셋 | 서울 문화행사 정보 (공연, 전시, 축제 등) |
| 갱신 주기 | 실시간 갱신 (배치 수집: 주별) |
| 기준 단위 | 행사 ID + 행사 날짜 |
| 주요 필드 | 행사명, 분류, 장소, 시작일, 종료일, 위치(구/동) |
| Bronze 경로 | `bronze/local_events/local_events_YYYYQQ.parquet` |
| Silver 스키마 | `local_event_context` |

**Silver 스키마 (`local_event_context`)**:

```
event_id              : string    # 행사 고유 ID
event_name            : string    # 행사명
event_category        : string    # 분류 (공연/전시/축제 등)
venue_name            : string    # 장소명
district              : string    # 자치구
dong                  : string    # 행정동
event_start_date      : date      # 행사 시작일
event_end_date        : date      # 행사 종료일
trade_area_code       : string    # 연관 상권 코드 (NULL 허용)
data_source           : string    # "seoul_cultural_events"
ingested_at           : timestamp
```

---

## 6. API 키 관리 방법

### 6.1 로컬 환경

환경 변수를 `.env` 파일에 관리한다. `.env.example` 파일을 복사하여 사용한다.

```bash
cp .env.example .env
# 편집기로 .env 파일을 열어 실제 API 키를 입력한다.
```

`.env.example` 예시:

```bash
# 서울 열린데이터광장 API 키
SEOUL_API_KEY=your_seoul_open_api_key_here

# 공공데이터포털 API 키
DATA_GO_KR_API_KEY=your_data_go_kr_api_key_here

# 기상청 API 키 (공공데이터포털 통합 키 사용 가능)
KMA_API_KEY=your_kma_api_key_here

# 샘플 데이터 사용 여부 (true: 실제 API 미호출)
USE_SAMPLE_DATA=true

# AWS 설정 (AWS 배포 시 사용)
AWS_REGION=ap-northeast-2
AWS_PROFILE=default
S3_BUCKET_PREFIX=revenue-ops
```

**주의**: `.env` 파일은 `.gitignore`에 포함되어야 한다. 실제 API 키를 코드에 하드코딩하거나 커밋하지 않는다.

### 6.2 AWS 환경

AWS 환경에서는 API 키를 **SSM Parameter Store** 또는 **Secrets Manager**에 저장하고, Lambda/Glue 실행 시 런타임에 읽어온다.

| 파라미터 경로 | 용도 |
|--------------|------|
| `/revenue-ops/dev/seoul-api-key` | 서울 열린데이터광장 API 키 |
| `/revenue-ops/dev/data-go-kr-api-key` | 공공데이터포털 API 키 |
| `/revenue-ops/dev/kma-api-key` | 기상청 API 키 |

Secrets Manager는 교체 주기가 있는 자격증명에 사용하고, SSM Parameter Store(SecureString)는 단순 API 키에 사용한다.

---

## 7. M3 MVP 한계

### 7.1 MVP에서 제공하지 않는 것

| 항목 | 이유 | v1 계획 |
|------|------|---------|
| 개별 매장 POS 데이터 | 공공 API에서 제공하지 않음 | 개별 POS 연동 검토 |
| 배달앱 주문 데이터 | 별도 제휴 필요 | 배달의민족/쿠팡이츠 연동 검토 |
| SmartPlace 리뷰 | 별도 크롤링 필요 | 네이버 SmartPlace 연동 검토 |
| 실시간 데이터 | 배치 ETL 구조 | 필요 시 스트리밍 레이어 추가 검토 |

### 7.2 공공데이터의 특성상 제약

- 추정매출 데이터는 **상권/업종 단위**이다. 특정 매장의 매출이 아니다.
- 공공데이터 갱신 지연이 있을 수 있다 (실제 분기 종료 후 수 주 내 제공).
- 일부 상권은 데이터 표본이 적어 추정치 신뢰도가 낮을 수 있다.
- 이러한 제약으로 인해 모든 분석 결과는 "가능성 높은 원인 후보"이며, "추가 확인이 필요합니다"라는 표현과 함께 제시해야 한다.

---

## 8. v1 확장 예시

M3 MVP 이후 v1에서는 아래 데이터 소스 추가를 검토한다.

### 8.1 개별 POS 연동

- 연동 방식: 매장 POS 시스템과 직접 API 연동 또는 파일 export
- 데이터 정확도: 상권/업종 추정치 대비 개별 매장 수준의 정밀 분석 가능
- Silver 스키마: `pos_revenue_signal` (신규)

### 8.2 배달앱 데이터

- 배달의민족, 쿠팡이츠 등 플랫폼의 주문 건수 데이터
- 오프라인 매출과 배달 매출을 분리하여 분석

### 8.3 SmartPlace 리뷰 데이터

- 네이버 SmartPlace에서 리뷰 건수, 평점 트렌드 수집
- 고객 인식 변화를 맥락 신호로 활용

### 8.4 SNS 트렌드 데이터

- 업종·지역 관련 소셜 미디어 언급 빈도 변화
- 트렌드 변화를 맥락 신호로 활용

---

## 9. 소스별 요약 테이블

| # | 소스 | 기관 | 갱신 주기 | Bronze 경로 | Silver 스키마 | 필수 |
|---|------|------|----------|------------|--------------|------|
| 1 | 추정매출 | 서울 열린데이터광장 | 분기 | `bronze/seoul_sales/` | `revenue_signal` | 필수 |
| 2 | 생활인구 | 서울 열린데이터광장 | 월 | `bronze/seoul_population/` | `demand_signal` | 필수 |
| 3 | 상권경계 | 서울 열린데이터광장 | 비정기 | `bronze/seoul_trade_area/` | (조인 키) | 필수 |
| 4 | 점포수 | 공공데이터포털 | 월 | `bronze/store_count/` | `competition_snapshot` | 필수 |
| 5 | 기상 ASOS | 기상청 | 일 | `bronze/weather/` | `weather_signal` | 필수 |
| 6 | 공휴일 | 공공데이터포털 | 연간 | `bronze/holidays/` | `holiday_context` | 필수 |
| 7 | 문화행사 | 서울 열린데이터광장 | 주 (배치) | `bronze/local_events/` | `local_event_context` | 권장 |
