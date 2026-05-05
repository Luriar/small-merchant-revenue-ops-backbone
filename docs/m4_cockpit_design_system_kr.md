# M4 소상공인 매출 운영 코크핏 — 설계 시스템 및 구현 가이드

## 개요

M4는 M3에서 구축한 Gold 레이어 데이터를 소상공인이 실제로 활용할 수 있는 프론트엔드 코크핏으로 전환합니다. React + Vite 기반의 기존 `apps/web` 구조를 확장하며, 디자인 시스템·i18n·테마를 기반으로 네 개의 화면을 제공합니다.

---

## 1. 디자인 원칙

- **결론 먼저(Conclusion-First)**: 매출 브리프는 헤드라인을 가장 먼저 표시합니다.
- **원인 후보 언어 준수**: "가능성 높은 원인 후보", "함께 관측되었습니다", "추가 확인이 필요합니다". 절대 "원인으로 확정됩니다"라는 표현을 사용하지 않습니다.
- **디자인 토큰 기반**: 모든 색상은 CSS 변수(`--rev-*` 접두사)를 사용합니다. 하드코딩된 색상 없음.
- **i18n 우선**: 모든 UI 문자열은 `messages.ts` 딕셔너리를 통해 관리됩니다. 한국어 기본값.
- **Light/Dark/System 테마**: 기존 `usePreferences` 훅의 테마 시스템을 그대로 활용합니다.

---

## 2. 화면 구성

### 2-1. 매출 브리프 (Revenue Brief) — `#revenue-brief`

**목적**: 매출 이상 발생 시 소상공인에게 첫 번째로 보여주는 요약 화면.

**레이아웃**: 2열 — 메인(브리프 목록 + 상세) / 우측 레일(원인 후보, 주간 액션, 커버리지)

**핵심 요소**:
- 헤드라인: 굵고 큰 텍스트로 매출 변화와 원인 후보 수를 요약
- 요약: 한국어 가이드라인 언어를 사용한 2~3문장 요약
- 지표 비교 테이블: 매출/거래/유동인구/경쟁점 기준값 vs 실제값 + 변화율
- 우측 레일: 원인 후보 카드, 주간 액션 카드, 데이터 커버리지 바

### 2-2. 원인 근거 (Cause Evidence) — `#cause-evidence`

**목적**: 감지된 이상 현상별 세부 근거를 탐색하는 화면.

**레이아웃**: 2열 — 이상 현상 목록 테이블 / 우측 레일(선택된 이상 메타)

**핵심 요소**:
- 이상 유형 테이블: 상권, 업종, 이상 유형, 기준 기간, 비교 기간, 변화율, 심각도
- 근거 카드 목록: 근거 유형 필(Pill) + 강도 배지 + 요약 텍스트 + 수치 비교
- 데이터 한계 안내 문구 (항상 표시)

### 2-3. 액션 플래너 (Action Planner) — `#action-planner`

**목적**: 추천 액션의 상태를 추적하는 칸반 보드.

**레이아웃**: 5열 칸반 (`recommended → selected → planned → done → dismissed`)

**핵심 요소**:
- 각 칸반 열: 상태 점 + 제목 + 카운트
- 액션 카드: 제목, 유형, 펼침 토글(이유/기대 효과/리스크), 상태 전환 버튼
- 로컬 상태 관리 (in-memory); Aurora 연동 시 `PATCH /api/v1/revenue/actions/:id/status` 사용

**상태 전환 흐름**:
```
recommended → selected → planned → done
recommended → dismissed
dismissed → recommended
```

### 2-4. 데이터 신뢰성 (Data Reliability) — `#data-reliability`

**목적**: 브리프 생성 근거와 데이터 커버리지를 투명하게 공개.

**핵심 요소**:
- 소스 커버리지 바 (0~100%)
- 파이프라인 메타 (Gold 파일 경로, 생성 시각, run log 경로)
- 날씨/공휴일/지역 행사 집계값
- 데이터 한계 안내 (공공 데이터 정확도, 집계 단위 차이)

---

## 3. 디자인 토큰

