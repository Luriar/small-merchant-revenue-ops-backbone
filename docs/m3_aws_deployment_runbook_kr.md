# M3 AWS 배포 런북

## 1. 전제조건

| 도구 | 버전 | 용도 |
|------|------|------|
| AWS CLI | v2 최신 | S3/Lambda/Glue/Step Functions 접근 |
| Terraform | 1.5 이상 | 인프라 프로비저닝 |
| Python | 3.11 이상 | Lambda 패키징 |

```bash
aws --version
terraform --version
python3 --version
```

AWS CLI 설정:
```bash
aws configure
# AWS Access Key ID: ...
# AWS Secret Access Key: ...
# Default region name: ap-northeast-2
# Default output format: json
```

---

## 2. Terraform 배포 절차

### 2-1. Bootstrap (최초 1회)

```bash
cd infra/terraform/bootstrap

# terraform.tfvars 생성 (커밋 금지)
cat > terraform.tfvars << EOF
aws_region       = "ap-northeast-2"
project_name     = "revenue-ops"
state_bucket_name = "revenue-ops-tfstate-YOUR_ACCOUNT_ID"
EOF

terraform init
terraform fmt -recursive
terraform validate
terraform plan
terraform apply
```

Bootstrap 결과:
- S3 Terraform state 버킷 생성
- DynamoDB state lock 테이블 생성

### 2-2. revenue-dev 환경 배포

```bash
cd infra/terraform/envs/revenue-dev

# terraform.tfvars 생성 (커밋 금지 — .gitignore에 포함됨)
cp terraform.tfvars.example terraform.tfvars
# terraform.tfvars 편집: 버킷명, 계정 ID 등 실제 값으로 변경

terraform init \
  -backend-config="bucket=revenue-ops-tfstate-YOUR_ACCOUNT_ID" \
  -backend-config="key=revenue-ops/revenue-dev/terraform.tfstate" \
  -backend-config="region=ap-northeast-2" \
  -backend-config="dynamodb_table=revenue-ops-tfstate-lock"

terraform fmt -recursive
terraform validate
terraform plan
terraform apply
```

---

## 3. Glue 스크립트 S3 업로드

Terraform apply 후, Glue Job이 실행할 Python 스크립트를 S3에 업로드합니다:

```bash
BUCKET=$(terraform output -raw data_lake_bucket_name)

# 각 transform/mart/analyze 파이프라인 스크립트 업로드
aws s3 cp pipelines/transform/bronze_to_silver_revenue.py \
  s3://${BUCKET}/scripts/glue/bronze_to_silver_revenue.py

aws s3 cp pipelines/transform/bronze_to_silver_demand.py \
  s3://${BUCKET}/scripts/glue/bronze_to_silver_demand.py

aws s3 cp pipelines/transform/bronze_to_silver_weather.py \
  s3://${BUCKET}/scripts/glue/bronze_to_silver_weather.py

aws s3 cp pipelines/transform/bronze_to_silver_competition.py \
  s3://${BUCKET}/scripts/glue/bronze_to_silver_competition.py

aws s3 cp pipelines/marts/build_gold_revenue_context_mart.py \
  s3://${BUCKET}/scripts/glue/build_gold_revenue_context_mart.py

aws s3 cp pipelines/analyze/detect_revenue_anomalies.py \
  s3://${BUCKET}/scripts/glue/detect_revenue_anomalies.py

aws s3 cp pipelines/analyze/link_cause_evidence.py \
  s3://${BUCKET}/scripts/glue/link_cause_evidence.py

aws s3 cp pipelines/analyze/map_action_recommendations.py \
  s3://${BUCKET}/scripts/glue/map_action_recommendations.py
```

---

## 4. Lambda 함수 패키징 및 배포

