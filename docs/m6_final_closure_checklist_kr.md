# M6 Final Closure Checklist

## 1. 현재 닫힌 기능

```text
[완료] Revenue Cockpit API mode
[완료] Gold/export demo data 기반 briefs/anomalies/actions/context/pipeline-meta API
[완료] Aurora health route
[완료] Lambda VPC access + Secrets Manager + Aurora connectivity
[완료] Action Planner status PATCH
[완료] Aurora-backed action status persistence
[완료] Action dedup + family persistence
[완료] Cognito User Pool / Web Client / Hosted UI
[완료] PKCE token exchange
[완료] Frontend login bootstrap
[완료] Authorization Bearer fetch
[완료] API Gateway JWT enforcement
[완료] OPTIONS CORS preflight 204
[완료] no-auth 401
[완료] login 후 no-refresh data refetch
[완료] logout 후 Revenue Cockpit 복귀
```

## 2. M6 문서화 체크리스트

```text
[ ] README 업데이트
[ ] docs/m6_architecture_overview_kr.md 작성
[ ] docs/m6_demo_guide_kr.md 작성
[ ] docs/m6_screenshot_checklist_kr.md 작성
[ ] docs/m6_final_validation_report_kr.md 작성
[ ] docs/m6_presentation_interview_narrative_kr.md 작성
[ ] docs/m6_route_use_guide_kr.md 작성
[ ] docs/m6_closure_summary_kr.md 작성
[ ] docs/step2f_auth_jwt_handoff_kr.md 추가
[ ] docs/step2f_auth_validation_report_kr.md 추가
[ ] docs/step2f_auth_operations_runbook_kr.md 추가
```

## 3. 최종 검증 체크리스트

### 로컬 빌드

```bash
npm --prefix apps/web run check
npm --prefix apps/web run build
```

### API no-auth

```bash
API_BASE="https://7q8hxxta67.execute-api.ap-northeast-2.amazonaws.com"

curl -sS -o /tmp/briefs.noauth.json -w "briefs no-auth HTTP %{http_code}
"   "$API_BASE/api/v1/revenue/briefs"
```

기대:

```text
briefs no-auth HTTP 401
```

### CORS preflight

```bash
curl -i -sS -X OPTIONS "$API_BASE/api/v1/revenue/briefs"   -H "Origin: https://d1fquuc7vsf9cu.cloudfront.net"   -H "Access-Control-Request-Method: GET"   -H "Access-Control-Request-Headers: authorization" | sed -n '1,30p'
```

기대:

```text
HTTP/2 204
access-control-allow-headers: authorization,content-type
```

### Browser auth

```text
[ ] Revenue Cockpit 접속
[ ] Login 클릭
[ ] Cognito Hosted UI 로그인
[ ] overlay에 이메일 표시
[ ] briefs/anomalies/actions/context/pipeline-meta 200
[ ] Request Headers에 Authorization: Bearer 표시
[ ] PATCH status 200
[ ] 새로고침 후 action status 유지
[ ] Logout 후 not signed in 표시
```

## 4. Git hygiene

커밋하면 안 되는 것:

```text
apps/web/tsconfig.tsbuildinfo
terraform.step2f.*.tfvars
tfplan.step2f.*
/tmp/*.json
로컬 token 파일
enable_cognito_authorizer
tsc
```

권장 커밋:

```bash
git add docs/*.md
git commit -m "docs: add step 2f handoff and m6 packaging notes"
```

## 5. 데모 시 주의사항

```text
- Access token 원문을 화면에 노출하지 않는다.
- Cognito 테스트 계정 비밀번호를 절대 공유하지 않는다.
- Secret ARN은 가능하면 문서에는 최소화한다.
- Aurora password/SecretString은 캡처하지 않는다.
- Authorization header는 존재만 보여주고 token body는 가린다.
```

## 6. 다음 단계 후보

```text
1. Refresh token 자동 갱신
2. User/store tenant mapping
3. Real POS data ingestion
4. External context live collector
5. Admin/user role separation
6. Terraform production profile 정리
7. CI/CD pipeline 문서화
8. Observability dashboard
```

## 7. 최종 closure 문장

```text
M6 closure 기준으로 본 프로젝트는 Revenue Cockpit UI, authenticated Revenue API, Aurora-backed action persistence, and Cognito/API Gateway JWT security까지 연결된 end-to-end MVP 상태다. 이후 작업은 기능 구현보다는 포트폴리오 패키징, 운영 안정화, 실제 데이터 연동, multi-tenant productionization으로 이동한다.
```
