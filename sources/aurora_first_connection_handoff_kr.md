# Aurora First Connection Handoff

## Current Status

- AWS CLI 인증은 완료되었다.
- `AURORA_DATABASE_URL`은 아직 비어 있다.
- 실제 Aurora DB는 아직 미생성이다.
- `sources/aurora_ddl_v2.sql`은 아직 실제 DB에 적용하지 않았다.
- 로컬 pre-AWS validation은 완료되었다.
- commit `2bccc61 Add read-only Aurora connection smoke`는 완료되었다.

## Next Order

1. M1 Terraform infra 작성
2. `terraform fmt` / `terraform validate` / `terraform plan`
3. `terraform apply`
4. SSM bastion 접속 또는 port-forwarding
5. `sources/aurora_ddl_v2.sql` + post-baseline SQL 적용
6. runtime consistency checks 실행
7. `node apps/api/src/aurora-connection-smoke.js` 실행

## Do Not Start Yet

- ClickHouse/CDC를 먼저 시작하지 않는다.
- OpenAPI / DTO / handler / frontend를 수정하지 않는다.
- fake analytics를 만들지 않는다.

## Notes

이 handoff는 Aurora-first connection 준비를 위한 기준 요약이다. 실행 경로는 `infra/`와 `apps/`에 남겨 두고, `sources/`에는 기준 문서만 보관한다.
