# M7 CodeDeploy Canary Smoke Test 기록

## 목적

CodeDeploy Lambda canary deployment가 실제로 live Lambda alias traffic을 점진 전환하고, 정상 완료 시 새 Lambda version으로 100% 전환되는지 검증했다.

## 시작 상태

    Lambda alias live → version 2
    Target version → version 3

version 3은 코드 변경 없이 Lambda description marker를 사용해 publish한 smoke-test version이다.

## Deployment

Deployment ID:

    d-AFYQXLBFI

Deployment config:

    CodeDeployDefault.LambdaCanary10Percent5Minutes

Deployment group:

    revenue-ops-revenue-dev-revenue-api-live

## 관측된 Canary 흐름

초기 canary 구간:

    deployment status = InProgress
    live alias FunctionVersion = 2
    RoutingConfig.AdditionalVersionWeights.3 = 0.1

완료 후:

    deployment status = Succeeded
    live alias FunctionVersion = 3
    RoutingConfig = null

즉, 10% canary traffic shift 이후 alarm breach 없이 version 3으로 100% 전환되었다.

## 검증 결과

Final deployment result:

    status = Succeeded
    deploymentOverview.Succeeded = 1
    errorInformation = null

Final Lambda alias result:

    live alias → version 3
    RoutingConfig = null

API smoke test result:

    GET /api/v1/stores 정상
    store_count = 6

    POST /api/v1/stores/{store_id}/context/collect 정상
    collector_run_status = completed
    completed_collector_count = 8
    skipped_collector_count = 2
    failed_collector_count = 0
    timed_out_collector_count = 0

## Drift guard

CodeDeploy가 live alias의 function_version과 routing_config를 운영 중 변경하므로, Terraform이 해당 값을 다시 고정 버전으로 되돌리면 안 된다.

따라서 aws_lambda_alias.live 리소스에 다음 drift guard를 추가했다.

    lifecycle ignore_changes:
    - function_version
    - routing_config

적용 후 Terraform plan 결과:

    No changes. Your infrastructure matches the configuration.

## 정리한 임시 변경

Canary smoke를 위해 Lambda $LATEST description에 marker를 넣었으나, smoke test 이후 다음 값으로 원복했다.

    Small-merchant Revenue Ops API.

## 남은 작업

다음 단계에서는 canary smoke test 절차를 스크립트화하고, 임시 작업자 IAM 권한을 정리한다.

정리 대상:

    RevenueOpsApiGatewayIntegrationPatchAccess
    RevenueOpsCodeDeployCanaryReadAccess
    RevenueOpsCodeDeployCanaryManageAccess

특히 RevenueOpsApiGatewayIntegrationPatchAccess는 apigateway:GET / apigateway:PATCH / Resource:* 형태로 넓혀져 있으므로 제거 또는 축소가 필요하다.
