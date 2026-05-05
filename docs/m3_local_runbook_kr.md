# M3 로컬 실행 런북

## 1. 전제조건

| 항목 | 버전 | 확인 방법 |
|------|------|-----------|
| Python | 3.11 이상 | `python3 --version` |
| pip | 최신 | `python3 -m pip --version` |
| Git | 최신 | `git --version` |

API 키 없이도 `--use-samples` 모드로 전체 파이프라인을 로컬에서 실행할 수 있습니다.

---

## 2. 환경 설정

```bash
# 1. 저장소 클론 (이미 있으면 생략)
git clone https://github.com/Luriar/small-merchant-revenue-ops-backbone.git
cd small-merchant-revenue-ops-backbone

# 2. Python 가상환경 생성 및 활성화
python3 -m venv .venv
source .venv/bin/activate      # macOS/Linux
# .venv\Scripts\activate       # Windows

# 3. 파이프라인 의존성 설치
pip install -r requirements-pipelines.txt

# 4. 환경 변수 설정 (샘플 모드는 API 키 불필요)
cp .env.example .env
# .env 파일에서 USE_SAMPLE_DATA=true 확인
```

---

## 3. 샘플 파이프라인 실행

```bash
python -m pipelines.orchestration.run_local_medallion_pipeline \
  --use-samples \
  --target-year 2024 \
  --target-quarter 4
```

### 옵션 설명

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `--use-samples` | true | data/samples/revenue_ops_demo/ 샘플 데이터 사용 |
| `--no-use-samples` | - | 실제 공공 API 사용 (API 키 필요) |
| `--target-year` | 2024 | 분석 대상 연도 |
| `--target-quarter` | 4 | 분석 대상 분기 (1~4) |
| `--force-refresh` | false | 기존 Bronze/Silver 파일 강제 재생성 |

### 예상 출력

```
M3 Revenue Ops Medallion Pipeline
  Target: 2024Q4  Baseline: 2024Q3
  Mode: sample

Stage 1: Extracting Bronze sources...
  [OK] seoul_sales_baseline
  [OK] seoul_sales_compare
  [OK] seoul_population_base
  [OK] seoul_population_cmp
  [OK] trade_area_boundary
  [OK] store_competition_base
  [OK] store_competition_cmp
  [OK] weather_baseline
  [OK] weather_compare
  [OK] holidays
  [OK] local_events_baseline
  [OK] local_events_compare

Stage 2: Transforming Bronze → Silver...
  [OK] revenue_signal (baseline)
  [OK] revenue_signal (compare)
  [OK] demand_signal (baseline)
  [OK] demand_signal (compare)
  [OK] weather_signal (baseline)
  [OK] weather_signal (compare)
  [OK] competition_snapshot (base)
  [OK] competition_snapshot (cmp)
  [OK] holiday_context
  [OK] local_event_context (base)
  [OK] local_event_context (cmp)

Stage 3: Building Gold revenue_context_mart...
  [OK] revenue_context_mart — N rows

Stage 4: Detecting revenue anomalies...
  [OK] anomalies detected: N

Stage 5: Linking cause evidence candidates...
  [OK] evidence candidates: N

Stage 6: Mapping action recommendations...
  [OK] action recommendations: N

Stage 7: Publishing Revenue Brief...
  [OK] revenue briefs: N
  Brief headline: ...
  Summary: ...

M3 Revenue Ops Medallion Pipeline completed
- Bronze sources prepared: 12
- Silver datasets written: 11
- Gold mart rows: N
- Anomalies detected: N
- Evidence candidates: N
- Action recommendations: N
- Revenue briefs: N
```

---

## 4. 생성된 파일 확인

```bash
# Silver 데이터 확인
ls data/silver/revenue_signal/
ls data/silver/demand_signal/
ls data/silver/weather_signal/
ls data/silver/competition_snapshot/

# Gold 마트 확인
ls data/gold/revenue_context_mart/
ls data/gold/revenue_anomaly_results/
ls data/gold/cause_evidence_candidates/
ls data/gold/action_recommendation_candidates/
ls data/gold/revenue_brief_view/

# 실행 로그 확인
cat data/runs/run_log.jsonl | head -5 | python3 -m json.tool
```

### Python으로 Gold 마트 내용 확인

```python
import pandas as pd

# Revenue Brief 확인
df = pd.read_parquet("data/gold/revenue_brief_view/")
print(df[["trade_area_name", "service_category_name", "headline", "summary"]].to_string())

# 액션 추천 확인
actions = pd.read_parquet("data/gold/action_recommendation_candidates/")
print(actions[["action_type", "title", "why_this_action"]].drop_duplicates("title"))
```

---

## 5. 테스트 실행

```bash
python -m pytest tests/ -v
```

62개 테스트가 모두 PASSED 이어야 합니다.

특정 테스트만 실행:
```bash
# 파이프라인 스모크 테스트
python -m pytest tests/test_local_pipeline_smoke.py -v

# 이상 탐지 규칙 테스트
python -m pytest tests/test_revenue_anomaly_rules.py -v

# 액션 카탈로그 테스트
python -m pytest tests/test_action_catalog_mapping.py -v
```

---

## 6. 트러블슈팅

### ModuleNotFoundError: No module named 'pandas'
```bash
pip install -r requirements-pipelines.txt
```

### FileNotFoundError: Sample file not found
샘플 파일이 `data/samples/revenue_ops_demo/` 에 있는지 확인:
```bash
ls data/samples/revenue_ops_demo/
```
기대 파일 목록: `bronze_seoul_sales_2024Q3.csv`, `bronze_seoul_sales_2024Q4.csv` 등

### Gold mart build failed: merge type mismatch
기존 Silver 캐시가 오래된 경우. 다음 명령으로 초기화:
```bash
rm -f data/silver/**/*.parquet data/gold/**/*.parquet
python -m pipelines.orchestration.run_local_medallion_pipeline --use-samples --target-year 2024 --target-quarter 4
```

---

## 7. 실제 공공 API 사용 설정

샘플 데이터가 아닌 실제 공공 API를 사용하려면:

```bash
# .env 파일 편집
SEOUL_OPENAPI_KEY=발급받은_서울_오픈API_키
DATA_GO_KR_SERVICE_KEY=발급받은_공공데이터포털_서비스키
KMA_ASOS_STATION_ID=108
USE_SAMPLE_DATA=false

# 실행
python -m pipelines.orchestration.run_local_medallion_pipeline \
  --no-use-samples \
  --target-year 2024 \
  --target-quarter 4
```

API 키 발급:
- 서울 열린데이터광장: https://data.seoul.go.kr
- 공공데이터포털: https://www.data.go.kr
- 기상청 데이터: https://data.kma.go.kr

M3 MVP에서 `--no-use-samples` 실행 시, 각 extractor는 `NotImplementedError`를 발생시킵니다. 실제 API 연동은 M3 이후 단계에서 구현합니다.

---

## 8. 샘플 데이터 시나리오

| 항목 | 값 |
|------|---|
| 지역 | 서울 성수동 (상권코드: 3110067) |
| 업종 | 커피음료 (CS300006) |
| 기준기간 | 2024 Q3 (7-9월) |
| 비교기간 | 2024 Q4 (10-12월) |
| 매출 변화 | 약 -12% |
| 거래건수 변화 | 약 -10% |
| 유동인구 변화 | 약 -8% |
| 강수일 증가 | Q3 4일 → Q4 약 12일 이상 |
| 점포수 증가 | Q3 28개 → Q4 34개 (+6) |

이 시나리오는 합성 데모 데이터입니다. 실제 서울 성수동 카페 매출 데이터가 아닙니다.
