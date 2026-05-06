# STEP 2-F Auth Operations Runbook

## 1. 개요

이 runbook은 Revenue Cockpit의 Cognito/JWT 인증 플로우 운영과 문제 복구 절차를 정리한다.

현재 구조:

```text
CloudFront frontend
→ Cognito Hosted UI
→ browser sessionStorage token
→ API Gateway JWT authorizer
→ Lambda
→ Aurora
```

## 2. 정상 사용자 흐름

### 로그인

```text
1. https://d1fquuc7vsf9cu.cloudfront.net/#revenue-cockpit?data=api 접속
2. 오른쪽 위 Login 클릭
3. Cognito Hosted UI 이동
4. 테스트 계정 로그인
5. CloudFront로 복귀
6. overlay에 Cognito: <email> 표시
7. briefs/actions/context/pipeline-meta 200
```

### 로그아웃

```text
1. 오른쪽 위 Logout 클릭
2. Cognito logout 수행
3. CloudFront로 복귀
4. Revenue Cockpit으로 다시 이동
5. overlay에 Cognito: not signed in 표시
6. Revenue API 요청은 401 또는 fallback
```

## 3. 문제별 진단

### 로그인했는데 API가 401

Network에서 API 요청의 Request Headers를 확인한다.

정상:

```text
Authorization: Bearer <token>
```

없으면 frontend token 저장 또는 `revenueCockpitApi.ts` auth header 첨부 문제다. 있는데 401이면 token 만료, issuer/audience mismatch, authorizer config mismatch를 의심한다.

확인 명령:

```bash
aws apigatewayv2 get-route   --api-id 7q8hxxta67   --route-id 66mfcpb   --region ap-northeast-2   --query '{RouteKey:RouteKey,AuthorizationType:AuthorizationType,AuthorizerId:AuthorizerId}'   --output json
```

### 브라우저 preflight 401

확인:

```bash
curl -i -sS -X OPTIONS "https://7q8hxxta67.execute-api.ap-northeast-2.amazonaws.com/api/v1/revenue/briefs"   -H "Origin: https://d1fquuc7vsf9cu.cloudfront.net"   -H "Access-Control-Request-Method: GET"   -H "Access-Control-Request-Headers: authorization" | sed -n '1,30p'
```

정상:

```text
HTTP/2 204
access-control-allow-headers: authorization,content-type
```

### no-auth가 200으로 열림

확인:

```bash
curl -i -sS "https://7q8hxxta67.execute-api.ap-northeast-2.amazonaws.com/api/v1/revenue/briefs" | sed -n '1,20p'
```

정상:

```text
HTTP/2 401
```

모든 route 확인:

```bash
aws apigatewayv2 get-routes   --api-id 7q8hxxta67   --region ap-northeast-2   --query 'Items[].{RouteId:RouteId,RouteKey:RouteKey,AuthorizationType:AuthorizationType,AuthorizerId:AuthorizerId}'   --output table
```

### CLI token이 401

브라우저는 200인데 CLI가 401이면 보통 `/tmp` token 만료다.

확인:

```bash
python3 - <<'PYTOKENCHECK'
import base64, json, time
from pathlib import Path

tokens = json.loads(Path('/tmp/revenue_ops_cognito_tokens.json').read_text())

def decode_payload(jwt):
    payload = jwt.split('.')[1]
    payload += '=' * (-len(payload) % 4)
    return json.loads(base64.urlsafe_b64decode(payload.encode()))

print('now:', int(time.time()))
for name in ['id_token', 'access_token']:
    token = tokens.get(name)
    if not token:
        print(name, 'missing')
        continue
    claims = decode_payload(token)
    print(name, 'exp=', claims.get('exp'), 'expired=', claims.get('exp', 0) < int(time.time()))
PYTOKENCHECK
```

## 4. 배포 명령

```bash
npm --prefix apps/web run check
npm --prefix apps/web run build

aws s3 sync apps/web/dist/   s3://revenue-ops-frontend-dev-827913617635/   --delete

aws cloudfront create-invalidation   --distribution-id E31KH7PFML1A6N   --paths "/*"
```

## 5. Git hygiene

커밋하지 않을 것:

```text
apps/web/tsconfig.tsbuildinfo
terraform.step2f.*.tfvars
tfplan.step2f.*
/tmp/*.json
로컬 token 파일
enable_cognito_authorizer
tsc
```
