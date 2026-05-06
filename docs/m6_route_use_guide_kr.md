# M6 Route / Use Guide

## 1. Frontend

```text
#revenue-cockpit
#revenue-cockpit?data=api
```

API mode는 Cognito token이 있으면 store-scoped API를 호출한다. 실패 시 demo fallback을 유지한다.

## 2. Store

```http
GET /api/v1/stores
POST /api/v1/stores
```

Create body:

```json
{
  "store_name": "성수 M6 매장",
  "tenant_name": "M6 Tenant",
  "business_category": "cafe",
  "region": "서울 성동구 성수동",
  "address_text": "서울 성동구 성수동 일대"
}
```

Create response includes:

```json
{
  "context_bootstrap_hint": {
    "recommended": true,
    "mode": "live",
    "reason": "store_onboarding_bootstrap",
    "prerequisites": {
      "has_address_text": true,
      "has_business_category": true
    }
  }
}
```

주소/업종이 없어도 store creation은 실패하지 않는다. 이 경우 `recommended=false`와 missing prerequisites를 반환한다.

## 3. Revenue Upload

```http
POST /api/v1/stores/:storeId/revenue/uploads/preview
POST /api/v1/stores/:storeId/revenue/uploads
GET /api/v1/stores/:storeId/revenue/uploads
GET /api/v1/stores/:storeId/revenue/uploads/:uploadId/rejected-rows
POST /api/v1/stores/:storeId/revenue/uploads/:uploadId/reprocess
```

Delivery CSV example:

```json
{
  "source_type": "baemin_orders_csv",
  "original_filename": "baemin_orders.csv",
  "file_type": "csv",
  "csv_text": "주문일,총 결제금액,정산금액,주문수,취소건수,배달비,중개수수료\n2026.05.01,\"128,000\",\"104,000\",12,1,\"18,000\",\"6,000\""
}
```

지원 source type:

- `baemin_orders_csv`
- `baemin_settlement_xlsx` (binary XLSX dependency는 후속 TODO, normalized rows/CSV 우선)
- `coupangeats_orders_csv`
- `coupangeats_settlement_xlsx` (binary XLSX dependency는 후속 TODO)
- `delivery_provider_normalized`

직접 로그인 자동화와 raw platform ID/password 저장은 하지 않는다.

## 4. Context Collection

```http
POST /api/v1/stores/:storeId/context/collect
GET /api/v1/stores/:storeId/pipeline-meta
GET /api/v1/stores/:storeId/context
```

Onboarding bootstrap:

```json
{
  "mode": "live",
  "reason": "store_onboarding_bootstrap"
}
```

Manual refresh:

```json
{
  "mode": "live",
  "reason": "manual_refresh"
}
```

Collector filter examples:

```json
{ "mode": "live", "collectors": ["naver_local_competitor_search"] }
{ "mode": "live", "collectors": ["naver_search_trend"] }
{ "mode": "live", "collectors": ["korean_holiday_calendar"] }
{ "mode": "live", "collectors": ["kakao_geocoding", "kma_weather"] }
```

Allowed `reason`:

- `store_onboarding_bootstrap`
- `manual_refresh`
- `scheduled_refresh`

## 5. Action Planner

```http
GET /api/v1/stores/:storeId/actions
PATCH /api/v1/stores/:storeId/actions/:actionId/status
```

PATCH body:

```json
{
  "status": "done",
  "planned_start_date": "2026-05-08",
  "planned_end_date": "2026-05-14"
}
```

Status:

- `recommended`
- `selected`
- `planned`
- `done`
- `dismissed`

`done`은 outcome tracking placeholder를 만들 수 있지만 실행 효과를 단정하지 않는다.

## 6. Connector Foundations

Toss Place secret path:

```text
/revenue-ops/revenue-dev/connectors/toss-place
```

Delivery provider secret path:

```text
/revenue-ops/revenue-dev/connectors/delivery-provider
```

별도 IAM 권한이 없으면 connector smoke는 skipped로 남고 앱 runtime은 실패하지 않는다.
