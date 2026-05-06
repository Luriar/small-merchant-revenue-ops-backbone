# Real-service VPC Egress for Public Context Collectors

## 배경

Kakao Local API와 KMA/data.go.kr weather collector가 Lambda에서 `TypeError`로 실패했다. 확인된 네트워크 상태는 다음과 같다.

- Revenue API Lambda는 Aurora 접속을 위해 Revenue Ops 전용 VPC private subnet에 붙어 있다.
- VPC: `vpc-02e9069c818170256`
- Lambda private subnets:
  - `subnet-01381433f0c693179`
  - `subnet-07cb619fbe572a308`
- NAT Gateway가 없다.
- Lambda subnet route table에는 local VPC route만 있고 `0.0.0.0/0 -> NAT Gateway`가 없다.

따라서 Kakao/KMA 오류는 collector application logic 문제가 아니라, VPC Lambda에 outbound internet path가 없는 정상적인 결과다.

## 원칙

Aurora는 계속 private subnet에 둔다. Aurora security group은 Lambda security group에서 오는 PostgreSQL만 허용한다. Public subnet과 NAT Gateway는 Lambda가 Kakao/KMA/Seoul Open Data 같은 public API에 HTTPS outbound를 보내기 위한 egress path일 뿐이며, Aurora를 public하게 만들지 않는다.

## Terraform Profile

`revenue_network` module과 `revenue-dev` env에 다음 변수를 추가했다.

```hcl
vpc_egress_profile = "none" # none | single_nat | multi_az_nat
```

기본값은 `none`이다.

### none

현재 상태를 유지한다.

- public subnet 없음
- internet gateway 없음
- NAT Gateway 없음
- private subnet default route 없음
- Kakao/KMA/Seoul Open Data live call은 VPC Lambda에서 실패하거나 skip/fail 처리될 수 있다.

### single_nat

초기 유료 SaaS 운영용 최소 egress profile이다.

생성 예정:

- public subnet 1개
- internet gateway 1개
- public route table + `0.0.0.0/0 -> IGW`
- Elastic IP 1개
- NAT Gateway 1개
- 기존 private route table에 `0.0.0.0/0 -> NAT Gateway`
- Lambda security group HTTPS egress `443 -> 0.0.0.0/0`

장점은 비용이 낮고 구조가 production-shaped라는 점이다. 단점은 NAT Gateway가 단일 AZ 장애 지점이 된다는 점이다.

### multi_az_nat

HA production egress profile이다.

생성 예정:

- Lambda/Aurora private subnet AZ에 맞춘 public subnet per AZ
- internet gateway
- public route table
- Elastic IP per AZ
- NAT Gateway per AZ
- private route table per AZ
- 각 private subnet이 same-AZ NAT Gateway로 `0.0.0.0/0` route
- Lambda security group HTTPS egress `443 -> 0.0.0.0/0`

장점은 AZ 장애 격리가 좋다. 단점은 NAT Gateway와 EIP 비용이 AZ 수만큼 증가한다.

## 비용 경고

NAT Gateway는 시간당 비용과 처리량 비용이 발생한다. `single_nat`, `multi_az_nat`는 cost-bearing profile이다. Terraform apply 전 반드시 plan resource list와 월 예상 비용을 확인한다.

## Live Smoke

NAT profile 적용 후 fresh JWT로 다음을 실행한다.

```bash
curl -i -X POST "$API_BASE/api/v1/stores/$STORE_ID/context/collect" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "mode": "live" }'

curl -i -X POST "$API_BASE/api/v1/stores/$STORE_ID/context/collect" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "mode": "auto" }'

curl -i "$API_BASE/api/v1/stores/$STORE_ID/context" \
  -H "Authorization: Bearer $ID_TOKEN"

curl -i "$API_BASE/api/v1/stores/$STORE_ID/pipeline-meta" \
  -H "Authorization: Bearer $ID_TOKEN"
```

기대 결과:

- Kakao collector는 주소가 있으면 geocoding context를 `completed`로 기록한다.
- KMA collector는 key, endpoint, `KMA_DEFAULT_NX/NY`가 있으면 weather context를 `completed`로 기록한다.
- Seoul collector는 dataset endpoint가 설정된 항목만 `completed`, 누락된 endpoint는 `skipped`로 기록한다.

## Apply Gates

초기 유료 SaaS egress:

```bash
terraform -chdir=infra/terraform/envs/revenue-dev apply tfplan.egress-single-nat
```

HA production egress:

```bash
terraform -chdir=infra/terraform/envs/revenue-dev apply tfplan.egress-multi-az-nat
```

## Disable / Destroy Procedure

NAT 비용을 끄려면 `none` profile plan을 먼저 만든다.

```bash
terraform -chdir=infra/terraform/envs/revenue-dev plan \
  -var-file=terraform.step2f.jwt-enforcement.tfvars \
  -var='vpc_egress_profile=none' \
  -out=tfplan.egress-disable
```

이 plan은 기존에 NAT profile이 적용되어 있었다면 NAT Gateway, EIP, public subnet, IGW, default route 제거를 포함할 수 있다. destroy가 포함되는 것이 정상일 수 있지만, 반드시 NAT egress 리소스만 제거되는지 확인한 뒤 별도 승인으로 apply한다.

## Future Platform-scale Alternative

NAT 비용을 최소화하거나 public API collection을 VPC 바깥으로 분리하려면 다음 구조를 고려한다.

1. non-VPC public collector Lambda가 Kakao/KMA/Seoul Open Data를 호출한다.
2. sanitized result를 SQS/S3 Bronze에 쓴다.
3. VPC writer Lambda가 SQS/S3에서 읽어 Aurora에 저장한다.

이 구조는 public API egress와 Aurora private write path를 분리한다. 다만 Lambda 2개, queue/bucket, retry/DLQ 운영이 필요하므로 초기 paid SaaS에서는 `single_nat`가 더 단순하다.
