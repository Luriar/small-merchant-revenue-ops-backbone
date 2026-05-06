# Final Remaining Work After Xhigh Push

## 완료됨

- Aurora-backed SaaS repository 추가
- runtime factory로 Aurora 설정 시 Aurora repository 선택
- store access async 처리로 Aurora repository 접근 제어 보존
- production-lite DDL 구조 추가
- outbox/job/mart in-memory fixture 및 Aurora repository method 추가
- upload preview/rejected/reprocess endpoint 추가
- standard/Toss-style CSV parser foundation 추가
- public context collector v1 planning skeleton 추가
- Toss Place connector v0 skeleton 추가
- prod-lite/lakehouse-ready/platform-scale Terraform profile skeleton 추가

## 남은 작업

- 실제 Lambda package deploy 및 Aurora live smoke
- S3/SQS/EventBridge/Step Functions resource module wiring review
- live public data collector credential/terms review
- Baemin/Coupang parser preset 실제 sample file 기반 강화
- Toss Place official API schema 확인 후 adapter 구현
- Action outcome evaluator의 실제 result window 계산 강화

## 알려진 제한

- external API key 없이 seed/stub collector만 동작한다.
- platform-scale profile은 validate-ready skeleton이며 apply 대상이 아니다.
- Excel binary parsing은 구현하지 않았다.
- 인과를 단정하지 않고 함께 관측된 evidence로만 표현한다.

## 다음 권장 명령

```bash
node --test apps/api/src/revenue-ops/revenue-ops-saas-routes.test.js apps/api/src/revenue-ops/revenue-ops-saas-store-factory.test.js apps/api/src/revenue-ops/revenue-upload-parsers.test.js apps/api/src/revenue-ops/context-collectors.test.js apps/api/src/revenue-ops/runtime-boundaries.test.js
npm --prefix apps/web run check
npm --prefix apps/web run build
terraform -chdir=infra/terraform/envs/prod-lite validate
terraform -chdir=infra/terraform/envs/lakehouse-ready validate
terraform -chdir=infra/terraform/envs/platform-scale validate
```
