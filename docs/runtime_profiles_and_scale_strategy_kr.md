# Runtime Profiles and Scale Strategy

## 전략 문구

Production-lite runtime. Lakehouse-ready data foundation. Platform-scale Terraform expansion.

## prod-lite

초기 유료 SaaS runtime이다. 낮은 비용으로 실제 운영 가능한 구성을 목표로 한다.

- Aurora: operational source of truth
- API Gateway + Lambda: authenticated API runtime
- S3 Bronze: upload/context raw archive path
- SQS/DLQ: discrete async jobs
- EventBridge Scheduler: disabled/reviewed schedules
- Step Functions: workflow skeleton or low-volume orchestration
- ClickHouse/MSK/Airflow/CDC: disabled

## lakehouse-ready

장기 보관, 재처리, 비용 효율 분석을 위한 S3/Athena/Glue profile이다.

- S3 partition conventions
- Glue Catalog/Athena workgroup skeleton
- Iceberg/S3 table path는 provider support 검토 후 활성화
- ClickHouse/MSK/Airflow는 기본 비활성

## platform-scale

대규모 이벤트/분석 확장 profile이다. 비용과 운영 부담이 크므로 기본 비활성이다.

- ClickHouse: low-latency analytical read model
- MSK: high-volume event backbone
- Airflow: complex DAG/backfill orchestration
- CDC: Aurora-to-read-model propagation
- Worker runtime: long-running consumers

## 왜 SQS 먼저인가

초기 Revenue Ops job은 upload parse, context collect, mart build, outcome eval처럼 discrete job 성격이 강하다. MSK는 처리량과 복잡도 요구가 명확해진 뒤 켠다.

## 왜 Step Functions 먼저인가

초기 workflow는 짧고 명확하다. Airflow는 백필, 다중 dataset dependency, 운영자가 보는 DAG 필요성이 커질 때 도입한다.

## 왜 S3 Iceberg/Athena 먼저인가

장기 원천/정규화 데이터는 cold/low-cost archive 성격이 강하다. ClickHouse는 반복 interactive query, CDC, near-real-time read model 요구가 커질 때 도입한다.
