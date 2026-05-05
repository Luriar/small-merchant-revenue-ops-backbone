# M3 완료 체크리스트

## 1. 로컬 파이프라인 실행 기준

```bash
# 실행 명령
python -m pipelines.orchestration.run_local_medallion_pipeline \
  --use-samples --target-year 2024 --target-quarter 4
```

| 기준 | 확인 방법 | 상태 |
|------|-----------|------|
| 파이프라인 exit code = 0 | 명령 실행 후 `echo $?` | [x] |
| Bronze sources 12개 준비됨 | Stage 1 출력 확인 | [x] |
| Silver datasets 11개 작성됨 | Stage 2 출력 확인 | [x] |
| Gold mart rows > 0 | Stage 3 출력 확인 | [x] |
| Anomalies detected > 0 | Stage 4 출력 확인 | [x] |
| Evidence candidates > 0 | Stage 5 출력 확인 | [x] |
| Action recommendations >= 3 | Stage 6 출력 확인 | [x] |
| Revenue briefs >= 1 | Stage 7 출력 확인 | [x] |

---

## 2. Bronze/Silver/Gold 파일 생성 기준

| 레이어 | 경로 | 기대 파일 | 상태 |
|--------|------|-----------|------|
| Bronze | data/bronze/seoul_sales/ | bronze_seoul_sales_2024Q3.csv 등 | [x] |
| Bronze | data/bronze/seoul_population/ | bronze_seoul_population_*.csv | [x] |
| Bronze | data/bronze/weather_asos/ | bronze_weather_asos_*.csv | [x] |
| Bronze | data/bronze/store_competition/ | bronze_store_competition_*.csv | [x] |
| Bronze | data/bronze/holidays/ | bronze_holidays_*.csv | [x] |
| Bronze | data/bronze/local_events/ | bronze_local_events_*.csv | [x] |
| Silver | data/silver/revenue_signal/ | *.parquet | [x] |
| Silver | data/silver/demand_signal/ | *.parquet | [x] |
| Silver | data/silver/weather_signal/ | *.parquet | [x] |
| Silver | data/silver/competition_snapshot/ | *.parquet | [x] |
| Silver | data/silver/holiday_context/ | *.parquet | [x] |
| Silver | data/silver/local_event_context/ | *.parquet | [x] |
| Gold | data/gold/revenue_context_mart/ | *.parquet | [x] |
| Gold | data/gold/revenue_anomaly_results/ | *.parquet | [x] |
| Gold | data/gold/cause_evidence_candidates/ | *.parquet | [x] |
| Gold | data/gold/action_recommendation_candidates/ | *.parquet | [x] |
| Gold | data/gold/revenue_brief_view/ | *.parquet | [x] |

---

## 3. 이상 탐지 기준

| 이상 유형 | 트리거 규칙 | 성수 시나리오 | 상태 |
|-----------|-------------|---------------|------|
| revenue_drop | revenue_change_pct <= -10% | -12% → 탐지됨 | [x] |
| transaction_drop | transaction_change_pct <= -10% | -10% → 탐지됨 | [x] |
| severe_revenue_drop | revenue_change_pct <= -20% | 해당없음 (샘플) | [ ] |
| weak_growth_warning | rev < 0 and pop >= 0 | 조합에 따라 탐지 | [x] |

---

## 4. 근거 후보 생성 기준

| 근거 유형 | 트리거 조건 | 성수 시나리오 | 상태 |
|-----------|-------------|---------------|------|
| demand | pop_change_pct <= -5% | -8% → medium 강도 | [x] |
| weather | rain_days > 10 또는 heavy_rain > 3 | Q4 강수일 증가 → 탐지 | [x] |
| competition | store_count_change > 0 | +6개 → 탐지 | [x] |
| context | local_event_count < 3 | Q4 행사 2건 | [x] |
| benchmark_or_conversion | pop > -5% and rev <= -10% | 조합에 따라 탐지 | [x] |

---

## 5. 액션 추천 기준

| 기준 | 기대값 | 상태 |
|------|--------|------|
| 최소 액션 수 | >= 3개 | [x] |
| 모든 액션이 action_catalog에 존재 | True | [x] |
| 각 액션에 title, why_this_action 존재 | True | [x] |

---

## 6. Revenue Brief 기준

| 기준 | 기대값 | 상태 |
|------|--------|------|
| Revenue Brief 생성됨 | >= 1개 | [x] |
| headline 포함 | True | [x] |
| summary에 가능성 표현 사용 | "가능성 높은 원인 후보", "함께 관측되었습니다" | [x] |
| summary에 확정 표현 없음 | "원인으로 확정됩니다" 없음 | [x] |

---

## 7. 신뢰성 로그 기준

```bash
cat data/runs/run_log.jsonl | python3 -c "
import sys, json
lines = [json.loads(l) for l in sys.stdin]
print(f'총 로그 항목: {len(lines)}')
statuses = set(l.get(\"status\") for l in lines)
print(f'상태 유형: {statuses}')
"
```

| 기준 | 기대값 | 상태 |
|------|--------|------|
| run_log.jsonl 존재 | True | [x] |
| run_id 포함 | True | [x] |
| status 포함 (pending/processing/completed/failed) | True | [x] |
| 파이프라인 완료 시 root run status = completed | True | [x] |

