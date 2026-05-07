# M7 Closure Summary

## 목적

M7의 목적은 Revenue Ops API의 운영 배포 안전성을 강화하는 것이었다.

핵심 범위는 다음과 같다.

    1. API Lambda runtime IAM 최소권한 정리
    2. API Gateway → Lambda live alias 전환
    3. CodeDeploy Lambda canary scaffold 구성
    4. 실제 canary smoke deployment 검증
    5. Terraform drift guard 적용
    6. canary smoke runner 스크립트화
    7. 임시 IAM 권한 1차 정리

## 완료 항목

### 1. API Lambda runtime IAM hardening

API Lambda execution role에서 runtime에 불필요한 artifacts bucket read 권한을 제거했다.

제거 대상:

    ReadArtifacts
    s3:GetObject
    s3:ListBucket

유지된 권한:

    CloudWatch Logs write
    Aurora secret read
    Public context secret read
    Lambda VPC ENI access
    X-Ray write

검증 결과:

    Terraform apply 성공
    실제 IAM policy 확인 완료
    GET /api/v1/stores smoke test 통과
    POST /context/collect smoke test 통과

관련 커밋:

    ab5f9eb chore(iam): remove unused artifact read from api lambda role

### 2. Lambda live alias cutover

API Gateway가 Lambda function ARN을 직접 호출하지 않고, live Lambda alias를 호출하도록 전환했다.

적용 후 구조:

    API Gateway HTTP API
    → Lambda alias: live
    → Lambda published version

검증 결과:

    live alias 생성 완료
    API Gateway integration URI가 :live/invocations 를 바라봄
    Terraform no-change 확인
    API smoke test 통과

관련 문서:

    docs/m7_lambda_alias_cutover_kr.md

### 3. CodeDeploy Canary scaffold 구성

CodeDeploy Lambda canary deployment를 위한 application, deployment group, service role, rollback alarms를 구성했다.

생성 리소스:

    CodeDeploy application
    CodeDeploy deployment group
    CodeDeploy service role
    CloudWatch rollback alarms

Deployment config:

    CodeDeployDefault.LambdaCanary10Percent5Minutes

Deployment style:

    BLUE_GREEN
    WITH_TRAFFIC_CONTROL

Rollback 기준:

    DEPLOYMENT_FAILURE
    DEPLOYMENT_STOP_ON_ALARM
    DEPLOYMENT_STOP_ON_REQUEST

관련 문서:

    docs/m7_codedeploy_canary_scaffold_kr.md

### 4. 실제 Canary smoke deployment 검증

실제 CodeDeploy deployment를 생성하여 live alias traffic shifting을 검증했다.

검증 흐름:

    시작: live alias → version 2
    Target: version 3
    Canary: version 3에 10% traffic
    완료: live alias → version 3
    RoutingConfig = null

Deployment ID:

    d-AFYQXLBFI

검증 결과:

    deployment status = Succeeded
    errorInformation = null
    GET /api/v1/stores 정상
    POST /context/collect 정상

관련 문서:

    docs/m7_codedeploy_canary_smoke_kr.md

### 5. Terraform drift guard 적용

CodeDeploy가 live alias의 function_version과 routing_config를 운영 중 변경하므로, Terraform이 이를 되돌리지 않도록 drift guard를 적용했다.

적용 대상:

    aws_lambda_alias.live

적용 내용:

    ignore_changes:
    - function_version
    - routing_config

검증 결과:

    Terraform plan = No changes

관련 커밋:

    a3eb8f3 chore(terraform): let codedeploy manage lambda alias traffic

### 6. Canary smoke runner 스크립트화

수동 검증한 canary smoke deployment 절차를 스크립트화했다.

스크립트:

    scripts/m7_codedeploy_canary_smoke.sh

수행 항목:

    현재 live alias version 확인
    Lambda description marker 업데이트
    새 Lambda version publish
    AppSpecContent + sha256 생성
    CodeDeploy deployment 생성
    deployment polling
    API smoke test
    Lambda $LATEST description 원복

관련 커밋:

    57c3425 chore(scripts): add codedeploy canary smoke runner

### 7. 임시 IAM 권한 정리

alias cutover와 canary 검증 중 임시로 부여한 권한 중 더 이상 필요 없는 권한을 제거했다.

삭제 완료:

    RevenueOpsApiGatewayIntegrationPatchAccess
    RevenueOpsCodeDeployCanaryReadAccess

유지:

    RevenueOpsCodeDeployCanaryManageAccess

유지 이유:

    scripts/m7_codedeploy_canary_smoke.sh 실행에 필요한 CodeDeploy deployment 생성 권한이 아직 de-ai-12에 필요하다.

관련 문서:

    docs/m7_iam_temporary_access_cleanup_kr.md

## 현재 운영 상태

현재 API 호출 경로:

    API Gateway
    → Lambda alias: live
    → Lambda version 3

현재 canary 기반:

    CodeDeploy app 존재
    CodeDeploy deployment group 존재
    Rollback alarms 존재
    Canary smoke runner 존재
    Terraform drift guard 적용됨

## 남은 작업

M7 이후 남은 작업은 다음과 같다.

    1. RevenueOpsCodeDeployCanaryManageAccess를 de-ai-12에서 제거하고 deploy 전용 role 또는 GitHub OIDC role로 이전
    2. GitHub Actions Node.js 20 deprecation warning 대응
    3. Canary runner를 CI/CD workflow에 연결할지 여부 결정
    4. UI polish 잔여 작업 재개
    5. M7 README / portfolio narrative 업데이트

## 결론

M7은 단순 문서화가 아니라 실제 운영 배포 안전성 계층을 추가한 단계다.

이번 단계에서 API Lambda는 직접 호출 구조에서 live alias 기반 구조로 전환되었고, CodeDeploy canary deployment가 실제로 version 2에서 version 3으로 traffic shifting을 성공적으로 수행했다.

따라서 현재 Revenue Ops API는 canary deployment와 rollback alarm 기반 운영 배포 구조를 갖춘 상태다.
