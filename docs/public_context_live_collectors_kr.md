# Public Context Live Collectors

## 목적

Revenue Ops 분석은 매출 변화와 공개 맥락 신호를 함께 관측해 원인 후보와 실행 액션을 만들기 위한 증거 흐름이다. 이 collector는 Kakao Local, KMA/data.go.kr, Seoul Open Data를 live-capable로 연결하되, 인과를 단정하지 않는다.

사용 문구 원칙:
- "함께 관측되었습니다"
- "가능성 높은 원인 후보"
- "추가 확인이 필요합니다"
- "인과가 확정된 것은 아닙니다"
- "실행 효과를 단정하지 않습니다"

## Collector

- `kakao_geocoding`: 매장 주소를 Kakao Local API로 위도/경도와 행정동 맥락으로 정규화한다.
- `kma_weather`: KMA/data.go.kr endpoint로 강수량, 기온, 날씨 코드 신호를 수집한다.
- `seoul_commercial_benchmark`: 서울 열린데이터 endpoint로 상권 매출 벤치마크 신호를 수집한다.
- `seoul_foot_traffic_proxy`: 유동인구/생활인구 프록시 신호를 수집한다.
- `seoul_store_density_proxy`: 동일 업종 밀도 프록시를 수집한다.

## 모드

- `seed`: 기존 deterministic seed 데이터를 사용한다.
- `live`: 설정된 live collector만 호출한다. 누락된 key/endpoint는 `skipped`로 기록한다.
- `auto`: live 가능 항목을 먼저 시도하고, 모두 skip/fail이면 seed fallback을 사용한다.

## 저장 위치

- `context_sources`
- `context_observations`
- `public_revenue_benchmarks`
- `store_locations`
- `commercial_area_mappings`
- `nearby_store_snapshots`
- `collector_runs`
- `job_runs`

## 보안

API key는 코드, 응답, 로그, `source_ref`, S3 raw artifact에 남기지 않는다. URL은 `serviceKey=***` 또는 key segment masking 형태로 저장한다.

## 제한

KMA grid 변환은 이번 구현에서 강제하지 않는다. `KMA_DEFAULT_NX`, `KMA_DEFAULT_NY` 또는 Secrets Manager 값으로 운영자가 명시한다. 서울 열린데이터 dataset endpoint는 기관별 이름이 달라 환경 변수로 주입한다.
