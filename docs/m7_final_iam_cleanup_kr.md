# M7 Final IAM Cleanup 기록

## 목적

M7 작업 중 de-ai-12 사용자에 임시로 부여했던 canary 배포 권한을 정리했다.

목표는 개인 IAM user가 직접 CodeDeploy canary deployment를 생성할 수 없도록 하되, Terraform state refresh에 필요한 CodeDeploy read 권한은 유지하는 것이다.

## 삭제한 임시 policy

다음 customer managed policy를 detach 후 삭제했다.

    RevenueOpsApiGatewayIntegrationPatchAccess
    RevenueOpsCodeDeployCanaryReadAccess
    RevenueOpsCodeDeployCanaryManageAccess

## 삭제 이유

RevenueOpsApiGatewayIntegrationPatchAccess는 API Gateway integration을 live Lambda alias로 전환하기 위해 임시로 부여한 PATCH 권한이었다.

RevenueOpsCodeDeployCanaryReadAccess는 CodeDeploy 조회용 임시 권한이었고, 이후 권한 구조 재정리 과정에서 별도 Terraform read policy로 대체되었다.

RevenueOpsCodeDeployCanaryManageAccess는 canary smoke runner를 수동 실행하기 위해 사용한 배포 실행 권한이었다. M7 smoke 검증이 완료되었으므로 개인 사용자에 계속 유지하지 않는다.

## 유지한 최소 read 권한

Terraform refresh와 plan을 위해 다음 read-only policy를 새로 부여했다.

    RevenueOpsCodeDeployTerraformReadAccess

이 policy는 CodeDeploy application, deployment group, deployment config, deployment 상태를 조회하기 위한 권한만 가진다.

대표 허용 권한:

    codedeploy:GetApplication
    codedeploy:GetDeploymentGroup
    codedeploy:GetDeployment
    codedeploy:ListApplications
    codedeploy:ListDeploymentGroups
    codedeploy:ListDeployments
    codedeploy:BatchGetApplications
    codedeploy:BatchGetDeploymentGroups
    codedeploy:BatchGetDeployments

## 의도적으로 제거된 배포 실행 권한

de-ai-12는 더 이상 다음 작업을 직접 수행할 수 없다.

    codedeploy:CreateDeployment
    codedeploy:RegisterApplicationRevision

권한 시뮬레이션 결과:

    codedeploy:GetApplication = allowed
    codedeploy:GetDeploymentGroup = allowed
    codedeploy:GetDeployment = allowed
    codedeploy:CreateDeployment = implicitDeny
    codedeploy:RegisterApplicationRevision = implicitDeny

## 서비스 영향 검증

삭제된 것은 API runtime role이 아니라 de-ai-12 작업자 권한이다.

API smoke test 결과:

    GET /api/v1/stores 정상
    store_count = 6

Terraform 검증 결과:

    No changes. Your infrastructure matches the configuration.

## 현재 운영 상태

M7 완료 후 운영 구조는 유지된다.

    API Gateway
    → Lambda alias: live
    → Lambda version 3
    → CodeDeploy deployment group
    → CloudWatch rollback alarms

## 남은 장기 과제

scripts/m7_codedeploy_canary_smoke.sh를 운영 자동화로 계속 사용하려면 개인 사용자 권한이 아니라 별도 배포 주체로 이전해야 한다.

후보:

    GitHub Actions OIDC deploy role
    Revenue Ops 전용 deploy role
    제한된 assume-role 기반 운영 role

해당 role에는 canary deployment 생성과 Lambda version publish에 필요한 최소 권한만 부여한다.
