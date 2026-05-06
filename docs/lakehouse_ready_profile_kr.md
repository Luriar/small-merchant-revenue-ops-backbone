# Lakehouse-ready Profile

## 목적

Aurora operational data를 장기 보관/재처리 가능한 S3 lakehouse path로 확장하기 위한 profile이다. 현재는 validate-ready skeleton이며 비용 발생 resource는 생성하지 않는다.

## Partition Convention

- `dataset=revenue_daily_facts/year=YYYY/month=MM/day=DD/`
- `dataset=revenue_item_facts/year=YYYY/month=MM/day=DD/`
- `dataset=context_observations/year=YYYY/month=MM/day=DD/`
- `dataset=store_revenue_daily_mart/year=YYYY/month=MM/day=DD/`

## Planned Tables

- `revenue_daily_facts`
- `revenue_item_facts`
- `context_observations`
- `store_revenue_daily_mart`

## Sample Athena Queries

```sql
SELECT business_date, net_sales_amount, order_count
FROM revenue_daily_facts
WHERE store_id = 'store_123'
ORDER BY business_date DESC
LIMIT 30;
```

```sql
SELECT business_date, rain_mm, benchmark_delta_pct, net_sales_amount
FROM store_revenue_daily_mart
WHERE store_id = 'store_123'
  AND business_date BETWEEN DATE '2026-04-01' AND DATE '2026-04-30';
```

## ClickHouse와 차이

Lakehouse-ready는 cold archive/reprocess/query 비용 최적화가 목적이다. ClickHouse는 high-concurrency interactive read model 요구가 생길 때 켠다.
