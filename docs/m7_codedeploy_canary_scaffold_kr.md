# M7 CodeDeploy Canary Scaffold 기록

## 목적

API Lambda를 CodeDeploy Lambda canary deployment로 배포할 수 있도록 배포 그룹과 rollback alarm 구조를 구성했다.

이 작업은 실제 새 Lambda version을 canary로 배포하기 전의 기반 구성 단계다.

## 선행 상태

이전 단계에서 API Gateway는 live Lambda alias를 바라보도록 전환되어 있었다.

    API Gateway HTTP API
    → Lambda alias: live
    → Lambda published version: 2

## 적용된 Terraform 설정

infra/terraform/envs/revenue-dev/terraform.step2f.jwt-enforcement.tfvars에 다음 설정을 적용했다.

    enable_api_lambda_versioning = true
    enable_api_lambda_alias      = true
    api_lambda_alias_name        = "live"
    enable_api_codedeploy_canary = true
    api_codedeploy_deployment_config_name = "CodeDeployDefault.LambdaCanary10Percent5Minutes"

주의: 해당 tfvars 파일은 .gitignore 대상이므로 Git에 직접 커밋되지 않는다. 실제 운영 재현 시 동일 값을 적용해야 한다.

## 생성된 리소스

CodeDeploy application:

    revenue-ops-revenue-dev-revenue-api

CodeDeploy deployment group:

    revenue-ops-revenue-dev-revenue-api-live

CodeDeploy service role:

    revenue-ops-revenue-dev-revenue-api-codedeploy

Attached AWS managed policy:

    AWSCodeDeployRoleForLambda

Rollback / stop-on-alarm 대상 CloudWatch alarms:

    revenue-ops-revenue-dev-revenue-api-live-errors
    revenue-ops-revenue-dev-revenue-api-live-throttles
    revenue-ops-revenue-dev-revenue-api-live-duration-p95
    revenue-ops-revenue-dev-revenue-api-gateway-5xx-canary

## 배포 전략

Deployment config:

    CodeDeployDefault.LambdaCanary10Percent5Minutes

Deployment style:

    BLUE_GREEN
    WITH_TRAFFIC_CONTROL

Auto rollback events:

    DEPLOYMENT_FAILURE
    DEPLOYMENT_STOP_ON_ALARM
    DEPLOYMENT_STOP_ON_REQUEST

## 검증 결과

Terraform apply 결과:

    Apply complete.
    Resources: 8 added, 0 changed, 0 destroyed.

AWS 확인 결과:

    CodeDeploy application exists.
    CodeDeploy deployment group exists.
    Lambda alias live still points to FunctionVersion 2.
    CloudWatch alarms exist.

Smoke test 결과:

    GET /api/v1/stores 정상
    POST /api/v1/stores/{store_id}/context/collect 정상
    completed_collector_count = 8
    skipped_collector_count = 2
    failed_collector_count = 0
    timed_out_collector_count = 0

## 알람 상태 메모

구성 직후 CloudWatch alarms는 INSUFFICIENT_DATA일 수 있다. 이는 새 alarm에 충분한 datapoint가 아직 쌓이지 않았기 때문이다.

현재 alarm은 treat_missing_data = notBreaching 설정을 사용하므로 데이터 부재만으로 breach 처리하지 않는다.

## 남은 작업

다음 단계는 실제 Lambda 새 version을 만든 뒤 CodeDeploy deployment를 생성하여 canary traffic shifting을 검증하는 것이다.

예상 다음 구조:

    현재 live alias → version 2
    새 Lambda version → version N
    CodeDeploy deployment
    → 10% traffic to version N
    → alarm 감시
    → 5분 후 100% 또는 rollback
