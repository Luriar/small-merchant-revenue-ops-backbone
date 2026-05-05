# M3 AWS Serverless ETL 설계 (한국어)

> 문서 버전: v0.1 | 최종 수정: 2026-05-05 | 대상 마일스톤: M3

---

## 1. 왜 Serverless Batch ETL인가

### 1.1 설계 결정 배경

M3 Revenue Ops 파이프라인은 **공공데이터 배치 ETL** 특성에 최적화된 **AWS Serverless** 아키텍처를 채택한다.

| 비교 항목 | 스트리밍 인프라 (구 Product Ops) | Serverless Batch ETL (M3) |
|----------|-------------------------------|--------------------------|
| 데이터 갱신 주기 | 초/분 단위 | 일/주/분기 단위 |
| 필요 처리 지연 | 밀리초 수준 | 수 분 이내 |
| 상시 가동 비용 | EKS 노드 + MSK 브로커 24/7 | 실행 시에만 과금 |
| 운영 복잡도 | 높음 (CDC, Debezium, Strimzi) | 낮음 (관리형 서비스) |
| 공공 API 적합성 | 낮음 (API Rate Limit 고려 필요) | 높음 (배치 단위 수집) |

### 1.2 Serverless 선택 이유

**비용 효율성**: 공공데이터 파이프라인은 주 1회 또는 분기 1회 실행이 일반적이다. EKS 클러스터, MSK 브로커를 상시 가동할 이유가 없다. Lambda + Glue Python Shell은 실행 시간에만 과금된다.

**유지보수 간소화**: 관리형 서비스(Lambda, Glue, Step Functions)를 활용하면 인프라 패치, 클러스터 관리, 컨테이너 오케스트레이션 부담이 없다.

**공공데이터 특성 대응**: 한국 공공 API는 Rate Limit이 있고 배치 단위로 데이터를 제공한다. 스트리밍이 필요 없다.

**확장성**: 데이터 소스가 늘어나도 Lambda 함수 추가, Glue Job 추가로 대응 가능하다.

---

## 2. 구성요소 목록 및 역할

### 2.1 전체 아키텍처 개요

```
EventBridge Scheduler
    │ (주간 또는 분기별 트리거)
    ▼
Step Functions Standard (오케스트레이션)
    │
    ├── Lambda (소규모 API 수집: 공공 API → S3 Bronze)
    │
    ├── Glue Python Shell (Bronze → Silver 변환)
    │
    ├── Glue Python Shell (Silver → Gold 마트 빌드)
    │    ├── 이상 탐지
    │    ├── 근거 후보 연결
    │    ├── 액션 추천 매핑
    │    └── Revenue Brief 생성
    │
    └── Aurora PostgreSQL (운영 기록: run_log)

S3 (Bronze / Silver / Gold / scripts / artifacts)
Glue Data Catalog (테이블 메타데이터)
Athena (쿼리)
CloudWatch (모니터링 + 알람)
SSM / Secrets Manager (API 키 관리)
```

### 2.2 각 구성요소 상세

#### Amazon S3

**역할**: 데이터 레이크의 모든 레이어를 저장한다.

| 버킷 경로 접두사 | 용도 |
|----------------|------|
| `s3://{prefix}-datalake/bronze/` | Bronze 원천 보존 |
| `s3://{prefix}-datalake/silver/` | Silver 정규화 데이터 |
| `s3://{prefix}-datalake/gold/` | Gold 운영 판단 마트 |
| `s3://{prefix}-datalake/error/` | 처리 실패 원인 파일 |
| `s3://{prefix}-datalake/metadata/` | 스키마 메타데이터 |
| `s3://{prefix}-datalake/runs/` | run_log.jsonl 이력 |
| `s3://{prefix}-scripts/glue/` | Glue Job 스크립트 |
| `s3://{prefix}-artifacts/lambda/` | Lambda 패키지 ZIP |

**버킷 설정**:
- 버전 관리 활성화 (Silver/Gold 레이어)
- 수명 주기 정책: Bronze 90일, Silver 1년, Gold 2년
- 서버 측 암호화: SSE-S3 또는 SSE-KMS
- 퍼블릭 액세스 차단: 전체 차단

---

#### EventBridge Scheduler

**역할**: 파이프라인 실행 스케줄을 관리한다.

| 스케줄 | 표현식 | 기본 상태 |
|--------|--------|----------|
| 주간 실행 | `cron(0 2 ? * MON *)` (KST 기준 월요일 오전 11시) | 비활성화 |
| 분기별 실행 | `cron(0 2 1 1,4,7,10 ? *)` | 비활성화 |
| 수동 실행 | - | -

