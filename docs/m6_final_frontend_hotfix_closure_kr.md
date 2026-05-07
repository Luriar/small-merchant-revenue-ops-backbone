# M6 Final Frontend Hotfix Closure

## 완료 일시
2026-05-07

## 최종 커밋
0308afa fix(web): clarify reliability states and dedupe cause candidates

## 배포 정보
- Release ID: m6-final-frontend-hotfix-20260507-120505
- Frontend bucket: revenue-ops-frontend-dev-827913617635
- CloudFront distribution: E31KH7PFML1A6N
- CloudFront domain: d1fquuc7vsf9cu.cloudfront.net
- Invalidation ID: ICFFVEUZCLX92TQKF7V8K597J7

## 완료한 작업
- Data Reliability 화면에서 공개 맥락 collector와 외부 connector 대기 상태를 분리 표시
- 공개 맥락 데이터 8/8 정상, 외부 연동 2개 대기, 실패 0 구조로 표시 가능하도록 수정
- KMA `no_weather_items` 상태를 실패가 아닌 `관측 없음`으로 표시
- 원인 후보 중복 제거
- store bar 상태 문구 축약
- 계정/logout chip 높이 미세 조정
- frontend deploy script에서 S3 root sync를 release prefix 복사가 아닌 dist 직접 sync로 안정화
- root `index.html` 존재 확인 추가
- CloudFront invalidation 완료

## 검증 결과
- `npm --prefix apps/web run check` 통과
- `npm --prefix apps/web run build` 통과
- GitHub Actions CI 통과
- S3 root `index.html` 확인 완료
- CloudFront `HTTP/2 200` 확인 완료
- main fast-forward merge 완료
- origin/main push 완료
- Le'blanc store 기준 live context collect 재실행 후 8 completed / 2 skipped / 0 failed 확인

## 참고 사항
GitHub Actions에서 Node.js 20 deprecation warning이 표시되었으나 CI 실패는 아니다. Node 24 대응은 M7 production hardening 단계에서 별도 처리한다.

## 최종 상태
M6 프론트 핫픽스와 live context 표시 흐름은 종료 가능 상태다.

남은 작업은 M6 전체 포트폴리오 패키징, README/스크린샷/시연 가이드 최종 정리, 이후 production hardening 단계로 분리한다.
