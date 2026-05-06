# STEP 4-lite Public Context & Commercial District Automation

## 자동화된 것

- 공개 맥락 schema 추가
- store location schema 추가
- commercial area mapping schema 추가
- nearby competitor/store density snapshot schema 추가
- collector_runs schema 추가
- seed/stub collector script 추가
- Revenue Cockpit context/pipeline-meta 응답에 context freshness 포함

## Seed/stub 상태

현재 collector는 API key 없이 실패하지 않는다. `scripts/context/collect_public_context.js`는 live external call을 기본으로 실행하지 않고 seed fallback 현황과 필요한 env key를 출력한다.

Seed store는 성수 일대의 근사 좌표만 사용하며 실제 매장 위치라고 주장하지 않는다. 상권 라벨도 manual_seed이며 공식 상권 코드로 단정하지 않는다.

## Live hook env

- `KMA_SERVICE_KEY`
- `DATA_GO_KR_SERVICE_KEY`
- `SEOUL_OPEN_DATA_KEY`
- `KAKAO_REST_API_KEY`
- `NAVER_CLIENT_ID`
- `NAVER_CLIENT_SECRET`

키가 없으면 collector는 skipped/seed_stub 경로로 종료한다. 테스트와 빌드는 외부 키 없이 통과해야 한다.

## Attribution 계획

각 source는 `context_sources`에 provider, source_url, license_type, attribution, refresh_granularity를 기록한다. UI/API는 source attribution을 보여줄 수 있는 구조를 갖는다.

## Scheduler 계획

최소 AWS 운영안:

```text
EventBridge Scheduler -> Lambda collector -> Aurora context tables
```

데이터 운영 고도화안:

```text
Airflow DAG -> public context ingest -> mart build -> cause/action generation
```

이번 단계에서는 live schedule을 만들지 않는다. uncontrolled collector는 금지한다.

## 제한

- full POS API integration 없음
- live review scraping 없음
- causality 보장 없음
- 상권 benchmark는 월/분기 단위일 수 있음
- 정확한 공식 상권 코드와 실제 점포 위치는 검증 데이터 없이는 단정하지 않음
