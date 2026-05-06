# STEP 2-F Auth/JWT Validation Report

## 1. 목적

이 문서는 STEP 2-F 인증/보안 작업의 검증 기준과 통과 결과를 정리한다.

목표는 다음이었다.

```text
Cognito 로그인 사용자는 Revenue API 접근 가능
비로그인 사용자는 Revenue API 직접 접근 불가
브라우저 CORS preflight 정상
Action Planner Aurora persistence 흐름 유지
```

## 2. 검증 요약

| 영역 | 기대 결과 | 실제 상태 |
|---|---:|---:|
| Cognito Hosted UI 로그인 | 성공 | 통과 |
| PKCE token 교환 | access/id/refresh token 발급 | 통과 |
| Frontend token 저장 | sessionStorage 저장 | 통과 |
| API Authorization header | Bearer token 자동 첨부 | 통과 |
| API Gateway route | NONE → JWT | 통과 |
| No-auth API | 401 | 통과 |
| Auth API | 200 | 통과 |
| CORS preflight | 204 | 통과 |
| Login 후 F5 불필요 | auth event 기반 refetch | 통과 |
| Logout 후 route | Revenue Cockpit 복귀 | 통과 |

## 3. 핵심 검증 명령

### 3.1 API Gateway route 확인

```bash
aws apigatewayv2 get-route   --api-id 7q8hxxta67   --route-id 66mfcpb   --region ap-northeast-2   --query '{RouteKey:RouteKey,AuthorizationType:AuthorizationType,AuthorizerId:AuthorizerId,Target:Target}'   --output json
```

기대:

```json
{
  "RouteKey": "ANY /api/v1/revenue/{proxy+}",
  "AuthorizationType": "JWT",
  "AuthorizerId": "ouhk2j",
  "Target": "integrations/7igynih"
}
```

### 3.2 모든 route 확인

```bash
aws apigatewayv2 get-routes   --api-id 7q8hxxta67   --region ap-northeast-2   --query 'Items[].{RouteId:RouteId,RouteKey:RouteKey,AuthorizationType:AuthorizationType,AuthorizerId:AuthorizerId,Target:Target}'   --output table
```

기대:

```text
ANY /api/v1/revenue/{proxy+}      JWT
OPTIONS /api/v1/revenue/{proxy+}  NONE
```

### 3.3 Stage 확인

```bash
aws apigatewayv2 get-stage   --api-id 7q8hxxta67   --stage-name '$default'   --region ap-northeast-2   --query '{StageName:StageName,AutoDeploy:AutoDeploy,DeploymentId:DeploymentId,LastUpdatedDate:LastUpdatedDate}'   --output json
```

기대:

```json
{
  "StageName": "$default",
  "AutoDeploy": true
}
```

### 3.4 No-auth API 차단 확인

```bash
API_BASE="https://7q8hxxta67.execute-api.ap-northeast-2.amazonaws.com"

curl -i -sS "$API_BASE/api/v1/revenue/briefs" | sed -n '1,20p'
```

기대:

```text
HTTP/2 401
{"message":"Unauthorized"}
```

### 3.5 CORS preflight 확인

```bash
API_BASE="https://7q8hxxta67.execute-api.ap-northeast-2.amazonaws.com"

curl -i -sS -X OPTIONS "$API_BASE/api/v1/revenue/briefs"   -H "Origin: https://d1fquuc7vsf9cu.cloudfront.net"   -H "Access-Control-Request-Method: GET"   -H "Access-Control-Request-Headers: authorization" | sed -n '1,30p'
```

기대:

```text
HTTP/2 204
access-control-allow-origin: https://d1fquuc7vsf9cu.cloudfront.net
access-control-allow-methods: GET,OPTIONS,PATCH
access-control-allow-headers: authorization,content-type
```

### 3.6 Browser auth 확인

```text
Revenue Cockpit 로그인 상태
→ Network request headers에 Authorization: Bearer ... 표시
→ briefs/anomalies/actions/context/pipeline-meta 200
→ Action status PATCH 200
```

주의: `/tmp/revenue_ops_cognito_tokens.json`의 access token은 만료될 수 있다. 토큰 만료 시 CLI는 401이 정상이다.

## 4. 해결한 이슈

### API route apply 실패

```text
증상: apigateway:PATCH AccessDenied
해결: managed policy에 apigateway:GET, apigateway:PATCH 추가 후 route update 재apply
```

### Terraform state와 실제 AWS route 불일치 의심

```text
증상: terraform state show는 JWT처럼 보였지만 no-auth curl은 200
해결: aws apigatewayv2 get-route로 실제 route 확인 후 재apply
```

### 브라우저 preflight 401

```text
증상: 로그인 상태에서 Authorization header를 붙이면 OPTIONS preflight가 401
해결: OPTIONS /api/v1/revenue/{proxy+} route를 authorization NONE으로 추가
```

### 로그인 후 F5 필요

```text
증상: token 저장 후 RevenueCockpitApp data fetch가 재실행되지 않음
해결: revenue-ops-auth-changed custom event + API effect dependency 추가
```

### Logout 후 Product Ops 기본 화면 이동

```text
증상: Cognito logout 후 CloudFront root로 돌아가 기존 TraceOps 화면 표시
해결: 프론트 sessionStorage marker로 Revenue Cockpit 복귀 처리
```

## 5. 최종 판정

STEP 2-F는 완료 상태다.

```text
no-auth 401
preflight 204
auth API 200
no-refresh login refetch
logout Revenue Cockpit 복귀
```