---

## 8. 테스트 기준

```bash
python -m pytest tests/ -v
```

| 테스트 파일 | 테스트 수 | 상태 |
|-------------|-----------|------|
| test_local_pipeline_smoke.py | 9 | [x] PASS |
| test_revenue_signal_schema.py | 4 | [x] PASS |
| test_weather_signal_schema.py | 6 | [x] PASS |
| test_revenue_anomaly_rules.py | 9 | [x] PASS |
| test_evidence_linking_rules.py | 11 | [x] PASS |
| test_action_catalog_mapping.py | 7 | [x] PASS |
| test_step_functions_asl.py | 7 | [x] PASS |
| test_terraform_structure.py | 9 | [x] PASS |
| **합계** | **62** | **[x] 62 PASS** |

---

## 9. Terraform 구조 기준

```bash
cd infra/terraform/envs/revenue-dev
terraform fmt -recursive
terraform validate
```

| 기준 | 상태 |
|------|------|
| envs/revenue-dev/ 존재 | [x] |
| bootstrap/ 존재 | [x] |
| modules/revenue_* 10개 모두 존재 | [x] |
| EKS/MSK/ClickHouse 모듈 없음 | [x] |
| terraform validate 통과 | [ ] (AWS 자격증명 필요) |

---

## 10. 문서 기준

| 문서 | 경로 | 상태 |
|------|------|------|
| ETL 계획 | docs/m3_revenue_etl_plan_kr.md | [x] |
| 공공 데이터 소스 | docs/m3_public_data_sources_kr.md | [x] |
| 도메인 택소노미 | docs/m3_revenue_ops_taxonomy_kr.md | [x] |
| Medallion 아키텍처 | docs/m3_medallion_architecture_kr.md | [x] |
| AWS Serverless ETL 설계 | docs/m3_aws_serverless_etl_design_kr.md | [x] |
| Terraform 설계 | docs/m3_terraform_design_kr.md | [x] |
| 로컬 런북 | docs/m3_local_runbook_kr.md | [x] |
| AWS 배포 런북 | docs/m3_aws_deployment_runbook_kr.md | [x] |
| 도메인 마이그레이션 요약 | docs/m3_domain_migration_summary_kr.md | [x] |
| 완료 체크리스트 | docs/m3_completion_checklist_kr.md | [x] |

---

## 11. M3 이후 단계 (v1 확장)

### AWS 배포

- [ ] Terraform apply (revenue-dev)
- [ ] Glue 스크립트 S3 업로드
- [ ] Lambda 함수 실제 코드 배포
- [ ] SSM 파라미터에 실제 API 키 설정
- [ ] Step Functions 수동 실행 검증
- [ ] EventBridge 스케줄 활성화 (enable_schedule = true)

### 데이터 소스 확장

- [ ] 실제 Seoul Open API 연동
- [ ] data.go.kr API 연동
- [ ] 기상청 ASOS API 연동

### v1 POS 통합

- [ ] 개별 사업자 POS 데이터 연동 설계
- [ ] 배달앱(배달의민족, 쿠팡이츠) 매출 데이터 검토
- [ ] SmartPlace(네이버 플레이스) 방문/리뷰 데이터 검토
- [ ] 채널별 매출 통합 설계

### Revenue Ops UI (M4 이후)

- [ ] Revenue Brief 뷰어 UI
- [ ] 이상 탐지 알림
- [ ] 액션 실행 추적 (status 업데이트)
- [ ] 다음 기간 비교 자동화

---

## 12. 성수 카페 시나리오 검증 항목

| 항목 | 기대 결과 | 실제 결과 |
|------|-----------|-----------|
| 이상 탐지 (revenue_drop) | -12% → 탐지 | [x] 탐지됨 |
| 수요 근거 | pop -8% → medium 강도 | [x] 생성됨 |
| 날씨 근거 | Q4 강수일 증가 → 탐지 | [x] 생성됨 |
| 경쟁 근거 | 점포수 +6 → 탐지 | [x] 생성됨 |
| 액션 추천 3개 이상 | - | [x] 6개 생성됨 |
| Revenue Brief 생성 | 헤드라인 + 요약 | [x] 생성됨 |
| 가능성 표현 사용 | "가능성 높은 원인 후보" | [x] 준수됨 |
| 확정 표현 없음 | "원인으로 확정됩니다" 없음 | [x] 준수됨 |

---

## 13. 표현 가이드라인 준수 최종 확인

Revenue Brief summary에 사용된 표현을 확인합니다:

```python
import pandas as pd
df = pd.read_parquet("data/gold/revenue_brief_view/")
for _, row in df.iterrows():
    summary = row["summary"]
    # 사용해야 할 표현
    assert "가능성" in summary or "수 있습니다" in summary or "필요합니다" in summary, \
        f"가능성 표현 없음: {summary}"
    # 사용하지 말아야 할 표현
    assert "원인으로 확정" not in summary, f"확정 표현 사용됨: {summary}"
    assert "반드시 매출이" not in summary, f"보장 표현 사용됨: {summary}"
print("표현 가이드라인 준수 확인 완료")
```
