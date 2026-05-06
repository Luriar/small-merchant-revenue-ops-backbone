# STEP 3.6 Live Route and Deployment Wiring

## 배경

Live API smoke에서 `/api/v1/stores`가 처음에는 `404 {"message":"Not Found"}`를 반환했다. Lambda handler가 아니라 API Gateway route set이 원인이었다.

당시 API Gateway에는 아래 route만 있었다.

- `ANY /api/v1/revenue/{proxy+}`
- `OPTIONS /api/v1/revenue/{proxy+}`

사용자가 live API Gateway를 수동 hotfix했고, 이후 no-auth 요청은 401로 바뀌었다. 이는 route가 Lambda/JWT authorizer까지 도달한다는 의미다. 오래된 ID token 요청은 `invalid_token expired` 401이었고, 이는 route 문제가 아니라 token freshness 문제다.

## Terraform Persistence

Terraform module `infra/terraform/modules/revenue_api_gateway_lambda`에 아래 route를 추가했다.

- `ANY /api/v1/me`
- `OPTIONS /api/v1/me`
- `ANY /api/v1/stores`
- `OPTIONS /api/v1/stores`
- `ANY /api/v1/stores/{proxy+}`
- `OPTIONS /api/v1/stores/{proxy+}`

기존 route는 유지했다.

- `ANY /api/v1/revenue/{proxy+}`
- `OPTIONS /api/v1/revenue/{proxy+}`

`ANY` route는 Cognito JWT authorizer를 사용하고, `OPTIONS` route는 `authorization_type = "NONE"`이다. 모든 route는 기존 Lambda integration을 사용한다.

## Imported Live Routes

수동 hotfix로 이미 존재하던 route를 Terraform state에 import했다.

- `module.revenue_api.aws_apigatewayv2_route.me[0]` -> `7q8hxxta67/h72gc12`
- `module.revenue_api.aws_apigatewayv2_route.me_options[0]` -> `7q8hxxta67/dyxpr3o`
- `module.revenue_api.aws_apigatewayv2_route.stores[0]` -> `7q8hxxta67/rjxtn9v`
- `module.revenue_api.aws_apigatewayv2_route.stores_options[0]` -> `7q8hxxta67/bunvkxs`
- `module.revenue_api.aws_apigatewayv2_route.stores_proxy[0]` -> `7q8hxxta67/zsfdf5v`
- `module.revenue_api.aws_apigatewayv2_route.stores_proxy_options[0]` -> `7q8hxxta67/qn3ianp`

## Apply Result

Saved plan `tfplan.step3_6.routes`:

- create: 0
- update: 1
- delete: 0
- replace: 0

Only change:

- `module.revenue_api.aws_apigatewayv2_api.api[0]`
- CORS `allow_methods`에 `POST` 추가

Apply result:

- 0 added
- 1 changed
- 0 destroyed

Post-apply plan:

- No changes

## Lambda Package Wiring

Package script now includes Step 3.5 runtime files:

- `revenue-ops-saas-aurora-store.js`
- `revenue-ops-saas-store-factory.js`
- `revenue-upload-parsers.js`
- `runtime-boundaries.js`
- `context-collectors.js`
- `connectors/toss-place-client.js`
- `revenue_ops_step3_4_lite.sql`

`scripts/validate_step3_lambda_package_manifest.js` verifies that the package script includes these files.

## Fresh-token Smoke Commands

The user still needs to rerun with a fresh `ID_TOKEN`.

```bash
API_BASE="https://7q8hxxta67.execute-api.ap-northeast-2.amazonaws.com"

curl -i "$API_BASE/api/v1/stores"

curl -i "$API_BASE/api/v1/stores" \
  -H "Authorization: Bearer $ID_TOKEN"

curl -i "$API_BASE/api/v1/me" \
  -H "Authorization: Bearer $ID_TOKEN"

curl -i "$API_BASE/api/v1/stores/$STORE_ID/pipeline-meta" \
  -H "Authorization: Bearer $ID_TOKEN"
```

Expected:

- no auth -> 401
- fresh valid JWT -> Lambda-backed JSON response
- expired token -> 401 `invalid_token`