```bash
# 각 Lambda extractor를 ZIP으로 패키징
cd pipelines/extract

# fetch_weather_asos
zip /tmp/fetch_weather_asos.zip fetch_weather_asos.py
aws lambda update-function-code \
  --function-name revenue-ops-revenue-dev-fetch-weather-asos \
  --zip-file fileb:///tmp/fetch_weather_asos.zip

# fetch_holidays
zip /tmp/fetch_holidays.zip fetch_holidays.py
aws lambda update-function-code \
  --function-name revenue-ops-revenue-dev-fetch-holidays \
  --zip-file fileb:///tmp/fetch_holidays.zip

# fetch_local_events
zip /tmp/fetch_local_events.zip fetch_local_events.py
aws lambda update-function-code \
  --function-name revenue-ops-revenue-dev-fetch-local-events \
  --zip-file fileb:///tmp/fetch_local_events.zip
```

---

## 5. Step Functions 수동 실행

```bash
SF_ARN=$(cd infra/terraform/envs/revenue-dev && terraform output -raw step_function_arn)

aws stepfunctions start-execution \
  --state-machine-arn ${SF_ARN} \
  --input '{
    "target_year": "2024",
    "target_quarter": "4",
    "baseline_year": "2024",
    "baseline_quarter": "3",
    "use_samples": false
  }'
```

실행 상태 확인:
```bash
aws stepfunctions list-executions \
  --state-machine-arn ${SF_ARN} \
  --max-results 5
```

---

## 6. S3 Bronze/Silver/Gold 데이터 확인

```bash
BUCKET=$(cd infra/terraform/envs/revenue-dev && terraform output -raw data_lake_bucket_name)

# Bronze 확인
aws s3 ls s3://${BUCKET}/bronze/ --recursive | head -20

# Silver 확인
aws s3 ls s3://${BUCKET}/silver/ --recursive | head -20

# Gold 확인
aws s3 ls s3://${BUCKET}/gold/ --recursive | head -20
```

---

## 7. Athena 쿼리

```bash
WORKGROUP=$(cd infra/terraform/envs/revenue-dev && terraform output -raw athena_workgroup_name)
RESULTS_BUCKET=$(cd infra/terraform/envs/revenue-dev && terraform output -raw athena_results_bucket_name)

# Revenue Brief 조회
aws athena start-query-execution \
  --query-string "SELECT * FROM revenue_ops_dev.gold_revenue_brief_view LIMIT 10;" \
  --work-group ${WORKGROUP} \
  --result-configuration "OutputLocation=s3://${RESULTS_BUCKET}/query-results/"
```

---

## 8. CloudWatch 로그 확인

```bash
# Lambda 오류 로그
aws logs filter-log-events \
  --log-group-name /aws/lambda/revenue-ops-revenue-dev-fetch-weather-asos \
  --filter-pattern "ERROR" \
  --limit 20

# Step Functions 실행 실패 로그
aws logs filter-log-events \
  --log-group-name /aws/states/revenue-ops-revenue-dev-medallion-pipeline \
  --filter-pattern "failed" \
  --limit 20
```

---

## 9. 배포 후 스모크 테스트 체크리스트

```text
[ ] Step Functions 실행 상태가 SUCCEEDED인가?
[ ] S3 bronze/ 에 원천 데이터 파일이 생성되었는가?
[ ] S3 silver/ 에 Parquet 파일이 생성되었는가?
[ ] S3 gold/ 에 revenue_brief_view Parquet이 생성되었는가?
[ ] Athena 쿼리가 gold_revenue_brief_view를 반환하는가?
[ ] CloudWatch Logs에 오류 알람이 없는가?
[ ] SSM 파라미터에 실제 API 키가 설정되어 있는가?
```

---

## 10. 주의사항

- **terraform.tfvars는 절대 커밋하지 않습니다** (실제 버킷명, 계정 ID 포함)
- **terraform apply 전에 반드시 terraform plan 결과를 검토합니다**
- **Terraform state 파일은 S3 원격 백엔드에 저장합니다** (로컬 .tfstate 커밋 금지)
- **API 키는 SSM Parameter Store에 저장하며 코드에 하드코딩하지 않습니다**
- **enable_schedule = false 기본값 유지** — 스케줄 활성화는 명시적 결정 후 진행
- **실제 배포 전 로컬 파이프라인 테스트를 완료합니다**
