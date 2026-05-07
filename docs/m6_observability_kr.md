# M6 Observability

## 원칙
M6는 CloudWatch-first가 맞다. 현재 runtime은 CloudFront/S3, API Gateway, Lambda, Aurora, Cognito, NAT로 충분히 작고, Grafana/Prometheus 운영 비용을 정당화할 정도의 multi-cluster metric surface가 아니다.

## 현재 Alarm Set
- Lambda Errors
- Lambda Throttles
- Lambda Duration p95
- API Gateway 5XX
- CloudFront 5XX error rate
- CodeDeploy canary rollback alarms: alias Errors, alias Throttles, alias Duration p95, API Gateway 5XX

## Collector 상태 해석
- Kakao/KMA/Seoul/Naver/Holiday 완료는 정상 수집.
- Toss Place와 배달앱 provider는 credential 미설정 시 `연동 대기`다.
- skipped foundation connector는 실패로 계산하지 않는다.
- partial failure는 현재 수집된 데이터만으로 초기 분석을 시작하되 추가 확인이 필요하다고 표시한다.

## Grafana/Prometheus가 아직 필수가 아닌 이유
- EKS/MSK/ClickHouse 운영이 active가 아니다.
- Lambda/API Gateway/Aurora는 CloudWatch native metric과 alarm으로 충분하다.
- 운영자가 직접 볼 대시보드보다 release rollback readiness가 우선이다.

## Grafana가 유용해지는 시점
- MSK consumer lag, Debezium connector state, ClickHouse MV freshness를 한 화면에서 봐야 할 때.
- worker Lambda/EventBridge/SQS가 늘어나 cross-service SLO가 필요할 때.
- customer-facing tenant별 SLO와 internal platform SLO를 분리해야 할 때.

## 추가 관측 노트
- NAT Gateway bytes/cost: 외부 API 수집이 커질 때 비용 급등을 감시한다.
- Aurora: ACU utilization, connection count, storage, write latency, backup/restore readiness를 추가한다.
- CloudFront: global metrics는 us-east-1/Global dimension 특성이 있으므로 Terraform provider region 검증 후 확장한다.

## 검증 명령
```bash
aws cloudwatch describe-alarms --region ap-northeast-2
aws lambda get-function-configuration --function-name revenue-ops-revenue-dev-revenue-api --region ap-northeast-2
aws apigatewayv2 get-apis --region ap-northeast-2
```