```css
/* 매출 하락 */
--rev-drop-color, --rev-drop-soft, --rev-drop-border

/* 매출 상승 */
--rev-gain-color, --rev-gain-soft, --rev-gain-border

/* 중립 */
--rev-neutral-color, --rev-neutral-soft

/* 칸반 */
--rev-kanban-col-bg, --rev-kanban-col-border

/* 근거 유형별 색상 */
--rev-evidence-weather-color   (날씨)
--rev-evidence-demand-color    (수요)
--rev-evidence-competition-color (경쟁)
--rev-evidence-context-color   (맥락)
--rev-evidence-benchmark-color (벤치마크)

/* 액션 상태 점 */
--rev-status-recommended, --rev-status-selected,
--rev-status-planned, --rev-status-done, --rev-status-dismissed

/* 커버리지 바 */
--rev-coverage-fill, --rev-coverage-track
```

Light/Dark 모드 모두 `:root` 및 `:root[data-theme="dark"]`에서 자동 적용됩니다.

---

## 4. API 엔드포인트

`apps/api/src/server.js`에 Revenue Ops 라우트가 추가되었습니다:

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/v1/revenue/briefs` | 전체 브리프 목록 |
| GET | `/api/v1/revenue/briefs/:id` | 특정 브리프 상세 |
| GET | `/api/v1/revenue/anomalies` | 이상 현상 목록 |
| GET | `/api/v1/revenue/anomalies/:id/evidence` | 이상 현상의 근거 목록 |
| GET | `/api/v1/revenue/actions` | 액션 추천 목록 (현재 상태 포함) |
| PATCH | `/api/v1/revenue/actions/:id/status` | 액션 상태 업데이트 |
| GET | `/api/v1/revenue/context` | Revenue Context Mart 레코드 |
| GET | `/api/v1/revenue/pipeline-meta` | 파이프라인 메타 |

---

## 5. Gold-to-JSON 내보내기

Gold 파케이 파일을 API가 서빙할 수 있는 JSON으로 내보냅니다:

```bash
python3 scripts/export_gold_to_json.py [--quarter 2024Q4]
```

출력: `apps/api/src/revenue-ops/data/revenue_ops_export.json`

파이프라인 실행 후 반드시 이 스크립트를 실행해 JSON을 갱신해야 합니다.

---

## 6. Aurora 운영 스키마

`infra/db/revenue_ops_action_tracking.sql`:

- `revenue_ops.action_status_log` — 액션 상태 전환 append-only 로그
- `revenue_ops.action_current_status` — 현재 상태 (upsert)
- `revenue_ops.revenue_brief_meta` — 브리프 메타 (S3 parquet 포인터)
- `revenue_ops.upsert_action_status()` — 상태 업데이트 헬퍼 함수

프로덕션에서는 `PATCH /api/v1/revenue/actions/:id/status` 가 이 함수를 호출합니다.

---

## 7. 파일 구조

```
apps/web/src/
├── components/revenue/
│   ├── EvidencePill.tsx        근거 유형 필 컴포넌트
│   ├── MetricDeltaChip.tsx     변화율 칩 컴포넌트
│   └── SourceCoverageBar.tsx   소스 커버리지 바 컴포넌트
├── data/
│   └── mockRevenueOpsData.ts   Gold JSON 기반 목 데이터
├── pages/
│   ├── RevenueBriefPage.tsx    매출 브리프 화면
│   ├── CauseEvidencePage.tsx   원인 근거 화면
│   ├── ActionPlannerPage.tsx   액션 플래너 화면
│   └── DataReliabilityPage.tsx 데이터 신뢰성 화면
└── types/
    └── revenue-ops.ts          Revenue Ops 타입 정의

apps/api/src/revenue-ops/
├── revenue-ops-store.js        Gold JSON 로드 및 상태 관리
├── revenue-ops-handler.js      HTTP 핸들러
└── data/
    └── revenue_ops_export.json Gold 내보내기 결과

infra/db/
└── revenue_ops_action_tracking.sql  Aurora 운영 스키마

scripts/
└── export_gold_to_json.py      Gold → JSON 내보내기 스크립트

tests/
└── test_gold_json_export.py    내보내기 스크립트 테스트 (13개)
```

---

## 8. 완료 기준

- [ ] `npm run check` 오류 없음 (TypeScript)
- [ ] `npm run build` 성공
- [ ] `python3 -m pytest tests/` 75개 전체 통과
- [ ] 네 개 화면 모두 브라우저에서 정상 렌더링
- [ ] i18n 전환 (한국어 ↔ 영어) 정상 동작
- [ ] Light/Dark/System 테마 전환 정상 동작
- [ ] 액션 플래너 칸반: 상태 전환 버튼 동작
- [ ] `scripts/export_gold_to_json.py` 실행 → JSON 생성 확인
- [ ] API 서버 기동 후 `/api/v1/revenue/briefs` 응답 확인
