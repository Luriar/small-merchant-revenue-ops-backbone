# Xhigh Push Validation Report

## 변경 범위 요약

- Aurora-backed SaaS runtime repository/factory
- production-lite DDL extension
- upload preview/rejected/reprocess API
- CSV parser foundation
- public context collector plan skeleton
- runtime boundary skeletons
- Toss Place connector v0 skeleton
- prod-lite/lakehouse-ready/platform-scale Terraform profile skeletons

## API Test

```bash
node --test apps/api/src/revenue-ops/revenue-ops-routes.test.js apps/api/src/revenue-ops/revenue-ops-saas-routes.test.js apps/api/src/revenue-ops/revenue-ops-store.test.js apps/api/src/revenue-ops/aurora-health.test.js apps/api/src/revenue-ops/revenue-ops-saas-store-factory.test.js apps/api/src/revenue-ops/revenue-upload-parsers.test.js apps/api/src/revenue-ops/context-collectors.test.js apps/api/src/revenue-ops/runtime-boundaries.test.js apps/api/src/lambda-handler.test.js
```

결과:

- tests 31
- pass 31
- fail 0

## Frontend

```bash
npm --prefix apps/web run check
npm --prefix apps/web run lint
npm --prefix apps/web run build
```

결과:

- check pass
- lint pass
- build pass
- Vite output: `dist/index.html`, CSS bundle, JS bundle 생성

## API npm scripts

```bash
npm --prefix apps/api test
npm --prefix apps/api run build
```

결과:

- 실행 불가
- 이유: `apps/api/package.json` 없음
- 대체 검증: root-level `node --test`와 `node --check`

## Terraform

```bash
terraform fmt -recursive -check infra/terraform
terraform -chdir=infra/terraform/envs/revenue-dev validate
terraform -chdir=infra/terraform/envs/prod-lite validate
terraform -chdir=infra/terraform/envs/lakehouse-ready validate
terraform -chdir=infra/terraform/envs/platform-scale validate
```

결과:

- fmt check pass
- revenue-dev validate pass after rerun outside sandbox; sandbox run could not execute existing provider plugins
- prod-lite validate pass
- lakehouse-ready validate pass
- platform-scale validate pass

## Terraform Plans

No-resource skeleton plan results:

- prod-lite: output-only plan, no real infrastructure resources
- lakehouse-ready: output-only plan, no real infrastructure resources
- platform-scale: output-only plan, no real infrastructure resources

## Known Limitations

- 실제 Aurora live smoke/deploy는 수행하지 않았다.
- profile skeletons는 validate-ready/output-only이며 apply 대상이 아니다.
- external public API calls are not made without keys.
- Excel binary parsing is intentionally not implemented.
