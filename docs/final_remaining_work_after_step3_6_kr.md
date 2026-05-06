# Final Remaining Work After STEP 3.6

## 완료됨

- `/api/v1/me`, `/api/v1/stores`, `/api/v1/stores/{proxy+}` API Gateway routes를 Terraform config에 추가
- 수동 hotfix route 6개를 revenue-dev Terraform state에 import
- API Gateway CORS `allow_methods`에 `POST` 추가
- saved plan apply: 0 added, 1 changed, 0 destroyed
- post-apply plan: no changes
- Lambda package script에 Step 3.5 runtime files와 SQL bootstrap 포함
- package manifest validation script 추가
- Aurora-backed SaaS repository method surface 보강
- production-lite mart same-weekday delta 계산 추가

## 아직 남은 작업

- fresh `ID_TOKEN`으로 live authenticated route smoke
- 새 Lambda package build/upload/deploy 후 Aurora-backed store runtime live smoke
- 실제 S3/SQS/EventBridge/Step Functions resource module wiring review
- Action outcome evaluator result window 계산 강화
- live public API collector credential/terms review
- Baemin/Coupang/Naver safe parser skeleton 확장

## Fresh-token Live Smoke

```bash
API_BASE="https://7q8hxxta67.execute-api.ap-northeast-2.amazonaws.com"

curl -i "$API_BASE/api/v1/stores"

curl -i "$API_BASE/api/v1/stores" \
  -H "Authorization: Bearer $ID_TOKEN"

curl -i "$API_BASE/api/v1/me" \
  -H "Authorization: Bearer $ID_TOKEN"

curl -i -X POST "$API_BASE/api/v1/stores/$STORE_ID/revenue/uploads/preview" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"parser_type":"standard_daily_revenue_csv","csv_text":"business_date,channel,gross_sales_amount,net_sales_amount,order_count\n2026-05-01,offline_pos,1250000,1180000,82"}'
```

## 알려진 제한

- 이번 run은 fresh token 획득을 하지 않았다.
- live authenticated 200은 사용자의 fresh token smoke로 확인해야 한다.
- platform-scale profile은 disabled-by-default skeleton이다.
- external API key가 없으면 public collector는 seed/skipped path를 사용한다.

## 권장 커밋 그룹

1. API Gateway route persistence + Terraform state import docs
2. Aurora repository/runtime hardening + package manifest validation
3. parser/context/action outcome tests
4. docs update
