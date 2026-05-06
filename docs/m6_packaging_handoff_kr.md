# M6 Packaging Handoff

## 1. M6의 목적

M6는 기능을 더 크게 추가하는 단계가 아니라, 현재 완성된 Revenue Ops OS MVP를 **포트폴리오/시연/면접 설명 가능한 형태**로 정리하는 단계다.

현재 프로젝트는 단순 화면 데모가 아니라 아래 end-to-end 흐름을 갖는다.

```text
Revenue data/API demo dataset
→ Revenue Cockpit frontend
→ Cognito login
→ API Gateway JWT validation
→ Lambda Revenue API
→ Aurora-backed action status persistence
→ Action Planner state 유지
```

## 2. 현재까지 만든 것의 제품적 의미

이 프로젝트의 핵심은 “소상공인 매출 하락 원인 확정”이 아니라, **근거 기반 원인 후보와 실행 액션을 운영자가 추적 가능한 방식으로 다루는 Revenue Ops OS**다.

사용자에게 보여주는 메시지는 다음 원칙을 지킨다.

```text
- 인과관계를 단정하지 않는다.
- 가능성 높은 원인 후보로 표현한다.
- 매출 회복을 보장하지 않는다.
- 데이터 근거와 caution을 함께 제공한다.
- action status는 실제 운영 상태처럼 저장된다.
```

## 3. 포트폴리오에서 강조할 구조

### Product layer

```text
Revenue Cockpit
- Revenue Brief
- Cause Evidence
- Action Planner
- Data Reliability
```

### Data/API layer

```text
GET /api/v1/revenue/briefs
GET /api/v1/revenue/anomalies
GET /api/v1/revenue/actions
GET /api/v1/revenue/context
GET /api/v1/revenue/pipeline-meta
PATCH /api/v1/revenue/actions/:id/status
GET /api/v1/revenue/health/aurora
```

### Security layer

```text
Cognito Hosted UI
PKCE token exchange
sessionStorage token
Authorization: Bearer header
API Gateway JWT authorizer
OPTIONS no-auth CORS route
```

### Persistence layer

```text
Aurora PostgreSQL
Action status override
Action family persistence
Deduped action candidate response
Aurora health check
```

## 4. M6에서 작성해야 할 문서

권장 문서 위치는 `docs/`다.

```text
docs/m6_architecture_overview_kr.md
docs/m6_demo_guide_kr.md
docs/m6_screenshot_checklist_kr.md
docs/m6_final_validation_report_kr.md
docs/m6_presentation_interview_narrative_kr.md
docs/m6_route_use_guide_kr.md
docs/m6_closure_summary_kr.md
```

이 번들에는 그중 인증/보안 handoff와 M6 전환 checklist를 먼저 제공한다. 나머지는 이 문서들을 기반으로 확장하면 된다.

## 5. 시연 스토리라인

```text
1. Revenue Cockpit에 접속한다.
2. 로그인 전에는 Revenue API가 401로 보호됨을 보여준다.
3. Login with Cognito를 클릭한다.
4. Cognito Hosted UI에서 로그인한다.
5. Revenue Cockpit으로 돌아온다.
6. Network에서 token 교환과 Authorization header를 보여준다.
7. briefs/actions/context/pipeline-meta가 200으로 로드되는 것을 보여준다.
8. Action Planner에서 action status를 변경한다.
9. PATCH 200과 GET /actions refetch를 보여준다.
10. 새로고침 후 상태가 유지되는 것을 보여준다.
11. Logout 후 not signed in 상태와 API 401을 보여준다.
```

## 6. README에 넣을 핵심 문장

```text
This project is an evidence-backed Revenue Ops OS MVP for small merchants. It combines a Revenue Cockpit UI, authenticated Revenue API, Aurora-backed action persistence, and Cognito/API Gateway JWT security. The system does not claim proven causality; it surfaces likely cause candidates, supporting signals, and operational actions with explicit guardrails.
```

한국어 설명:

```text
본 프로젝트는 소상공인을 위한 근거 기반 Revenue Ops OS MVP입니다. 매출 하락을 단정적으로 설명하는 도구가 아니라, 관측된 매출 변화와 외부/운영 맥락 신호를 연결해 가능성 높은 원인 후보와 실행 액션을 제시하고, 그 실행 상태를 인증된 API와 Aurora persistence로 관리하는 구조입니다.
```

## 7. 스크린샷 체크 포인트

```text
01_revenue_cockpit_login_state.png
- overlay에 Cognito 이메일 표시
- Revenue Brief 화면

02_action_planner_persistence.png
- Action Planner 상태 컬럼
- Done/Planned/Recommended 상태 표시

03_network_authenticated_fetch.png
- briefs/actions/context 200
- Authorization: Bearer header는 토큰 본문을 가린 상태로 캡처

04_no_auth_401.png
- curl 또는 Network에서 no-auth 401

05_cors_preflight_204.png
- OPTIONS 204
- allow headers/methods 확인
```

토큰 원문, AWS secret 값, 개인 비밀번호는 캡처하지 않는다.

## 8. 남은 운영 전환 이슈

```text
- Refresh token 자동 갱신
- Token 만료 UX
- Multi-tenant user/store mapping
- RBAC/role-based route guard
- Real POS/order data ingestion
- Live external context data collection
- Terraform tfvars/secret handling 정리
- Custom domain 적용
- CloudWatch alarms/structured logs 강화
- CI/CD CloudFront invalidation 권한 최소화
```