**M3 MVP에서는 스케줄을 기본 비활성화**한다. 실제 AWS 배포 후 운영팀이 활성화를 결정한다.

설정:

```hcl
# Terraform: EventBridge 스케줄 (기본 비활성화)
resource "aws_scheduler_schedule" "revenue_ops_weekly" {
  name  = "revenue-ops-weekly-${var.environment}"
  state = var.enable_schedule ? "ENABLED" : "DISABLED"
  ...
}
```

---

#### AWS Step Functions Standard

**역할**: 파이프라인의 전체 실행 흐름을 오케스트레이션한다.

**Standard Workflow 선택 이유**:
- 최대 실행 기간: 1년 (Glue Job 장시간 실행 대응)
- 이벤트 이력 저장: 모든 단계 성공/실패 이력 CloudWatch에 기록
- 상태 가시성: AWS 콘솔에서 시각적 디버깅 가능
- 재실행 지원: 실패한 단계부터 재실행 가능

**스테이트 머신 구조**:

```json
{
  "States": {
    "CreateRun": { "Type": "Task", "Resource": "arn:...:lambda:CreateRunFunction" },
    "ExtractSources": { "Type": "Parallel", "Branches": [...] },
    "ValidateBronze": { "Type": "Task", "Resource": "arn:...:glue:startJobRun" },
    "BronzeToSilver": { "Type": "Task", "Resource": "arn:...:glue:startJobRun" },
    "SilverToGold": { "Type": "Task", "Resource": "arn:...:glue:startJobRun" },
    "DetectAnomalies": { "Type": "Task", "Resource": "arn:...:glue:startJobRun" },
    "LinkEvidence": { "Type": "Task", "Resource": "arn:...:glue:startJobRun" },
    "MapActions": { "Type": "Task", "Resource": "arn:...:glue:startJobRun" },
    "PublishRevenueBrief": { "Type": "Task", "Resource": "arn:...:glue:startJobRun" },
    "CompleteRun": { "Type": "Task", "Resource": "arn:...:lambda:CompleteRunFunction" },
    "FailRun": { "Type": "Task", "Resource": "arn:...:lambda:FailRunFunction" }
  }
}
```

---

#### AWS Lambda (소규모 API 수집)

**역할**: 한국 공공 API를 호출하여 원천 데이터를 S3 Bronze에 저장한다.

| Lambda 함수 | 수집 소스 | 예상 실행 시간 |
|------------|----------|--------------|
| `extract-seoul-sales` | 서울 추정매출 API | 30~120초 |
| `extract-seoul-population` | 서울 생활인구 API | 30~90초 |
| `extract-seoul-trade-area` | 서울 상권경계 | 15~30초 |
| `extract-store-count` | 점포수 API / CSV | 30~90초 |
| `extract-weather` | 기상청 ASOS API | 15~30초 |
| `extract-holidays` | 공휴일 API | 10~20초 |
| `extract-local-events` | 서울 문화행사 API | 15~45초 |
| `create-run` | 실행 ID 생성 및 기록 | < 5초 |
| `complete-run` | 실행 완료 기록 | < 5초 |
| `fail-run` | 실행 실패 기록 | < 5초 |

**Lambda 설정**:

```hcl
resource "aws_lambda_function" "extract_seoul_sales" {
  function_name = "revenue-ops-extract-seoul-sales-${var.environment}"
  runtime       = "python3.11"
  handler       = "extract_seoul_sales.handler"
  timeout       = 300  # 5분
  memory_size   = 512  # MB

  environment {
    variables = {
      BRONZE_BUCKET = aws_s3_bucket.datalake.bucket
      SSM_PREFIX    = "/revenue-ops/${var.environment}"
    }
  }
}
```

**Lambda 코드 구조**:

```python
# pipelines/extract/extract_seoul_sales.py

import json
import os
import boto3
import requests
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from datetime import datetime

def handler(event, context):
    """
    서울 추정매출 API를 수집하여 S3 Bronze에 Parquet으로 저장한다.
    """
    year = event.get("year", datetime.now().year)
    quarter = event.get("quarter", 4)

    # SSM에서 API 키 조회
    ssm = boto3.client("ssm")
    api_key = ssm.get_parameter(
        Name=f"/revenue-ops/{os.environ['ENV']}/seoul-api-key",
        WithDecryption=True
    )["Parameter"]["Value"]

    # API 호출
    records = fetch_seoul_sales(api_key, year, quarter)

    # S3에 Parquet 저장
    df = pd.DataFrame(records)
    df["ingested_at"] = datetime.utcnow()
    df["data_source"] = "seoul_open_api"

    s3_key = f"bronze/seoul_sales/year={year}/quarter={quarter}/seoul_sales_{year}_Q{quarter}.parquet"
    save_to_s3(df, os.environ["BRONZE_BUCKET"], s3_key)

    return {"status": "success", "records_count": len(df), "s3_key": s3_key}
```

