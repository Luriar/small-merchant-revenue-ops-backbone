# Small Merchant Revenue Ops Backbone

프로젝트 배경·기획 서사: [노션 포트폴리오](https://shining-antimatter-84a.notion.site/Product-Engineer-PM-PO-3c1267fbea3581afa806e3ee7cf780eb)

소상공인 매장의 매출 변화와 외부 맥락 데이터를 함께 분석해 “왜 매출이 변했는지”에 대한 원인 후보와 실행 가능한 운영 액션을 제안하는 Revenue Ops OS MVP입니다.

이 프로젝트는 단순 매출 대시보드가 아니라 매출 데이터·공개 맥락 데이터·외부 연동 상태·운영 액션을 하나의 흐름으로 연결하는 소상공인용 운영 판단 플랫폼을 목표로 합니다.

---

## 1. 프로젝트 개요

소상공인은 POS를 통해 주문·결제 데이터는 확보하지만 실제 운영에서는 다음 질문에 답하기 어렵습니다.

    왜 이번 주 매출이 떨어졌는가?
    어떤 메뉴, 시간대, 날씨, 지역 이벤트가 영향을 주었을 가능성이 있는가?
    지금 점주는 어떤 액션을 해야 하는가?
    이 판단을 신뢰할 수 있는 근거는 무엇인가?

본 프로젝트는 이러한 문제를 해결하기 위해 매장 매출 데이터와 외부 맥락 데이터를 함께 수집·정리하고 원인 후보와 실행 액션을 evidence 기반으로 제시합니다.

핵심 원칙은 다음과 같습니다.

    단정 대신 근거
    인과 확정 대신 원인 후보 제시
    매출 데이터와 외부 맥락의 추적 가능한 연결
    점주가 이해할 수 있는 운영 언어
    운영 배포 안정성을 갖춘 AWS 기반 SaaS 구조

---

## 2. 현재 제품 범위

현재 MVP는 다음 흐름을 지원합니다.

    1. 사용자 인증
    2. 매장 생성 및 매장 목록 조회
    3. 매장별 매출 데이터 등록/조회 기반
    4. 공개 맥락 데이터 수집
    5. Revenue Cockpit UI 제공
    6. 원인 후보 및 신뢰성 패널 제공
    7. Action Planner 기반 운영 액션 상태 관리
    8. AWS 배포 및 API runtime smoke test
    9. Lambda live alias 기반 배포 구조
    10. CodeDeploy canary deployment 및 rollback alarm 구조

현재 서비스는 개발/포트폴리오용 `revenue-dev` 환경을 기준으로 동작합니다.

---

## 3. 문제 정의

기존 POS·매출 관리 도구는 이미 발생한 결과를 보여주는 데 집중합니다.

하지만 실제 점주에게는 다음 질문에 대한 운영 판단이 필요합니다.

    그래서 왜 변했는가?
    무엇을 먼저 확인해야 하는가?
    어떤 운영 액션을 실행할 수 있는가?
    이 판단은 어떤 데이터 근거를 가지고 있는가?

따라서 본 프로젝트는 단순 시각화보다 매출 변화와 맥락 데이터를 연결해 운영 판단 가능한 형태로 바꾸는 데 집중합니다.

---

## 4. 핵심 가치

본 프로젝트가 제공하려는 가치는 다음과 같습니다.

    매출 변화 감지
    매출 변화와 외부 맥락의 연결
    원인 후보 제시
    근거 강도와 데이터 신뢰성 표시
    점주가 실행 가능한 액션 제안
    액션 상태 관리
    운영 배포 안정성을 갖춘 SaaS 기반 구조

이 시스템은 인과관계를 단정하지 않습니다.

예를 들어 “비가 와서 매출이 떨어졌다”고 말하는 대신, 다음과 같이 표현합니다.

    해당 기간 강수일 증가와 방문 고객 감소가 함께 관측되었습니다.
    매출 감소에 영향을 주었을 가능성이 있는 원인 후보입니다.
    추가 확인이 필요합니다.

이 프로젝트는 확신을 과장하기보다 운영 판단을 위한 근거 흐름을 정리하는 도구입니다.

---

## 5. 전체 아키텍처

현재 전체 구조는 다음과 같습니다.

    Frontend
    → CloudFront
    → S3 static hosting

    API
    → API Gateway HTTP API
    → Lambda alias: live
    → Lambda published version
    → Aurora PostgreSQL
    → Secrets Manager
    → External public context collectors

    배포 안정성
    → CodeDeploy Lambda canary deployment
    → CloudWatch rollback alarms
    → Terraform drift guard

---

## 6. AWS Runtime 구조

현재 API 호출 경로는 다음과 같습니다.

    API Gateway HTTP API
    → Lambda alias: live
    → Lambda version 3
    → Aurora PostgreSQL

API Gateway는 더 이상 Lambda function ARN을 직접 호출하지 않고, `live` Lambda alias를 통해 호출합니다.

이 구조는 CodeDeploy Lambda canary deployment를 가능하게 하기 위한 기반입니다.

---

## 7. CodeDeploy Canary 배포 구조

M7에서 CodeDeploy 기반 canary deployment 구조를 구성하고 실제 smoke deployment까지 검증했습니다.

현재 구성은 다음과 같습니다.

    CodeDeploy application:
    revenue-ops-revenue-dev-revenue-api

    CodeDeploy deployment group:
    revenue-ops-revenue-dev-revenue-api-live

    Deployment config:
    CodeDeployDefault.LambdaCanary10Percent5Minutes

    Deployment style:
    BLUE_GREEN
    WITH_TRAFFIC_CONTROL

Rollback 기준은 다음과 같습니다.

    DEPLOYMENT_FAILURE
    DEPLOYMENT_STOP_ON_ALARM
    DEPLOYMENT_STOP_ON_REQUEST

CloudWatch rollback alarms:

    revenue-ops-revenue-dev-revenue-api-live-errors
    revenue-ops-revenue-dev-revenue-api-live-throttles
    revenue-ops-revenue-dev-revenue-api-live-duration-p95
    revenue-ops-revenue-dev-revenue-api-gateway-5xx-canary

실제 canary smoke test에서는 다음 흐름을 검증했습니다.

    시작 상태:
    live alias → version 2

    Canary 상태:
    live alias → version 2
    AdditionalVersionWeights.3 = 0.1

    완료 상태:
    live alias → version 3
    RoutingConfig = null

Deployment ID:

    d-AFYQXLBFI

결과:

    deployment status = Succeeded
    errorInformation = null
    API smoke test 통과

---

## 8. Terraform Drift Guard

CodeDeploy는 운영 중 Lambda alias의 `function_version`과 `routing_config`를 변경합니다.

따라서 Terraform이 이후 plan/apply 과정에서 CodeDeploy가 변경한 alias 상태를 되돌리면 안 됩니다.

이를 방지하기 위해 `aws_lambda_alias.live`에 다음 lifecycle rule을 적용했습니다.

    ignore_changes:
    - function_version
    - routing_config

검증 결과:

    Terraform plan = No changes

즉, CodeDeploy가 live alias를 version 3으로 이동시킨 뒤에도 Terraform은 이를 drift로 판단해 되돌리지 않습니다.

---

## 9. IAM Hardening

M7에서 API Lambda runtime role의 불필요한 권한을 정리했습니다.

제거한 권한:

    ReadArtifacts
    s3:GetObject
    s3:ListBucket

유지한 runtime 권한:

    CloudWatch Logs write
    Aurora secret read
    Public context secret read
    Lambda VPC ENI access
    X-Ray write

API Lambda runtime role은 artifacts bucket read 권한 없이도 정상 동작함을 확인했습니다.

검증 결과:

    GET /api/v1/stores 정상
    POST /api/v1/stores/{store_id}/context/collect 정상

---

## 10. IAM 임시 권한 정리

M7 작업 중 `de-ai-12` 사용자에 임시로 부여했던 canary 배포 권한을 정리했습니다.

삭제한 customer managed policies:

    RevenueOpsApiGatewayIntegrationPatchAccess
    RevenueOpsCodeDeployCanaryReadAccess
    RevenueOpsCodeDeployCanaryManageAccess

유지한 최소 read-only policy:

    RevenueOpsCodeDeployTerraformReadAccess

현재 `de-ai-12`는 Terraform refresh를 위해 CodeDeploy read 권한은 갖지만 직접 canary deployment를 생성할 수는 없습니다.

허용되는 대표 작업:

    codedeploy:GetApplication
    codedeploy:GetDeploymentGroup
    codedeploy:GetDeployment

거부되는 대표 작업:

    codedeploy:CreateDeployment
    codedeploy:RegisterApplicationRevision

장기적으로 canary deployment 실행 권한은 개인 IAM user에서 GitHub Actions OIDC deploy role 또는 별도 deploy role로 이전해야 합니다.

---

## 11. Frontend

Frontend는 Vite + React 기반입니다.

주요 화면은 다음과 같습니다.

    Revenue Brief
    Revenue Cockpit
    Cause Evidence
    Data Reliability
    Action Planner

Revenue Cockpit은 다음 요소를 포함합니다.

    매출 요약
    매출 변화 원인 후보
    공개 맥락 데이터 수집 상태
    외부 연동 상태
    신뢰성 설명 패널
    운영 액션 플래너
    KO/EN language switch
    Light/Dark/System theme switch

UI 문구는 인과관계를 단정하지 않고 다음 표현을 우선합니다.

    함께 관측되었습니다
    가능성 높은 원인 후보
    추가 확인이 필요합니다
    원인 확정이 아니라 운영 판단을 위한 근거입니다

---

## 12. Backend

Backend는 Node.js 기반 API Lambda로 구성됩니다.

주요 역할은 다음과 같습니다.

    인증된 사용자 요청 처리
    매장 목록 조회
    매장 생성
    매장별 context collection trigger
    매출/맥락 데이터 API 제공
    Action Planner 상태 업데이트
    Aurora PostgreSQL 연동
    외부 공개 데이터 collector 실행

주요 API 예시는 다음과 같습니다.

    GET /api/v1/stores
    POST /api/v1/stores
    POST /api/v1/stores/{store_id}/context/collect
    GET /api/v1/revenue
    PATCH /api/v1/actions/{action_id}

---

## 13. Context Collection

현재 context collection은 매장별로 실행됩니다.

예시:

    POST /api/v1/stores/{store_id}/context/collect

수집 결과는 collector별 상태로 정리됩니다.

    completed
    skipped
    failed
    timed_out

M7 smoke 기준 정상 결과:

    collector_run_status = completed
    completed_collector_count = 8
    skipped_collector_count = 2
    failed_collector_count = 0
    timed_out_collector_count = 0

일부 외부 연동 connector는 secret 미설정 상태에서는 skipped 처리됩니다.

---

## 14. 로컬 개발

Repository root 기준으로 의존성을 설치합니다.

    npm ci
    npm --prefix apps/web ci

Frontend typecheck:

    npm --prefix apps/web run check

Frontend build:

    npm --prefix apps/web run build

Frontend dev server:

    npm --prefix apps/web run dev -- --host 0.0.0.0

Backend tests:

    node --test apps/api/src/revenue-ops/context-collectors.test.js
    node --test apps/api/src/revenue-ops/revenue-ops-saas-routes.test.js
    node --test apps/api/src/revenue-ops/revenue-upload-parsers.test.js

Backend syntax check:

    find apps/api/src -name "*.js" -print0 | xargs -0 -n1 node --check

---

## 15. Terraform

Terraform environment:

    infra/terraform/envs/revenue-dev

주요 명령:

    terraform -chdir=infra/terraform/envs/revenue-dev init
    terraform -chdir=infra/terraform/envs/revenue-dev plan
    terraform -chdir=infra/terraform/envs/revenue-dev apply

CI에서는 backend를 비활성화한 상태로 검증합니다.

    terraform -chdir=infra/terraform/envs/revenue-dev init -backend=false
    terraform -chdir=infra/terraform/envs/revenue-dev validate

중요한 로컬 tfvars 파일:

    terraform.step2f.jwt-enforcement.tfvars

이 파일은 의도적으로 `.gitignore` 대상이며 Git에 커밋하지 않습니다.

현재 중요한 값은 다음과 같습니다.

    enable_api_lambda_versioning = true
    enable_api_lambda_alias      = true
    api_lambda_alias_name        = "live"
    enable_api_codedeploy_canary = true
    api_codedeploy_deployment_config_name = "CodeDeployDefault.LambdaCanary10Percent5Minutes"

---

## 16. 배포 스크립트

Frontend deployment:

    scripts/deploy_frontend_release.sh

Lambda canary smoke runner:

    scripts/m7_codedeploy_canary_smoke.sh

Canary smoke runner는 다음 작업을 수행합니다.

    1. 현재 live alias version 확인
    2. Lambda $LATEST description marker 업데이트
    3. 새 Lambda version publish
    4. AppSpecContent와 sha256 생성
    5. CodeDeploy deployment 생성
    6. deployment 상태 polling
    7. 최종 alias 상태 확인
    8. API smoke test 실행
    9. Lambda $LATEST description 원복

주의:

    이 스크립트는 deployment 생성 권한이 있는 주체에서 실행해야 합니다.
    de-ai-12는 더 이상 CreateDeployment/RegisterApplicationRevision 권한을 갖지 않습니다.
    실제 운영 자동화에서는 GitHub OIDC deploy role 또는 별도 deploy role을 사용해야 합니다.

---

## 17. CI

GitHub Actions workflows:

    .github/workflows/ci.yml
    .github/workflows/deploy_manual.yml

CI 검증 항목:

    root dependencies
    web dependencies
    backend tests
    backend syntax
    Lambda package manifest
    frontend typecheck
    frontend build
    Terraform fmt
    Terraform init -backend=false
    Terraform validate

Node.js 20 Actions deprecation 대응 완료:

    actions/checkout@v5
    actions/setup-node@v5
    hashicorp/setup-terraform@v3 제거
    shell 기반 Terraform CLI 설치 step 사용

최신 확인된 CI:

    171f3d1 ci: update actions for node24 compatibility
    status = success

참고:

    workflow의 node-version: "20"은 프로젝트 빌드에 사용하는 Node.js 버전입니다.
    GitHub Action 자체 런타임 deprecation warning과는 별개입니다.

---

## 18. 주요 문서

M7 관련 문서:

    docs/m7_lambda_alias_cutover_kr.md
    docs/m7_codedeploy_canary_scaffold_kr.md
    docs/m7_codedeploy_canary_smoke_kr.md
    docs/m7_iam_temporary_access_cleanup_kr.md
    docs/m7_final_iam_cleanup_kr.md
    docs/m7_closure_summary_kr.md

M6 관련 문서:

    docs/m6_architecture_overview_kr.md
    docs/m6_closure_summary_kr.md
    docs/m6_demo_guide_kr.md
    docs/m6_final_validation_report_kr.md
    docs/m6_presentation_interview_narrative_kr.md
    docs/m6_route_use_guide_kr.md
    docs/m6_screenshot_checklist_kr.md

---

## 19. 현재 검증된 상태

M7 종료 기준 현재 API 호출 경로는 다음과 같습니다.

    API Gateway
    → Lambda alias: live
    → Lambda version 3

Runtime 검증:

    GET /api/v1/stores 정상
    POST /context/collect 정상

배포 구조:

    CodeDeploy application 존재
    CodeDeploy deployment group 존재
    Canary smoke deployment 성공
    Rollback alarm 존재

Terraform 상태:

    plan = No changes
    Lambda alias drift guard 적용 완료

IAM 상태:

    API Lambda runtime role 최소권한 정리 완료
    임시 배포 권한 정리 완료
    Terraform read-only CodeDeploy 권한만 유지

CI 상태:

    최신 main CI 성공
    Node.js 20 Actions deprecation warning 대응 완료

---

## 20. 남은 작업

M7 이후 남은 작업은 다음과 같습니다.

    1. 배포 실행 권한을 GitHub Actions OIDC deploy role로 이전
    2. Canary smoke runner를 manual deploy workflow에 연결할지 결정
    3. Revenue Cockpit UI polish 잔여 작업 마무리
    4. 포트폴리오 설명 문구와 스크린샷 업데이트
    5. 실제 POS/order 데이터 연동 확장
    6. 매장 데이터 등록/업로드 흐름 강화
    7. 운영 관측성 및 tenant isolation 강화
    8. 최종 데모 시나리오 정리

---

## 21. 포트폴리오 포지셔닝

소상공인 매출 운영 문제를 제품 관점에서 정의하고 이를 인증 API, 외부 맥락 수집, Aurora 기반 저장소, AWS serverless runtime, Terraform 인프라, CodeDeploy canary 배포 구조까지 연결한 end-to-end SaaS 플랫폼 프로젝트입니다.

강조할 수 있는 포인트는 다음과 같습니다.

    소상공인 대상 Revenue Ops OS 기획
    evidence 기반 원인 후보 제시
    인증 기반 API 설계
    외부 맥락 데이터 수집
    AWS Lambda/API Gateway/Aurora 기반 runtime
    Terraform 기반 인프라 관리
    Lambda live alias 기반 배포 구조
    CodeDeploy canary release safety
    rollback alarm 설계
    CI/CD hygiene

핵심 포지셔닝은 다음과 같습니다.

    Small Merchant Revenue Ops OS
    매출 판단을 위한 evidence-based operating layer
    운영 배포 안정성을 갖춘 AWS 기반 SaaS foundation

---

## 22. 프로젝트 철학

이 프로젝트는 약한 신호를 근거로 인과관계를 단정하지 않습니다.

목표는 사용자가 다음을 구조적으로 볼 수 있게 만드는 것입니다.

    무엇이 변했는가
    어떤 맥락 신호가 함께 관측되었는가
    어떤 근거가 이 해석을 뒷받침하는가
    지금 실행 가능한 액션은 무엇인가
    아직 사람의 판단이 필요한 부분은 무엇인가

이 시스템은 확신을 과장하지 않고 운영 판단에 필요한 근거 흐름을 정리합니다.
