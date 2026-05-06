# M6 Cost / Runtime Profile

## 1. 현재 선택

현재 live runtime은 `vpc_egress_profile = "single_nat"`를 사용한다.

이 선택은 초기 유료 SaaS runtime에서 다음을 우선하기 위한 것이다.

- Lambda는 private subnet에서 Aurora 접근
- public context API는 NAT를 통해 outbound
- Seoul Open Data TCP 8088 egress 유지
- 보안상 Aurora public exposure 회피
- multi-AZ NAT 비용은 아직 부담하지 않음

## 2. NAT Gateway 비용 주의

NAT Gateway는 시간 비용과 처리량 비용이 발생한다. M6 데모/초기 운영에서는 `single_nat`가 비용과 구현 복잡도의 균형점이다.

주의:

- 장시간 idle이어도 NAT Gateway hourly cost가 발생한다.
- live collector 빈도와 payload가 늘면 data processing cost가 증가한다.
- 발표/검증이 끝난 후 필요 없으면 egress profile 유지 여부를 점검한다.

## 3. 언제 multi_az_nat로 이동할까

다음 조건이면 `multi_az_nat`를 검토한다.

- 실제 paying tenant가 생김
- collector refresh가 scheduled production workload가 됨
- 단일 AZ NAT 장애가 revenue/customer-facing 기능에 직접 영향
- SLA/가용성 목표가 명확해짐

## 4. 언제 public collector Lambda + SQS/S3 + VPC writer로 이동할까

다음 조건이면 platform-scale collector architecture로 전환한다.

- collector 수가 증가해 Lambda API request path에서 수행하기 부담스러움
- timeout-safe partial result 이상으로 retry/backoff/dead-letter가 필요함
- public API egress와 Aurora write boundary를 분리하고 싶음
- raw response archive 또는 replay가 필요함

후보 구조:

```text
public collector Lambda
  -> S3 raw archive
  -> SQS normalized events
  -> VPC writer Lambda
  -> Aurora context observations
```

## 5. Egress profile 비활성화 가이드

Terraform apply는 이 문서 범위 밖이다. 필요 시 plan 단계에서만 검토한다.

검토 항목:

- collector가 seed/mock mode로 동작해도 되는가
- live public context collection을 잠시 중단해도 되는가
- API Lambda가 Aurora 접근을 계속 유지해야 하는가
- Secrets Manager/VPC endpoint/NAT dependency가 어떻게 바뀌는가

M6 현재 요청에서는 TCP 80 egress 추가가 필요 없다. Holiday API는 HTTPS base URL을 사용한다.
