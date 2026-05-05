# M4 검증 증거

## 1. 검증 메타데이터

- 검증 일시: `2026-05-05 18:56:40 KST`
- Git HEAD short: `a9eb8aa`
- Git HEAD full: `a9eb8aaa6ef1b7bafb0cd105fa209ac8e734df6a`
- 대상 단계: M4 Revenue Cockpit closure

## 2. 최근 커밋 기준

검증 시점의 최근 커밋 흐름은 다음과 같다.

```text
a9eb8aa feat: add standalone M4 revenue cockpit frontend
4567781 docs: add M4 Claude Design cockpit reference
7e40c07 feat: add M4 revenue ops API foundation
cc777c0 feat: complete M3 revenue ops medallion foundation
7ec46aa docs: add small merchant revenue ops planning baseline
```

## 3. 실행한 검증 명령과 결과

### 3-1. Web TypeScript check

명령:

```bash
npm --prefix apps/web run check
```

결과:

```text
> @traceops/web@0.0.0 check
> tsc --noEmit
```

상태: 통과

검증 의미:

- `apps/web` TypeScript 타입 검사를 통과했다.
- Revenue Cockpit 컴포넌트, route 연결, 타입 정의가 현재 TypeScript 설정에서 컴파일 가능한 상태임을 확인한다.

### 3-2. Web production build

명령:

```bash
npm --prefix apps/web run build
```

결과:

```text
> @traceops/web@0.0.0 build
> tsc -b && vite build

vite v5.4.21 building for production...
transforming...
✓ 79 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.41 kB │ gzip:  0.28 kB
dist/assets/index-s_3EtqFv.css   25.70 kB │ gzip:  5.84 kB
dist/assets/index-CUkSJBVr.js   306.63 kB │ gzip: 88.12 kB
✓ built in 2.02s
```

상태: 통과

검증 의미:

- Vite production build가 성공했다.
- `#revenue-cockpit`을 포함한 현재 web bundle이 빌드 가능한 상태임을 확인한다.

### 3-3. Python test suite

명령:

```bash
python3 -m pytest tests/ -q
```

결과:

```text
........................................................................ [ 96%]
...                                                                      [100%]
75 passed in 2.09s
```

상태: 통과

검증 의미:

- 전체 Python 테스트 75개가 통과했다.
- M4 관점에서는 `tests/test_gold_json_export.py`가 Gold -> JSON export 계약을 확인한다.
- 기존 테스트와 M3/M4 데이터 산출물 사이의 기본 호환성이 유지됨을 확인한다.

### 3-4. Node API test suite

명령:

```bash
node --test apps/api/src/**/*.test.js
```

결과 요약:

```text
TAP version 13
1..41
# tests 41
# suites 0
# pass 41
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 360.289041
```

상태: 통과

검증 의미:

- 현재 `apps/api/src/**/*.test.js` Node 테스트 41개가 통과했다.
- 기존 M2 CDC recovery/API safety 테스트가 M4 Revenue Ops API foundation 추가 후에도 깨지지 않았음을 확인한다.
- 에러 응답 안전성, role boundary, route registration, DTO safety 같은 기존 API 안전 기준과의 호환성을 확인한다.

## 4. 최종 검증 판정

M4 closure validation은 통과했다.

통과 기준:

- Web TypeScript check 통과
- Web production build 통과
- Python 전체 테스트 통과
- Node API 전체 테스트 통과

## 5. 알려진 caveat

- `python3 -m pytest tests/ -q`는 Gold export 테스트 과정에서 `apps/api/src/revenue-ops/data/revenue_ops_export.json`을 재생성할 수 있다.
- `npm --prefix apps/web run build`는 `apps/web/tsconfig.tsbuildinfo`를 갱신할 수 있다.
- 이번 closure 작업에서는 검증 후 생성물 변경을 원복하여 documentation-only 변경으로 정리했다.
- Node API 테스트는 현재 M2 legacy compatibility 성격이 강하다. Revenue Ops API 전용 Node route 테스트는 M5에서 선택적으로 추가할 수 있다.
- 본 검증은 로컬 빌드/테스트 검증이며, 운영 Aurora 연결이나 외부 SaaS 연동을 검증하지 않는다.

## 6. M2 legacy test compatibility note

M4는 Revenue Ops API foundation과 standalone Revenue Cockpit을 추가했지만, 기존 Product Ops/TraceOps 및 M2 CDC recovery 테스트를 깨지 않아야 한다.

`node --test apps/api/src/**/*.test.js` 통과는 M4 변경이 기존 API safety boundary와 route 테스트 흐름을 손상시키지 않았다는 호환성 증거다. 단, 이 테스트만으로 Revenue Ops API의 모든 route-specific behavior가 충분히 검증되었다고 보지는 않는다.
