# M5 AWS 배포 준비 상태

## 현재 상태

M5 기준 Revenue Ops Cockpit은 아직 AWS에 배포하지 않았다. 이 문서는 실제 배포 작업이 아니라, 최종 발표 전 배포 경로와 선행 조건을 정리하는 readiness 문서다.

**주의:** 아직 Terraform apply, AWS 리소스 생성, Aurora 연결, 운영 배포를 수행하지 않는다. 실제 배포는 별도 승인 후 진행한다.

## 권장 첫 AWS 배포 경로

1. 로컬에서 `npm --prefix apps/web run build`로 프론트엔드를 빌드한다.
2. 정적 프론트엔드를 Amplify Hosting 또는 S3 + CloudFront에 배포한다.
3. 초기 공개 데모는 로컬/데모 데이터 fallback을 유지한다.
4. 필요 시 `apps/api/src/revenue-ops/data/revenue_ops_export.json`을 S3에 업로드해 정적 JSON으로 제공한다.
5. 이후 API Gateway + Lambda로 read-only Revenue Ops API를 붙인다.
6. 더 나중에 Aurora action status persistence를 선택적으로 연결한다.

## Option A: Amplify Hosting

- 역할: `apps/web` 빌드 결과를 정적 웹앱으로 호스팅한다.
- 장점: 설정이 가장 단순하고, 발표/포트폴리오용 URL 확보가 빠르다.
- 한계: API-backed mode는 별도 API 또는 정적 JSON 엔드포인트가 필요하다.
- 복잡도/리스크: 낮음.

## Option B: S3 + CloudFront + S3 hosted JSON

- 역할: 프론트엔드는 S3 + CloudFront로 배포하고, Revenue Ops JSON export도 S3 객체로 제공한다.
- 장점: 운영 구성 요소가 적고 비용이 낮다.
- 한계: action status PATCH는 정적 JSON만으로는 지속 저장할 수 없다.
- 복잡도/리스크: 낮음에서 중간.

## Option C: API Gateway + Lambda read-only Revenue Ops API

- 역할: `/api/v1/revenue/*` read endpoint를 Lambda로 제공한다.
- 장점: `#revenue-cockpit?data=api` 모드와 가장 자연스럽게 연결된다.
- 한계: PATCH action status를 유지하려면 별도 저장소가 필요하다.
- 복잡도/리스크: 중간.

## 선택적 Aurora persistence

Action Planner 상태를 운영 정본으로 저장하려면 Aurora action tracking schema를 런타임에 연결할 수 있다. 다만 로컬/포트폴리오 데모에서는 Aurora가 필수는 아니다. 현재 구조는 Aurora 연결을 준비하되, API foundation의 in-memory 상태 변경과 demo fallback으로도 화면 시연이 가능하다.

## 실제 배포 전 필요 조건

- 정적 배포 URL 또는 API base URL 결정
- CORS 정책과 도메인 구성 결정
- `revenue_ops_export.json` 제공 방식 결정
- action status persistence 필요 여부 결정
- 배포 환경별 validation command 실행
- 민감정보, raw payload, 로컬 파일 경로 노출 여부 점검

## M5에서 무거운 인프라를 다시 도입하지 않는 이유

M5의 목적은 새로운 운영 플랫폼 확장이 아니라 M3/M4 산출물을 검증 가능하고 설명 가능한 상태로 닫는 것이다. MSK, EKS, Airflow 같은 무거운 런타임 인프라는 현재 발표/포트폴리오 목표 대비 비용과 리스크가 크다. 우선은 정적 프론트엔드, 정적 JSON, 선택적 Lambda API 정도의 최소 경로가 적합하다.

## 배포 금지 메모

이 문서는 readiness 정리만 수행한다. 아직 AWS에 배포하지 않았으며, Terraform apply 또는 AWS 리소스 생성은 명시적 승인 전까지 실행하지 않는다.