---

#### AWS Glue Python Shell (변환 및 마트 빌드)

**역할**: Bronze → Silver 변환, Silver → Gold 마트 빌드, 이상 탐지, 근거 연결, 액션 추천, Revenue Brief 생성을 수행한다.

**Glue Python Shell 선택 이유**:
- 관리형 환경: Python 3.11 환경 자체 관리 불필요
- 비용 효율: DPU 단위 과금 (최소 0.0625 DPU)
- 라이브러리: pandas, pyarrow, boto3 기본 포함
- EMR 대비 훨씬 단순 (공공데이터 규모에 Spark 불필요)

| Glue Job | 역할 | DPU | 예상 실행 시간 |
|----------|------|-----|--------------|
| `validate-bronze` | Bronze 데이터 검증 | 0.0625 | 5~10분 |
| `bronze-to-silver` | Silver 변환 | 0.0625 | 10~20분 |
| `silver-to-gold-context` | 맥락 마트 빌드 | 0.0625 | 10~15분 |
| `detect-anomalies` | 이상 탐지 | 0.0625 | 5~10분 |
| `link-evidence` | 근거 후보 연결 | 0.0625 | 5~10분 |
| `map-actions` | 액션 추천 매핑 | 0.0625 | 5~10분 |
| `publish-revenue-brief` | Revenue Brief 생성 | 0.0625 | 5~10분 |

**Glue Job 코드 예시** (bronze_to_silver.py):

```python
# infra/terraform/scripts/glue/bronze_to_silver.py

import sys
import boto3
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from awsglue.utils import getResolvedOptions

args = getResolvedOptions(sys.argv, [
    "BRONZE_BUCKET",
    "SILVER_BUCKET",
    "TARGET_YEAR",
    "TARGET_QUARTER",
    "RUN_ID",
])

def transform_seoul_sales_to_revenue_signal(df_raw, year, quarter):
    """
    서울 추정매출 원천 데이터를 revenue_signal Silver 스키마로 변환한다.
    """
    df = df_raw.copy()
    # 필드명 정규화
    df = df.rename(columns={
        "상권코드": "trade_area_code",
        "상권명": "trade_area_name",
        "서비스업종코드": "category_code",
        "서비스업종명": "category_name",
        "분기당_매출_금액": "estimated_revenue_krw",
        "분기당_매출_건수": "transaction_count",
    })
    df["year"] = year
    df["quarter"] = quarter
    df["data_source"] = "seoul_open_api"
    df["ingested_at"] = pd.Timestamp.utcnow()
    return df[[
        "trade_area_code", "trade_area_name", "category_code", "category_name",
        "year", "quarter", "estimated_revenue_krw", "transaction_count",
        "data_source", "ingested_at"
    ]]
```

---

#### AWS Glue Data Catalog

**역할**: S3 Parquet 데이터의 메타데이터(테이블 스키마, 파티션 정보)를 관리한다.

- Glue Database: `revenue_ops_dev`
- 각 Silver/Gold 레이어에 Glue 테이블 생성
- Athena 쿼리 시 Glue Data Catalog를 참조한다.

```hcl
resource "aws_glue_catalog_database" "revenue_ops" {
  name = "revenue_ops_${var.environment}"
}

resource "aws_glue_catalog_table" "revenue_signal" {
  name          = "revenue_signal"
  database_name = aws_glue_catalog_database.revenue_ops.name

  table_type = "EXTERNAL_TABLE"
  parameters = {
    "classification" = "parquet"
  }

  storage_descriptor {
    location      = "s3://${aws_s3_bucket.datalake.bucket}/silver/revenue_signal/"
    input_format  = "org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat"
    output_format = "org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat"
    ...
  }
}
```

---

#### Amazon Athena

**역할**: S3 Gold 레이어 데이터를 SQL로 쿼리한다.

- 워크그룹: `revenue-ops-dev`
- 결과 저장: `s3://{prefix}-athena-results/`
- 비용: 쿼리당 스캔 데이터 기준 과금 (Parquet 압축으로 최소화)

**샘플 Athena 쿼리**:

