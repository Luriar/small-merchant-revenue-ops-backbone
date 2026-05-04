# M2 Terraform — Full data platform

Product Ops Backbone 프로젝트의 M2 인프라 코드 (M1 확장).

## M1 → M2 추가 사항

`envs/dev`의 기본값은 M1-only이다. M2 컴포넌트는 `-var='enable_m2=true'`를 명시한 경우에만 계획/생성되어야 한다.

- **NAT Gateway 2개** (network 모듈, `enable_nat_gateway` toggle)
- **EKS** (`modules/eks`) — cluster + nodegroup + addons + OIDC + IRSA
- **Karpenter** (`modules/karpenter`) — IAM + SQS + EventBridge
- **MSK Serverless** (`modules/msk`) — IAM 인증
- **ClickHouse** (`modules/clickhouse`) — r6i.large + gp3
- **Airflow MWAA** (`modules/airflow`) — small + S3 DAGs
- **Helm addons** (`modules/helm_addons`) — Karpenter / ALB Controller / Strimzi / kube-prometheus-stack / Argo Rollouts
- **Argo CD** (`modules/argocd`) — GitOps

## 디렉토리

```
m2/
├── bootstrap/        (M1과 동일)
├── envs/dev/         (M1 + M2 모듈 호출)
└── modules/
    ├── network/      (M1 + NAT 활성화)
    ├── endpoints/    (M1 그대로)
    ├── bastion/      (M1 그대로)
    ├── aurora/       (M1 그대로)
    ├── eks/          [M2 신규]
    ├── karpenter/    [M2 신규]
    ├── msk/          [M2 신규]
    ├── clickhouse/   [M2 신규]
    ├── airflow/      [M2 신규]
    ├── helm_addons/  [M2 신규]
    └── argocd/       [M2 신규]
```

## 사이즈 결정 철학

**"Production 스킬셋 + 최소 사이즈 + 발표 후 사이즈만 조정해서 실서비스 진입"**

| 컴포넌트 | M2 사이즈 | Production 전환 |
|---|---|---|
| Aurora Serverless v2 | 0.5~4 ACU | max_capacity 늘림 |
| EKS 노드 | t3.medium 2대 | t3.large/xlarge로 변경 |
| Karpenter | 0~∞ (자동) | 그대로 |
| ClickHouse | r6i.large + gp3 100GB | replicated cluster + 사이즈 ↑ |
| MSK Serverless | (자동) | 그대로 또는 provisioned |
| MWAA | mw1.small | mw1.medium / mw1.large |
| Bastion | t4g.nano | 그대로 |

## Argo Rollouts Canary

| 항목 | 데모 (M2) | Production 전환 |
|---|---|---|
| Step | 10% → 25% → 50% → 75% → 100% | 그대로 |
| 각 step 대기 | 1분 | 5~10분 |
| Analysis | error rate < 1% / 30초 윈도우 | error rate + latency p99 + 5분 윈도우 |
| 자동 롤백 | analysis 실패 시 | 그대로 |

## 적용 순서

### 1) Bootstrap (M1과 동일, 1회)

M1에서 이미 만들었으면 skip.

```bash
cd bootstrap
terraform init
terraform apply
```

### 2) backend 설정 (M1과 동일)

```bash
cd ../bootstrap
terraform output -raw backend_config_snippet > ../envs/dev/backend.tf
```

### 3) Apply

```bash
cd ../envs/dev

# 기본값은 var.enable_m2 = false 이며 M1 상태만 만듬
# M2는 readiness gate 통과 후 -var='enable_m2=true'로 명시 활성화
# 단계적 적용 권장: M1 먼저 → 검증 → M2 활성화

terraform init
terraform plan
terraform apply
```

**중요**: M2 첫 apply는 **2단계로 나누는 것을 권장**:

```bash
# 1단계: EKS만 (helm provider가 cluster auth를 필요로 하므로)
terraform apply -target='module.eks' -target='aws_security_group.bastion'

# 2단계: 나머지
terraform apply
```

이렇게 하면 helm/kubernetes provider 초기화 시점에 cluster가 이미 존재.

## M2 종료 조건 (데모 시연 가능 상태)

1. EKS 클러스터에 bastion에서 kubectl 접근 가능
2. Strimzi KafkaConnect + 3개 Connector 배포되어 Aurora → MSK → ClickHouse CDC 흐름 통과
3. Airflow DAG 2개 (anomaly_detection, trace_evaluation) 정상 실행
4. Argo CD에서 Argo Rollouts canary 배포 시연 가능
5. Grafana 대시보드 접근 가능

## 주의사항

### 비용

NAT Gateway 2개 × $0.045/hour = 약 $65/월. MWAA mw1.small ~$0.5/시간 = ~$360/월. EKS control plane $0.10/hour = ~$72/월.

**데모 후 즉시 destroy 권장.**

### Provider 초기화 순서

`helm` / `kubernetes` provider는 EKS cluster가 존재해야 초기화 가능. `var.enable_m2 = false` 일 때는 `count = 0`으로 우회.

### 모듈 destroy 순서

```bash
# 의존 역순
terraform destroy -target='module.argocd' -target='module.helm_addons'
terraform destroy -target='module.airflow'
terraform destroy -target='module.clickhouse' -target='module.msk'
terraform destroy -target='module.karpenter' -target='module.eks'
terraform destroy  # 나머지 (bastion, aurora, endpoints, network)
```

또는 한번에: `terraform destroy` (의존 자동 해석되지만 helm provider auth 이슈 가능).
