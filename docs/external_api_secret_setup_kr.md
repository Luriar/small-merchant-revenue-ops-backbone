# External API Secret Setup

## Secrets Manager 계약

Lambda는 `PUBLIC_CONTEXT_SECRET_ID`가 있으면 Secrets Manager를 먼저 읽고, 실패 시 직접 env var가 있으면 env fallback을 사용한다.

권장 secret id:

```bash
/revenue-ops/revenue-dev/external/public-context
```

JSON shape:

```json
{
  "KAKAO_REST_API_KEY": "<kakao-rest-api-key>",
  "SEOUL_OPEN_DATA_KEY": "<seoul-open-data-key>",
  "DATA_GO_KR_SERVICE_KEY": "<data-go-kr-service-key>",
  "KMA_SERVICE_KEY": "<optional-kma-service-key>",
  "KMA_API_BASE_URL": "<optional-kma-base-url>",
  "KMA_FORECAST_ENDPOINT": "<optional-forecast-endpoint>",
  "KMA_NOWCAST_ENDPOINT": "<optional-nowcast-endpoint>",
  "KMA_DEFAULT_NX": "<kma-grid-x>",
  "KMA_DEFAULT_NY": "<kma-grid-y>",
  "SEOUL_OPEN_DATA_BASE_URL": "https://openapi.seoul.go.kr:8088",
  "SEOUL_COMMERCIAL_SALES_ENDPOINT": "<dataset-name>",
  "SEOUL_FOOT_TRAFFIC_ENDPOINT": "<dataset-name>",
  "SEOUL_STORE_DENSITY_ENDPOINT": "<dataset-name>"
}
```

`KMA_SERVICE_KEY`가 없으면 `DATA_GO_KR_SERVICE_KEY`를 weather collector key로 사용한다.

## 예시 명령

실제 값은 shell history와 로그 정책에 맞춰 별도 안전 채널에서 주입한다. 아래는 placeholder만 사용한다.

```bash
aws secretsmanager create-secret \
  --name /revenue-ops/revenue-dev/external/public-context \
  --secret-string file://public-context-secret.example.json \
  --region ap-northeast-2
```

기존 secret 업데이트:

```bash
aws secretsmanager put-secret-value \
  --secret-id /revenue-ops/revenue-dev/external/public-context \
  --secret-string file://public-context-secret.example.json \
  --region ap-northeast-2
```

## Terraform 준비

`revenue-dev` Terraform은 Lambda env `PUBLIC_CONTEXT_SECRET_ID`와 해당 secret에 대한 `secretsmanager:GetSecretValue`, `secretsmanager:DescribeSecret` 권한을 apply-ready로 갖는다. 이번 작업에서는 apply하지 않았다.

## 금지

- `.env` 파일 commit 금지
- API key를 PR, 문서, 로그, Lambda 응답에 노출 금지
- raw collector response에 key 포함 금지
