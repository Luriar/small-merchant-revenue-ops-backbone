# M7 Lambda Live Alias Cutover 기록

## 목적

API Gateway가 Lambda $LATEST 또는 unqualified function ARN을 직접 호출하지 않고, live Lambda alias를 통해 API Lambda를 호출하도록 전환했다.

이 작업은 이후 CodeDeploy Lambda canary deployment를 붙이기 위한 선행 단계다.

## 적용 결과

적용 후 구조:

    API Gateway HTTP API
    → Lambda alias: live
    → Lambda published version: 2

## 적용된 Terraform 설정

infra/terraform/envs/revenue-dev/terraform.step2f.jwt-enforcement.tfvars에 다음 설정을 적용했다.

    enable_api_lambda_versioning = true
    enable_api_lambda_alias      = true
    api_lambda_alias_name        = "live"
    enable_api_codedeploy_canary = false

주의: 해당 tfvars 파일은 .gitignore 대상이므로 Git에 직접 커밋되지 않는다. 실제 운영 재현 시 동일 값을 적용해야 한다.

## 검증 결과

Terraform no-change 확인 완료.

    No changes. Your infrastructure matches the configuration.

AWS 확인 결과:

    Lambda alias live 존재
    live alias FunctionVersion = 2
    API Gateway integration URI가 :live/invocations 를 바라봄

Smoke test 결과:

    GET /api/v1/stores 정상
    POST /api/v1/stores/{store_id}/context/collect 정상
    completed_collector_count = 8
    skipped_collector_count = 2
    failed_collector_count = 0
    timed_out_collector_count = 0

## 임시 작업자 권한 메모

Alias cutover 중 API Gateway integration PATCH 권한이 부족하여 다음 managed policy를 임시로 추가했다.

    RevenueOpsApiGatewayIntegrationPatchAccess

현재 정책은 다음 작업자 권한을 포함한다.

    apigateway:GET
    apigateway:PATCH
    Resource: *

이 권한은 M7 CodeDeploy Canary 구성까지 완료한 뒤 좁히거나 제거해야 한다.

## 다음 단계

다음 단계는 enable_api_codedeploy_canary = true를 켜고 CodeDeploy Lambda canary deployment group과 rollback alarm을 활성화하는 것이다.

예상 구조:

    API Gateway
    → Lambda alias: live
    → CodeDeploy traffic shifting
    → Lambda published version N

Canary 활성화 전 확인할 것:

    1. CodeDeploy app/deployment group 생성 권한
    2. CodeDeploy service role 생성/attach 권한
    3. CloudWatch rollback alarm 생성 권한
    4. Lambda alias가 live로 유지되는지
    5. API smoke test가 alias 경유 상태에서 계속 통과하는지
