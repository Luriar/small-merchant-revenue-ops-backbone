# M3 도메인 마이그레이션 요약

## 1. 기존 Product Ops Backbone

### 도메인

```text
Product Change (release / feature flag / rule change)
  → Event / Issue Intake
  → Suspected Trace
  → Evidence
  → Failed Run
  → Retry / Reprocess
  → Append-only State Log
```

### 기술 스택

| 컴포넌트 | 역할 |
|----------|------|
| Aurora PostgreSQL | Operational source of truth (change, event, issue, trace, run) |
| Kafka (MSK) | 고볼륨 이벤트 스트리밍 |
| Debezium / Strimzi | Aurora → Kafka CDC |
| ClickHouse | 고속 분석 읽기 모델 |
| EKS | 컨슈머 및 API 서버 실행 환경 |
| Node.js / React | API 서버 및 프론트엔드 |

### 특성

- 상시 가동 스트리밍 인프라 필요
- 밀리초 단위 이벤트 처리
- 고볼륨 제품 이벤트 처리에 최적화
- EKS + MSK + ClickHouse 운영 비용 고정

---

## 2. 새 Revenue Ops Backbone (M3)

### 도메인

```text
Public Commerce/Context Data
  (Seoul estimated sales, population, weather, competition, holidays, events)
  → Revenue Anomaly Detection
  → Likely Cause Evidence Candidates
  → Action Recommendations
  → Revenue Brief
  → Result Tracking (next period comparison)
```

### 기술 스택

| 컴포넌트 | 역할 |
|----------|------|
| S3 (Bronze/Silver/Gold) | Medallion 데이터 레이크 |
| AWS Glue Python Shell | Bronze→Silver 변환, Gold 마트 빌드 |
| AWS Step Functions | 파이프라인 오케스트레이션 |
| AWS Lambda | 소규모 API 수집기 (날씨, 공휴일, 행사) |
| AWS Glue Data Catalog | 스키마 카탈로그 (Athena 통합) |
| AWS Athena | Gold 마트 분석 쿼리 |
| EventBridge Scheduler | 주기적 파이프라인 실행 (기본 비활성) |
| Aurora PostgreSQL | 운영 기록 (run_log) |
| SSM / Secrets Manager | API 키 관리 |
| CloudWatch | 로그 및 알람 |
| Terraform | IaC |

### 특성

- 주기적 배치 ETL (분기/월/주별)
- 공공 데이터 기반 (API 키만 필요)
- Serverless — 상시 가동 비용 없음
- 로컬 실행 가능 (pandas + parquet)
- 낮은 운영 복잡도

---

## 3. 보존된 핵심 철학

도메인이 바뀌었지만, 운영 철학은 그대로 보존됩니다:

| 철학 | Product Ops | Revenue Ops |
|------|-------------|-------------|
| Source Ingestion | 제품 이벤트 수집 | 공공 데이터 수집 (Bronze) |
| Structuring | CDC → ClickHouse 정규화 | Bronze → Silver 스키마 정규화 |
| Evidence / Trust | trace + evidence + confidence | cause_evidence_candidates + strength |
| Selection | anomaly 연결 logic | anomaly detection rules |
| Action | retry / reprocess | action_recommendation_candidates |
| Feedback | run_state_log + recovery | run_log + next period comparison |
| Reliability | run / retry / reprocess / DLQ | run_logger + stage status tracking |

---

## 4. 제거된 컴포넌트

다음 컴포넌트는 Revenue Ops M3에 포함되지 않습니다:

| 제거 항목 | 이유 |
|-----------|------|
| EKS | 공공 데이터 배치 ETL에 불필요 |
| MSK (Kafka) | 스트리밍 불필요 |
| Debezium / Strimzi | CDC 불필요 |
| ClickHouse | Athena로 충분 |
| MWAA (Airflow) | Step Functions으로 충분 |
| Redshift | Athena + S3로 충분 |
| EMR | Glue Python Shell로 충분 |
| Kinesis | 스트리밍 불필요 |
| Prometheus / Grafana | CloudWatch로 충분 |
| Argo CD / Rollouts | K8s 없으므로 불필요 |

---

## 5. 마이그레이션 이유

1. **도메인 불일치**: Revenue Ops는 공공 데이터 배치 ETL이 특성입니다. 스트리밍 CDC는 과도한 설계입니다.
2. **비용 효율**: EKS + MSK + ClickHouse는 월 수백만 원의 고정 운영비용이 발생합니다. Serverless 배치는 실행 시간만 과금됩니다.
3. **로컬 검증**: Medallion ETL은 pandas + parquet으로 로컬에서 완전히 테스트 가능합니다.
4. **MVP 속도**: 복잡한 스트리밍 인프라 없이 데이터 파이프라인의 핵심 가치(이상탐지 + 근거 + 액션)를 빠르게 검증할 수 있습니다.

---

## 6. 기존 코드 보존 위치

기존 Product Ops M1/M2 결과물은 삭제되지 않고 참조용으로 보존됩니다:

```
docs/reference/legacy_product_ops/
  ├── (M1/M2 docs — 100+ 마크다운 문서)
  ├── ops/ (M2 체크리스트)
  ├── sources/ (Strimzi YAML, Aurora DDL, ClickHouse DDL 등)
  ├── scripts/ (M2 검증 스크립트)
  └── infra/
      ├── connectors/ (Debezium 커넥터)
      ├── sql/ (Aurora/ClickHouse DDL)
      └── terraform_modules/ (EKS, MSK, ClickHouse 등 Terraform 모듈)

docs/reference/
  └── ai_knowledge_operations_worldview.docx (보존)

sources/
  └── small_merchant_revenue_ops_planning_baseline_v0_1.docx (기준 문서)
```

---

## 7. 앱 코드 (apps/)

`apps/api/` (Node.js) 및 `apps/web/` (React/Vite) 코드는 M3에서 새로운 Revenue Ops UI로 교체될 예정이나, M3 단계에서는 Python 파이프라인이 중심이므로 기존 코드를 그대로 유지합니다.

M4 이후에 Revenue Ops 전용 API 및 UI를 구성할 계획입니다.

---

## 8. 결론

Product Ops Backbone과 Revenue Ops Backbone은 **같은 운영 철학**을 가지지만 **다른 도메인**에 적용됩니다.

- 기존: 제품 변경 → 이벤트 이상 → 운영 판단
- 신규: 상권 공공 데이터 → 매출 이상 → 소상공인 운영 판단

M3는 이 전환의 첫 번째 완성 단계입니다.
