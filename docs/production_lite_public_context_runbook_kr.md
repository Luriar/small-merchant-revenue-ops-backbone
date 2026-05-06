# Production-lite Public Context Runbook

## 수동 실행

`API_BASE`, `ID_TOKEN`, `STORE_ID`를 준비한 뒤 실행한다.

```bash
curl -i -X POST "$API_BASE/api/v1/stores/$STORE_ID/context/collect" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "mode": "live" }'
```

자동 fallback 확인:

```bash
curl -i -X POST "$API_BASE/api/v1/stores/$STORE_ID/context/collect" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "mode": "auto" }'
```

결과 확인:

```bash
curl -i "$API_BASE/api/v1/stores/$STORE_ID/context" \
  -H "Authorization: Bearer $ID_TOKEN"

curl -i "$API_BASE/api/v1/stores/$STORE_ID/pipeline-meta" \
  -H "Authorization: Bearer $ID_TOKEN"
```

## 상태 해석

- `completed`: collector가 live 또는 seed 데이터를 저장했다.
- `skipped`: key, endpoint, 주소, KMA grid 등 필수 입력이 없어 안전하게 건너뛰었다.
- `failed`: API가 오류를 반환했거나 응답 파싱에 실패했다. 오류 메시지는 sanitization 후 기록된다.

`pipeline-meta`에는 다음 필드가 포함된다.

- `latest_collector_run`
- `completed_collector_count`
- `skipped_collector_count`
- `failed_collector_count`
- `latest_live_context_collected_at`
- `context_freshness_note`
- `data_reliability_note`

## 운영 기준

분석 문구는 항상 "업로드된 매출 데이터와 공개 맥락 데이터가 함께 관측되었습니다" 수준으로 제한한다. 결과는 원인 후보와 실행 가설이며, 인과가 확정된 것은 아니다.

## S3 Bronze

`BRONZE_BUCKET_NAME` env가 설정될 수 있도록 Terraform 변수는 준비되어 있다. 이번 Lambda package는 S3 client dependency를 추가하지 않았으므로 raw artifact write는 비활성화 상태로 metadata에 기록된다. S3 raw 저장을 활성화할 때는 key masking, request header 제거, source_ref sanitization 검증 후 별도 변경으로 진행한다.

## 장애 대응

1. `pipeline-meta.latest_collector_run.metadata.collectors`에서 failed/skipped reason을 확인한다.
2. Secrets Manager secret shape와 endpoint 이름을 확인한다.
3. KMA는 `KMA_DEFAULT_NX`, `KMA_DEFAULT_NY`가 없으면 `missing_kma_grid`로 skip된다.
4. 서울 열린데이터는 dataset endpoint env가 없으면 `endpoint_not_configured`로 skip된다.
5. collector 실패는 Revenue Cockpit 기본 API와 seed fallback을 깨지 않아야 한다.
