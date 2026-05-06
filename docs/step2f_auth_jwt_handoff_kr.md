# STEP 2-F Auth/JWT Handoff

## 1. 현재 단계 결론

STEP 2-F 인증/보안 단계는 완료 상태로 본다.

현재 Revenue Cockpit은 다음 end-to-end 흐름까지 연결되어 있다.

```text
Cognito Hosted UI 로그인
→ PKCE authorization code flow
→ /oauth2/token token 교환
→ sessionStorage token 저장
→ Revenue API fetch에 Authorization: Bearer 자동 첨부
→ API Gateway JWT Authorizer 검증
→ Lambda
→ Aurora-backed action status persistence
```

핵심 보안 상태는 다음과 같다.

```text
토큰 없음:
GET /api/v1/revenue/briefs → 401 Unauthorized

로그인/token 있음:
GET /api/v1/revenue/briefs → 200
GET /api/v1/revenue/actions → 200
PATCH /api/v1/revenue/actions/:id/status → 200
```

CORS preflight도 정상화되어 브라우저 authenticated fetch가 동작한다.

```text
OPTIONS /api/v1/revenue/briefs → 204
access-control-allow-origin: https://d1fquuc7vsf9cu.cloudfront.net
access-control-allow-methods: GET,OPTIONS,PATCH
access-control-allow-headers: authorization,content-type
```

## 2. 관련 리소스

### Frontend

```text
CloudFront:
https://d1fquuc7vsf9cu.cloudfront.net

Revenue Cockpit route:
https://d1fquuc7vsf9cu.cloudfront.net/#revenue-cockpit?data=api
```

### API Gateway

```text
API endpoint:
https://7q8hxxta67.execute-api.ap-northeast-2.amazonaws.com

Protected route:
ANY /api/v1/revenue/{proxy+}
AuthorizationType: JWT
AuthorizerId: ouhk2j

CORS preflight route:
OPTIONS /api/v1/revenue/{proxy+}
AuthorizationType: NONE
```

### Cognito

```text
User Pool ID:
ap-northeast-2_8f9Mf4apQ

Web Client ID:
6ckcj7igctutanc2s6cjo3vjs7

Hosted UI base URL:
https://revenue-ops-dev-827913617635.auth.ap-northeast-2.amazoncognito.com

Issuer:
https://cognito-idp.ap-northeast-2.amazonaws.com/ap-northeast-2_8f9Mf4apQ
```

### Lambda/Aurora

```text
Lambda:
revenue-ops-revenue-dev-revenue-api

Aurora database:
revenue_ops

Aurora health route:
GET /api/v1/revenue/health/aurora
```

Secrets values are not documented here and should not be pasted into handoff notes.

## 3. 구현 범위

### 3.1 Aurora-backed Action Planner persistence

완료된 기능은 다음과 같다.

```text
Action status 변경
→ API Gateway
→ Lambda
→ Aurora PostgreSQL
→ action family 단위 persistence
→ GET /actions에서 dedup + status override merge
→ 프론트 refetch 및 저장 완료 UX 표시
```

중복 action candidate는 API 레벨에서 의미 단위로 정규화되며, 화면에는 3개 action으로 노출된다.

### 3.2 Cognito foundation

생성 완료:

```text
Cognito User Pool
Cognito Web Client
Cognito Hosted UI domain
테스트 유저
```

초기에는 API route를 `NONE`으로 유지한 상태에서 Cognito만 만들었고, 이후 token 교환과 frontend auth flow가 검증된 뒤 JWT enforcement를 적용했다.

### 3.3 Frontend auth bootstrap

추가된 프론트 흐름:

```text
Login 버튼 클릭
→ Cognito Hosted UI 이동
→ CloudFront /?code=...&state=... 로 복귀
→ frontend가 code/state 감지
→ /oauth2/token으로 token 교환
→ sessionStorage에 token 저장
→ Authorization header 자동 첨부
→ Revenue Cockpit API data refetch
```

중요 UX polish:

```text
로그인 후 F5 필요 없음
페이지 전체 reload 없이 auth event 기반 data refetch
callback 직후 token 교환 전 초기 401 fetch 방지
logout 후 Product Ops 기본 화면이 아니라 Revenue Cockpit으로 복귀
```

### 3.4 API Gateway JWT enforcement

적용 완료:

```text
ANY /api/v1/revenue/{proxy+}
authorization_type: NONE → JWT
identity source: $request.header.Authorization
issuer: Cognito issuer URL
audience: Cognito web client ID
```

CORS 때문에 `OPTIONS /api/v1/revenue/{proxy+}`는 `NONE`으로 별도 route를 두었다. 이 route가 없으면 브라우저 preflight가 JWT에 막혀 로그인 상태에서도 API 호출이 실패한다.

## 4. 주요 파일 변경

프론트:

```text
apps/web/src/App.tsx
apps/web/src/main.tsx
apps/web/src/revenue-cockpit/revenueCockpitAuth.ts
apps/web/src/revenue-cockpit/revenueCockpitAuthBootstrap.ts
apps/web/src/revenue-cockpit/revenueCockpitApi.ts
apps/web/src/revenue-cockpit/revenueCockpitCopy.ts
apps/web/src/revenue-cockpit/RevenueCockpitApp.tsx
```

Terraform:

```text
infra/terraform/envs/revenue-dev/outputs.tf
infra/terraform/modules/revenue_api_gateway_lambda/main.tf
infra/terraform/modules/revenue_api_gateway_lambda/variables.tf
infra/terraform/modules/revenue_cognito/main.tf
infra/terraform/modules/revenue_cognito/variables.tf
infra/terraform/modules/revenue_cognito/outputs.tf
```

커밋하지 않을 파일:

```text
terraform.step2f.cognito-only.tfvars
terraform.step2f.jwt-enforcement.tfvars
tfplan.step2f.*
apps/web/tsconfig.tsbuildinfo
local token json files
```

## 5. 다음 단계

2-F 기능 구현은 닫혔다. 다음은 M6 packaging이다.

```text
문서화:
- README 업데이트
- demo guide
- architecture overview
- auth/security handoff
- validation report
- screenshot checklist

시연:
- 로그인 전 API 401
- 로그인 후 Revenue Cockpit 200
- action status 변경 persistence
- logout 후 not signed in

운영/프로덕션 전환:
- refresh token handling 개선
- multi-tenant RBAC
- 운영 계정 관리
- custom domain/HTTPS 정식화
- CloudWatch alarm 강화
```
