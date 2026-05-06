# M6 Live Smoke Result

## 1. 기준

- 기준 시점: 2026-05-07 KST 작업 인수 상태
- 배포 API 기준: `https://7q8hxxta67.execute-api.ap-northeast-2.amazonaws.com`
- 인증: Cognito Bearer token 필요. 문서와 명령 예시는 token/API key를 포함하지 않는다.
- 사용 매장 예시: `성수 커피음료 매장`, `서울 성동구 성수동 일대`, `cafe`

## 2. 이미 검증된 AWS Live 상태

- Revenue API Lambda는 VPC private subnet에서 Aurora 접근 가능.
- `vpc_egress_profile = "single_nat"` 활성.
- NAT Gateway egress 정상.
- Seoul Open Data TCP 8088 egress 정상.
- Kakao/KMA/Seoul full live public context collection 정상.

Full live 결과:

- `completed_collector_count = 5`
- `skipped_collector_count = 0`
- `failed_collector_count = 0`
- 완료 collector: Kakao geocoding, KMA weather, Seoul commercial benchmark, Seoul foot traffic proxy, Seoul store density proxy

개별 smoke:

- Naver Local Search: HTTP 200, `item_count = 5`
- Naver DataLab: HTTP 200, `result_count = 2`
- Korean holiday/special-day API: HTTPS HTTP 200, `resultCode = "00"`, `resultMsg = "NORMAL SERVICE."`
- 2026-05 공휴일 rows: 노동절, 어린이날, 부처님오신날, 대체공휴일(부처님오신날)

## 3. 이번 M6 코드 반영 후 Smoke 명령

환경 변수:

```bash
export API_BASE="https://7q8hxxta67.execute-api.ap-northeast-2.amazonaws.com"
export TOKEN="<cognito-bearer-token>"
export STORE_ID="<store-id>"
```

Store registration:

```bash
curl -sS -X POST "$API_BASE/api/v1/stores" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "store_name":"성수 M6 스모크 매장",
    "tenant_name":"M6 Smoke Tenant",
    "business_category":"cafe",
    "region":"서울 성동구 성수동",
    "address_text":"서울 성동구 성수동 일대"
  }'
```

응답 확인:

- `context_bootstrap_hint.recommended = true`
- `context_bootstrap_hint.mode = "live"`
- `context_bootstrap_hint.reason = "store_onboarding_bootstrap"`

Targeted collectors:

```bash
curl -sS -X POST "$API_BASE/api/v1/stores/$STORE_ID/context/collect" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "mode":"live", "collectors":["naver_local_competitor_search"] }'

curl -sS -X POST "$API_BASE/api/v1/stores/$STORE_ID/context/collect" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "mode":"live", "collectors":["naver_search_trend"] }'

curl -sS -X POST "$API_BASE/api/v1/stores/$STORE_ID/context/collect" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "mode":"live", "collectors":["korean_holiday_calendar"] }'
```

Expanded full live:

```bash
curl -sS -X POST "$API_BASE/api/v1/stores/$STORE_ID/context/collect" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "mode":"live", "reason":"manual_refresh" }'
```

Pipeline-meta/context:

```bash
curl -sS "$API_BASE/api/v1/stores/$STORE_ID/pipeline-meta" \
  -H "Authorization: Bearer $TOKEN"

curl -sS "$API_BASE/api/v1/stores/$STORE_ID/context" \
  -H "Authorization: Bearer $TOKEN"
```

## 4. 해석 가드레일

- Naver/Holiday는 live collector로 구현되었지만 smoke 재실행은 배포와 secret 상태에 의존한다.
- Toss Place는 connector foundation only다. 사업자 등록 정보와 공식 credential 없이는 live integration으로 주장하지 않는다.
- Delivery app은 CSV upload/parser와 provider skeleton 우선이다. 직접 로그인 자동화와 raw ID/password 저장은 하지 않는다.
- 모든 evidence 문구는 `함께 관측되었습니다`, `가능성 높은 원인 후보`, `추가 확인이 필요합니다`, `인과가 확정된 것은 아닙니다` 원칙을 따른다.
