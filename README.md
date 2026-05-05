# Small Merchant Revenue Ops Backbone

**AI Revenue Ops OS for Small Merchants**

소상공인이 매출 변화의 원인 후보를 근거와 함께 이해하고, 바로 실행할 액션까지 결정할 수 있게 돕는 AI Revenue Ops OS.

Public commerce/context data ETL 기반 Small Merchant Revenue Ops Backbone. 서울시 상권 공공데이터를 수집·정형화하여 매출 이상을 탐지하고, 가능성 높은 원인 후보 근거와 실행 액션을 생성합니다.

---

## M3 현황

**M3: Serverless Batch Medallion ETL — 완료**

- [x] Bronze/Silver/Gold Medallion 파이프라인
- [x] 7개 공공 데이터 소스 수집 구조
- [x] 규칙 기반 매출 이상 탐지
- [x] 원인 근거 후보 연결
- [x] 액션 카탈로그 매핑 (16개 액션)
- [x] Revenue Brief 생성
- [x] 신뢰성 run_log 기록
- [x] revenue-dev Terraform Serverless 스택
- [x] 62개 테스트 PASS

---

## 빠른 시작

```bash
# 의존성 설치
pip install -r requirements-pipelines.txt

# 샘플 파이프라인 실행 (API 키 불필요)
python -m pipelines.orchestration.run_local_medallion_pipeline \
  --use-samples --target-year 2024 --target-quarter 4

# 테스트 실행
python -m pytest tests/ -v
```

---

## 샘플 시나리오 출력

```
M3 Revenue Ops Medallion Pipeline completed
- Bronze sources prepared: 12
- Silver datasets written: 11
- Gold mart rows: 9
- Anomalies detected: 6
- Evidence candidates: 4
- Action recommendations: 6
- Revenue briefs: 1

Brief headline: 성수 커피음료: 매출 12.0% 하락 — 4개 원인 후보가 함께 관측되었습니다
Summary: 매출이 12.0% 하락하였습니다. 가능성 높은 원인 후보로는 날씨 영향,
전환율/경쟁력 이슈이 함께 관측되었습니다. 이는 원인으로 확정된 것이 아니며,
추가 확인이 필요합니다.
```

---

## 도메인 플로우

```
[공공 데이터 소스]
  서울 추정매출 / 생활인구 / 상권경계 / 점포수 / 기상 / 공휴일 / 지역행사
       │
       ▼  Bronze (원천 보존)
       │
       ▼  Silver (정규화된 신호 스키마)
       │
       ▼  Gold
  revenue_context_mart → revenue_anomaly_results
       │
       ▼
  cause_evidence_candidates (demand/weather/competition/context/benchmark)
       │
       ▼
  action_recommendation_candidates (16개 액션 템플릿)
       │
       ▼
  revenue_brief_view (Revenue Brief)
```

---

## 구조

```
pipelines/
  common/          # config, schemas, io, run_logger
  extract/         # Bronze 수집 (7개 소스)
  transform/       # Bronze → Silver (6개 스키마)
  marts/           # Silver → Gold context mart
  analyze/         # 이상탐지 / 근거연결 / 액션매핑 / Revenue Brief
  orchestration/   # 로컬 실행기 + Step Functions ASL

configs/
  source_registry.yaml
  revenue_ops_taxonomy.yaml
  action_catalog.yaml           # 16개 액션 템플릿

data/
  samples/revenue_ops_demo/     # 성수 카페 Q4 2024 데모 시나리오
  bronze/ silver/ gold/ runs/

infra/terraform/
  bootstrap/                    # Terraform state 인프라
  envs/revenue-dev/             # Revenue Ops Serverless 환경
  modules/revenue_*/            # 10개 모듈 (Glue, Lambda, Step Functions 등)

tests/                          # 62개 테스트
docs/                           # M3 Korean docs (10개)
```

---

## 기술 스택

Python 3.11, pandas, pyarrow, pyyaml, pytest  
AWS: S3, Glue Python Shell, Step Functions, Lambda, Athena, Glue Data Catalog, EventBridge, CloudWatch, SSM/Secrets Manager  
IaC: Terraform

---

## 데이터 한계

M3 MVP는 서울시 상권 공공데이터(상권/업종 단위 추정치) 기반입니다.
개별 사업자 POS 데이터는 포함되지 않습니다.
매출 수치는 추정치이며 실제 매장 매출과 다를 수 있습니다.

---

## 문서

| 문서 | 경로 |
|------|------|
| ETL 계획 | [docs/m3_revenue_etl_plan_kr.md](docs/m3_revenue_etl_plan_kr.md) |
| 공공 데이터 소스 | [docs/m3_public_data_sources_kr.md](docs/m3_public_data_sources_kr.md) |
| Medallion 아키텍처 | [docs/m3_medallion_architecture_kr.md](docs/m3_medallion_architecture_kr.md) |
| AWS Serverless ETL | [docs/m3_aws_serverless_etl_design_kr.md](docs/m3_aws_serverless_etl_design_kr.md) |
| Terraform 설계 | [docs/m3_terraform_design_kr.md](docs/m3_terraform_design_kr.md) |
| 로컬 런북 | [docs/m3_local_runbook_kr.md](docs/m3_local_runbook_kr.md) |
| AWS 배포 런북 | [docs/m3_aws_deployment_runbook_kr.md](docs/m3_aws_deployment_runbook_kr.md) |
| 도메인 마이그레이션 | [docs/m3_domain_migration_summary_kr.md](docs/m3_domain_migration_summary_kr.md) |
| 완료 체크리스트 | [docs/m3_completion_checklist_kr.md](docs/m3_completion_checklist_kr.md) |

레거시 Product Ops 문서: [docs/reference/legacy_product_ops/](docs/reference/legacy_product_ops/)