```sql
-- 성수 카페 2024 Q4 이상 탐지 결과 조회
SELECT
    trade_area_code,
    anomaly_type,
    revenue_change_rate,
    txn_change_rate,
    anomaly_severity,
    anomaly_description
FROM revenue_ops_dev.revenue_anomaly_results
WHERE trade_area_code = 'SEONGSU_001'
  AND compare_year = 2024
  AND compare_quarter = 4
ORDER BY anomaly_severity;

-- 근거 후보 상위 5개 조회
SELECT
    evidence_type,
    evidence_metric,
    evidence_value,
    confidence_level,
    evidence_description
FROM revenue_ops_dev.cause_evidence_candidates
WHERE trade_area_code = 'SEONGSU_001'
  AND compare_year = 2024
  AND compare_quarter = 4
ORDER BY confidence_level DESC
LIMIT 5;
```

---

#### Aurora PostgreSQL (운영 기록)

**역할**: 파이프라인 실행 이력, 이상 탐지 결과 요약, 액션 추천 이력 등 **운영 기록만** 저장한다. 원천 데이터 또는 분석 데이터를 저장하지 않는다.

| 테이블 | 내용 |
|--------|------|
| `pipeline_runs` | 파이프라인 실행 이력 (run_id, status, 시작/종료 시각) |
| `anomaly_summary` | 이상 탐지 요약 (상권/업종/기간별) |
| `action_audit` | 액션 추천 및 소상공인 실행 여부 기록 |

**주의**: Aurora PostgreSQL은 **운영 기록 전용**이다. 대용량 분석 데이터는 S3 + Athena에서 처리한다.

---

#### Amazon CloudWatch

**역할**: 파이프라인 실행 모니터링 및 알람.

| 모니터링 항목 | 메트릭 |
|-------------|--------|
| Lambda 실행 오류 | `Errors` > 0 |
| Step Functions 실행 실패 | `ExecutionsFailed` > 0 |
| Glue Job 실패 | `glue.driver.aggregate.numFailedTasks` > 0 |
| S3 Bronze 파일 크기 | S3 Object Size < 임계값 |

**CloudWatch Log Groups**:

```
/aws/lambda/revenue-ops-extract-seoul-sales-dev
/aws/lambda/revenue-ops-create-run-dev
/aws/states/revenue-ops-pipeline-dev
/aws-glue/jobs/revenue-ops-bronze-to-silver-dev
```

---

#### AWS SSM Parameter Store / Secrets Manager

**역할**: API 키 및 민감 정보 관리.

| 파라미터 | 서비스 | 설명 |
|----------|--------|------|
| `/revenue-ops/dev/seoul-api-key` | SSM SecureString | 서울 열린데이터광장 API 키 |
| `/revenue-ops/dev/data-go-kr-api-key` | SSM SecureString | 공공데이터포털 API 키 |
| `/revenue-ops/dev/kma-api-key` | SSM SecureString | 기상청 API 키 |
| `revenue-ops/dev/aurora-credentials` | Secrets Manager | Aurora PostgreSQL 접속 정보 |

---

## 3. Step Functions 파이프라인 상세 흐름

### 3.1 단계별 설명

| 단계 | 구현체 | 성공 조건 | 실패 시 |
|------|--------|----------|--------|
| `CreateRun` | Lambda | run_id 생성 완료 | → FailRun |
| `ExtractSources` | Lambda × 7 (병렬) | 모든 Bronze 파일 S3 저장 | → FailRun |
| `ValidateBronze` | Glue Job | 7개 소스 파일 검증 통과 | → FailRun |
| `BronzeToSilver` | Glue Job | 6개 Silver 스키마 생성 | → FailRun |
| `SilverToGold` | Glue Job | revenue_context_mart 생성 | → FailRun |
| `DetectAnomalies` | Glue Job | revenue_anomaly_results 생성 | → FailRun |
| `LinkEvidence` | Glue Job | cause_evidence_candidates 생성 | → FailRun |
| `MapActions` | Glue Job | action_recommendation_candidates 생성 | → FailRun |
| `PublishRevenueBrief` | Glue Job | revenue_brief_view 생성 | → FailRun |
| `CompleteRun` | Lambda | run_log 완료 기록 | 경고만 (파이프라인 성공으로 간주) |
| `FailRun` | Lambda | 오류 기록 완료 | (최종 실패 상태) |

### 3.2 병렬 추출 (ExtractSources)

7개 데이터 소스를 가능한 한 병렬로 추출한다.

