# STEP 2-D Frontend API Wiring Smoke

## 1. 맥락

이번 작업은 small-merchant Revenue Ops SaaS의 `#revenue-cockpit?data=api` 경로가 live API Gateway endpoint를 사용하도록 연결하고, 기존 demo fallback 동작은 유지하는 것이다.

고정한 비활성 범위:

- Cognito/Auth disabled
- Aurora/RDS disabled
- ETL/pipeline/schedule disabled
- live collector disabled
- POS ingestion disabled
- Product Ops/productops resources untouched
- Terraform apply not run

## 2. 작업 범위

변경 파일:

- `apps/web/src/revenue-cockpit/revenueCockpitApi.ts`

변경 내용:

- 기존 Revenue Cockpit API base는 relative `/api/v1/revenue`였다.
- `VITE_REVENUE_API_BASE_URL`을 우선 사용하도록 했다.
- env 값이 없으면 live API Gateway endpoint를 기본 origin으로 사용한다.

사용 endpoint:

```text
https://7q8hxxta67.execute-api.ap-northeast-2.amazonaws.com
```

최종 API base:

```text
https://7q8hxxta67.execute-api.ap-northeast-2.amazonaws.com/api/v1/revenue
```

Demo fallback:

- `RevenueCockpitApp`의 기존 `catch` fallback은 변경하지 않았다.
- 기본 `#revenue-cockpit` demo mode도 변경하지 않았다.
- API mode에서 fetch 실패 시 기존 demo scenario/status fallback이 유지된다.

## 3. Build

명령:

```bash
npm --prefix apps/web run check
npm --prefix apps/web run build
```

결과:

- `check`: passed
- `build`: passed

생성 output:

```text
apps/web/dist/index.html
apps/web/dist/assets/index-BOX0Snck.css
apps/web/dist/assets/index-_S6L24XV.js
```

Build output safety scan:

- no `.tfvars`
- no `.tfstate`
- no `tfplan`
- no `.env`
- no AWS access key marker
- no AWS secret key marker
- no private key marker
- no local secret marker

참고:

- broad `SECRET` 문자열 scan은 React production bundle 내부의 `__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED` 문자열 때문에 hit가 발생할 수 있다.
- credential/private key/Terraform/env marker scan은 clean이었다.

## 4. Deploy

Upload target:

```text
s3://revenue-ops-frontend-dev-827913617635/
```

명령:

```bash
aws s3 sync apps/web/dist/ s3://revenue-ops-frontend-dev-827913617635/ --delete
```

결과:

- upload succeeded
- old JS asset `assets/index-B9P7aV8v.js` deleted
- uploaded:
  - `index.html`
  - `assets/index-BOX0Snck.css`
  - `assets/index-_S6L24XV.js`

CloudFront distribution:

```text
E31KH7PFML1A6N
```

Invalidation command:

```bash
aws cloudfront create-invalidation \
  --distribution-id E31KH7PFML1A6N \
  --paths '/*'
```

Invalidation:

```text
id: I6D2N3JDMDI967RDWT2KOE117J
path: /*
initial status: InProgress
final status: Completed
create time: 2026-05-06T00:37:22.700000+00:00
```

Wait command:

```bash
aws cloudfront wait invalidation-completed \
  --distribution-id E31KH7PFML1A6N \
  --id I6D2N3JDMDI967RDWT2KOE117J
```

Result:

- completed

## 5. Frontend Smoke Test

Smoke test URLs:

| URL | Result |
| --- | --- |
| `https://d1fquuc7vsf9cu.cloudfront.net/` | HTTP 200 HTML |
| `https://d1fquuc7vsf9cu.cloudfront.net/#revenue-cockpit` | HTTP 200 SPA shell |
| `https://d1fquuc7vsf9cu.cloudfront.net/#revenue-cockpit?data=api` | HTTP 200 SPA shell |
| `https://d1fquuc7vsf9cu.cloudfront.net/assets/index-_S6L24XV.js` | HTTP 200 JavaScript |

중요:

- curl은 URL fragment를 서버로 보내지 않는다.
- 따라서 `#revenue-cockpit`과 `#revenue-cockpit?data=api`에 대한 curl은 CloudFront/S3가 최신 SPA shell을 제공하는지만 확인한다.
- React가 실제 브라우저에서 hash query를 읽고 API Gateway로 fetch하는지는 수동 브라우저 확인이 필요하다.

## 6. Direct API Smoke Test

API base:

```text
https://7q8hxxta67.execute-api.ap-northeast-2.amazonaws.com
```

결과:

| Endpoint | Result | Content-Type |
| --- | --- | --- |
| `GET /api/v1/revenue/briefs` | HTTP 200 | `application/json; charset=utf-8` |
| `GET /api/v1/revenue/anomalies` | HTTP 200 | `application/json; charset=utf-8` |
| `GET /api/v1/revenue/actions` | HTTP 200 | `application/json; charset=utf-8` |
| `GET /api/v1/revenue/context` | HTTP 200 | `application/json; charset=utf-8` |
| `GET /api/v1/revenue/pipeline-meta` | HTTP 200 | `application/json; charset=utf-8` |

API smoke response check:

- JSON returned
- no stack trace observed
- no secret observed
- no tfvars/tfstate/tfplan observed
- no raw internal error observed

## 7. 수용 기준

충족:

- `#revenue-cockpit?data=api` build now points Revenue Cockpit API calls to live API Gateway.
- demo fallback behavior remains intact.
- default `#revenue-cockpit` demo mode remains intact.
- no UI redesign.
- no Terraform apply.
- no Auth/Aurora/ETL/schedule/live collector/POS ingestion.
- no Product Ops/productops resource touched.
- build output uploaded and CloudFront invalidated.
- direct API smoke passed.

남은 수동 확인:

- Browser에서 `https://d1fquuc7vsf9cu.cloudfront.net/#revenue-cockpit?data=api`를 열고 DevTools Network에서 `https://7q8hxxta67.execute-api.ap-northeast-2.amazonaws.com/api/v1/revenue/*` fetch가 발생하는지 확인한다.
- Browser 화면에서 API loading notice가 사라지고 API-backed data가 렌더링되는지 확인한다.

## 8. Known Limitations

- Cognito/Auth는 아직 없다.
- Aurora persistence는 아직 없다.
- API는 export-backed/static-data-backed다.
- Action status update는 durable persistence가 아니다.
- live external collector는 없다.
- POS real ingestion은 없다.
- curl만으로 React/browser JS fetch behavior를 증명하지 않았다.
