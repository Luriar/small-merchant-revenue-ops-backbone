# M7 Temporary IAM Access Cleanup 기록

## 목적

M7 Lambda alias cutover 및 CodeDeploy canary 검증 중 임시로 부여한 작업자 IAM 권한을 정리했다.

## 제거한 임시 권한

다음 customer managed policy를 `de-ai-12`에서 detach 후 삭제했다.

    RevenueOpsApiGatewayIntegrationPatchAccess
    RevenueOpsCodeDeployCanaryReadAccess

## 제거 이유

RevenueOpsApiGatewayIntegrationPatchAccess는 API Gateway integration을 live Lambda alias로 전환할 때 필요한 임시 PATCH 권한이었다.

해당 cutover는 완료되었고 Terraform no-change 및 API smoke test까지 통과했으므로 더 이상 필요하지 않다.

RevenueOpsCodeDeployCanaryReadAccess는 CodeDeploy 조회용 임시 권한이었다.

현재 RevenueOpsCodeDeployCanaryManageAccess가 List/Get/BatchGet 권한을 포함하므로 중복 권한이다.

## 유지한 권한

다음 policy는 일단 유지했다.

    RevenueOpsCodeDeployCanaryManageAccess

## 유지 이유

scripts/m7_codedeploy_canary_smoke.sh는 실제 canary smoke deployment를 생성하기 위해 다음 권한이 필요하다.

    codedeploy:RegisterApplicationRevision
    codedeploy:CreateDeployment
    codedeploy:GetDeployment
    codedeploy:List*
    codedeploy:Get*
    codedeploy:BatchGet*

따라서 deploy 전용 role 또는 GitHub OIDC role로 이전하기 전까지는 작업자 user에 유지한다.

## 다음 정리 방향

장기적으로는 de-ai-12 개인 사용자에 canary 배포 권한을 직접 두지 않고, 다음 중 하나로 이전한다.

    GitHub Actions OIDC deploy role
    별도 Revenue Ops deploy role
    제한된 assume-role 기반 운영 계정

이후 RevenueOpsCodeDeployCanaryManageAccess도 de-ai-12에서 제거한다.