```json
{
  "Type": "Parallel",
  "Branches": [
    { "States": { "ExtractSeoulSales": { ... } } },
    { "States": { "ExtractSeoulPopulation": { ... } } },
    { "States": { "ExtractSeoulTradeArea": { ... } } },
    { "States": { "ExtractStoreCount": { ... } } },
    { "States": { "ExtractWeather": { ... } } },
    { "States": { "ExtractHolidays": { ... } } },
    { "States": { "ExtractLocalEvents": { ... } } }
  ],
  "Catch": [
    {
      "ErrorEquals": ["States.ALL"],
      "Next": "FailRun"
    }
  ]
}
```

---

## 4. 로컬 환경 vs AWS 환경 실행 방법 차이

### 4.1 로컬 실행

```bash
# 로컬 실행 — 샘플 데이터 사용
python -m pipelines.orchestration.run_local_medallion_pipeline \
  --use-samples \
  --target-year 2024 \
  --target-quarter 4

# 로컬 실행 — 실제 API (API 키 .env에 설정 필요)
python -m pipelines.orchestration.run_local_medallion_pipeline \
  --target-year 2024 \
  --target-quarter 4
```

로컬 실행 시:
- Bronze/Silver/Gold 데이터는 `data/` 로컬 디렉토리에 저장된다.
- 오케스트레이션은 Python 코드 내 순차 실행이다.
- AWS 서비스를 사용하지 않는다.

### 4.2 AWS 실행

Step Functions 수동 실행:

```bash
aws stepfunctions start-execution \
  --state-machine-arn "arn:aws:states:ap-northeast-2:ACCOUNT:stateMachine:revenue-ops-pipeline-dev" \
  --input '{"target_year": 2024, "target_quarter": 4}' \
  --profile revenue-ops-dev
```

---

## 5. 비용 추정

배치 ETL이므로 상시 가동 비용이 없다. 아래는 주 1회 실행 기준 월간 예상 비용이다.

| 서비스 | 사용량 (예상) | 월간 비용 (USD, 예상) |
|--------|-------------|---------------------|
| S3 스토리지 | ~10 GB | ~$0.25 |
| S3 요청 | ~10,000 건 | ~$0.05 |
| Lambda | 10회/월 × 10분 × 512MB | ~$0.02 |
| Glue Python Shell | 7 Jobs × 10회/월 × 15분 × 0.0625 DPU | ~$0.80 |
| Step Functions | 10회/월 × 100 상태 전환 | ~$0.03 |
| Athena | ~100 쿼리/월 × ~10MB/쿼리 | ~$0.05 |
| CloudWatch Logs | ~1 GB/월 | ~$0.50 |
| Aurora PostgreSQL (t3.micro) | 상시 가동 | ~$15 |
| **합계** | | **~$17/월** |

**주의**: Aurora PostgreSQL은 운영 기록용으로 상시 가동 비용이 발생한다. M3 MVP에서는 로컬 SQLite 또는 DynamoDB로 대체를 검토할 수 있다.

---

## 6. 보안 고려사항

### 6.1 API 키 관리

- API 키는 코드에 하드코딩하지 않는다.
- 로컬: `.env` 파일 (`.gitignore` 포함)
- AWS: SSM Parameter Store SecureString 또는 Secrets Manager

### 6.2 IAM 최소 권한 원칙

각 서비스는 필요한 권한만 부여받는다.

| 역할 | 허용 권한 |
|------|----------|
| Lambda 실행 역할 | S3:GetObject, S3:PutObject (특정 버킷만), SSM:GetParameter (특정 경로만), CloudWatch:PutMetricData |
| Glue Job 역할 | S3:GetObject, S3:PutObject (특정 버킷만), Glue:GetTable, CloudWatch:PutMetricData |
| Step Functions 역할 | lambda:InvokeFunction, glue:StartJobRun, states:StartExecution |
| EventBridge 역할 | states:StartExecution |

### 6.3 S3 보안

- 퍼블릭 액세스 차단: 전체 차단
- 버킷 정책: VPC 엔드포인트 또는 IAM 역할 기반 접근만 허용
- 서버 측 암호화: SSE-S3 기본, 민감 데이터는 SSE-KMS

---

## 7. 관련 문서

| 문서 | 경로 |
|------|------|
| Medallion 아키텍처 | `docs/m3_medallion_architecture_kr.md` |
| Terraform 설계 | `docs/m3_terraform_design_kr.md` |
| AWS 배포 런북 | `docs/m3_aws_deployment_runbook_kr.md` |
| 로컬 실행 런북 | `docs/m3_local_runbook_kr.md` |
