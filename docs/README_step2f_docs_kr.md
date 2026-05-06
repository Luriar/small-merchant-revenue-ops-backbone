# STEP 2-F / M6 문서 번들 안내

이 번들은 `small-merchant-revenue-ops-backbone` 프로젝트의 STEP 2-E 후반부부터 STEP 2-F 인증/보안 마무리까지의 handoff 문서 묶음입니다.

## 어디에 넣어야 하는가

프로젝트 루트 기준으로 **`docs/` 디렉터리**에 넣는 것을 권장합니다.

```text
~/projects/small-merchant-revenue-ops-backbone/
  docs/
    step2f_auth_jwt_handoff_kr.md
    step2f_auth_validation_report_kr.md
    step2f_auth_operations_runbook_kr.md
    m6_packaging_handoff_kr.md
    m6_final_closure_checklist_kr.md
    README_step2f_docs_kr.md
```

`docs/`에 넣는 이유는 이 문서들이 구현 결과, 검증 로그, 운영 절차, 다음 작업 인계용 문서이기 때문입니다. `sources/`는 설계 원천 문서나 기준 스펙을 두는 곳으로 유지하는 편이 좋습니다.

## 복사 예시

```bash
cd ~/projects/small-merchant-revenue-ops-backbone
unzip -o /path/to/step2f_handoff_m6_docs_bundle.zip -d /tmp/step2f_handoff_docs
cp /tmp/step2f_handoff_docs/docs/*.md docs/

git status --short
git add docs/step2f_auth_jwt_handoff_kr.md   docs/step2f_auth_validation_report_kr.md   docs/step2f_auth_operations_runbook_kr.md   docs/m6_packaging_handoff_kr.md   docs/m6_final_closure_checklist_kr.md   docs/README_step2f_docs_kr.md

git commit -m "docs: add step 2f auth handoff and m6 packaging notes"
```

## 포함 문서

- `step2f_auth_jwt_handoff_kr.md`: STEP 2-F 인증/JWT 적용 결과 handoff
- `step2f_auth_validation_report_kr.md`: 실제 검증 기준, 명령어, 기대 결과
- `step2f_auth_operations_runbook_kr.md`: 로그인, 로그아웃, CORS, JWT, 토큰 만료 runbook
- `m6_packaging_handoff_kr.md`: M6 포트폴리오/README/시연 패키징 인계
- `m6_final_closure_checklist_kr.md`: M6 종료 전 최종 점검 체크리스트
