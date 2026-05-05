# STEP 2-C: Frontend Asset Deploy + Smoke Test

## 1. 목적

STEP 2-C의 목적은 `apps/web` production build output만 기존 frontend S3 bucket에 배포하고, CloudFront 경유로 Revenue Cockpit SPA route가 로드되는지 smoke test하는 것이다.

승인 범위:

- `apps/web/dist/` contents upload
- bucket: `s3://revenue-ops-frontend-dev-827913617635/`
- CloudFront distribution: `E31KH7PFML1A6N`
- invalidation path: `/*`

Hard stop:

- Terraform apply 금지
- Terraform infrastructure 수정 금지
- API/Auth/Aurora/Pipeline 활성화 금지
- live collector 실행 금지
- POS ingestion 금지
- Product Ops/productops resource 수정 금지
- build output 외 파일 upload 금지
- secret/local tfvars/tfstate/tfplan upload 금지

## 2. 사전 확인

Git:

- 작업 시작 시 working tree clean
- latest commit: `68e8055 docs: record STEP 2-B frontend foundation completion`
- STEP 2-B completion docs committed 확인

Frontend routing:

- `#revenue-cockpit` hash route는 `apps/web/src/App.tsx`에서 `revenue-cockpit` page로 resolve된다.
- `#revenue-cockpit?data=api`는 hash query를 유지하며 Revenue Cockpit 내부에서 API mode로 해석된다.
- API mode는 `/api/v1/revenue/*` fetch 실패 시 demo fallback data를 사용한다.

Build output path:

```text
apps/web/dist
```

## 3. Local Build Checks

Commands:

```bash
npm --prefix apps/web run check
npm --prefix apps/web run build
```

Results:

- `check`: passed (`tsc --noEmit`)
- `build`: passed (`tsc -b && vite build`)

Build output:

```text
apps/web/dist/index.html                   414 bytes
apps/web/dist/assets/index-B9P7aV8v.js     322204 bytes
apps/web/dist/assets/index-BOX0Snck.css    25896 bytes
```

Build output safety scan:

- no `.tfvars`
- no `.tfstate`
- no `tfplan`
- no `.env`
- no Terraform backend/state strings
- no AWS secret/access key marker
- no private key marker

Generated local note:

- `apps/web/tsconfig.tsbuildinfo` changed during build.
- It was restored to keep STEP 2-C commit scope docs-only.

## 4. S3 Upload

Command:

```bash
aws s3 sync apps/web/dist/ s3://revenue-ops-frontend-dev-827913617635/ --delete
```

Result: upload succeeded.

Uploaded objects:

```text
assets/index-B9P7aV8v.js   322204 bytes
assets/index-BOX0Snck.css   25896 bytes
index.html                    414 bytes
```

Bucket policy remained scoped to CloudFront distribution `E31KH7PFML1A6N`:

```text
Principal: cloudfront.amazonaws.com
Action: s3:GetObject
Resource: arn:aws:s3:::revenue-ops-frontend-dev-827913617635/*
Condition AWS:SourceArn: arn:aws:cloudfront::827913617635:distribution/E31KH7PFML1A6N
```

## 5. CloudFront Invalidation

Command attempted:

```bash
aws cloudfront create-invalidation \
  --distribution-id E31KH7PFML1A6N \
  --paths '/*'
```

Result: failed due IAM permission.

```text
AccessDenied: de-ai-12 is not authorized to perform cloudfront:CreateInvalidation
on arn:aws:cloudfront::827913617635:distribution/E31KH7PFML1A6N
```

Invalidation ID/status:

```text
not created
```

Impact:

- This was the first frontend asset deploy to the distribution, so CloudFront fetched the uploaded objects on demand during smoke tests.
- Future deploys need `cloudfront:CreateInvalidation` permission or another cache management strategy.

No additional IAM permission was added in STEP 2-C.

## 6. Smoke Test Results

CloudFront distribution:

```text
id: E31KH7PFML1A6N
domain: d1fquuc7vsf9cu.cloudfront.net
status: Deployed
enabled: true
```

Root:

```bash
curl -I https://d1fquuc7vsf9cu.cloudfront.net/
```

Result:

- HTTP 200
- `content-type: text/html`
- `content-length: 414`
- `x-cache: Miss from cloudfront`

Index:

```bash
curl -I https://d1fquuc7vsf9cu.cloudfront.net/index.html
```

Result:

- HTTP 200
- `content-type: text/html`
- `content-length: 414`

Static JS:

```bash
curl -I https://d1fquuc7vsf9cu.cloudfront.net/assets/index-B9P7aV8v.js
```

Result:

- HTTP 200
- `content-type: text/javascript`
- `content-length: 322204`

Static CSS:

```bash
curl -I https://d1fquuc7vsf9cu.cloudfront.net/assets/index-BOX0Snck.css
```

Result:

- HTTP 200
- `content-type: text/css`
- `content-length: 25896`

Revenue Cockpit hash route:

```bash
curl -I 'https://d1fquuc7vsf9cu.cloudfront.net/#revenue-cockpit'
```

Result:

- HTTP 200
- SPA shell served
- Note: URL fragments are handled by the browser and are not sent to CloudFront. Curl verifies the same SPA shell that the browser loads before React resolves the hash route.

Revenue Cockpit API-mode hash route:

```bash
curl -I 'https://d1fquuc7vsf9cu.cloudfront.net/#revenue-cockpit?data=api'
```

Result:

- HTTP 200
- SPA shell served
- Browser-side code will interpret `data=api` from the hash query.

API path check:

```bash
curl -I https://d1fquuc7vsf9cu.cloudfront.net/api/v1/revenue/briefs
```

Result:

- HTTP 200
- `content-type: text/html`
- `x-cache: Error from cloudfront`

Interpretation:

- API Gateway/Lambda is still not deployed.
- CloudFront custom error handling returns the SPA shell for missing paths.
- Revenue Cockpit API mode should fall back to demo data because API responses are not valid JSON API payloads.

SPA fallback check:

```bash
curl -I https://d1fquuc7vsf9cu.cloudfront.net/nonexistent-spa-route
```

Result:

- HTTP 200
- SPA shell served through CloudFront custom error fallback

## 7. Unexpected Resource Check

Read-only Terraform state check found no STEP 2-C-created resources for:

- API Gateway
- Lambda Revenue Ops API
- Cognito
- Aurora/RDS
- Glue
- Athena
- Step Functions
- EventBridge Scheduler
- SSM external API parameters
- SaaS CloudWatch alarms

No Terraform apply was run in STEP 2-C.

## 8. Known Limitations

Still disabled:

- API Gateway + Lambda Revenue Ops API
- Cognito auth
- Aurora Serverless v2 persistence
- ETL pipeline foundation
- EventBridge schedules
- live external collectors
- POS ingestion

Frontend deployment limitation:

- CloudFront invalidation was not created because `cloudfront:CreateInvalidation` is missing.
- Smoke tests still passed because CloudFront fetched the new objects during first access.

Runtime limitation:

- `#revenue-cockpit?data=api` can load the SPA shell, but the API backend is not deployed yet.
- API mode therefore remains fallback/demo-backed.

## 9. STEP 2-C 결론

Frontend asset deploy succeeded.

Completed:

- local web check
- production build
- build output safety scan
- upload to S3 frontend bucket
- CloudFront root/index/static asset smoke tests
- Revenue Cockpit hash route smoke tests
- API-mode fallback boundary check

Not completed:

- CloudFront invalidation, blocked by missing IAM permission

Next step:

- STEP 2-D API Gateway + Lambda Activation

Before future frontend deploys:

- add narrowly scoped `cloudfront:CreateInvalidation` permission for distribution `E31KH7PFML1A6N`, or document an alternate cache-control strategy.

## 10. Invalidation Permission Fix and Final Completion

추가 승인:

```text
Approved to add narrowly scoped CloudFront invalidation permissions for distribution E31KH7PFML1A6N and create a CloudFront invalidation for /* only.
```

Resource-scoped IAM simulation before mutation:

```text
cloudfront:CreateInvalidation -> allowed with resource arn:aws:cloudfront::827913617635:distribution/E31KH7PFML1A6N
cloudfront:GetInvalidation -> allowed with resource arn:aws:cloudfront::827913617635:distribution/E31KH7PFML1A6N
cloudfront:ListInvalidations -> allowed with resource arn:aws:cloudfront::827913617635:distribution/E31KH7PFML1A6N
```

IAM statement added to inline policy `RevenueOpsFrontendCloudFrontFoundationAccess` on user `de-ai-12`:

```json
{
  "Sid": "RevenueOpsFrontendCloudFrontInvalidation",
  "Effect": "Allow",
  "Action": [
    "cloudfront:CreateInvalidation",
    "cloudfront:GetInvalidation",
    "cloudfront:ListInvalidations"
  ],
  "Resource": "arn:aws:cloudfront::827913617635:distribution/E31KH7PFML1A6N"
}
```

Effective permission simulation after mutation:

```text
cloudfront:CreateInvalidation -> allowed
cloudfront:GetInvalidation -> allowed
cloudfront:ListInvalidations -> allowed
```

Invalidation command:

```bash
aws cloudfront create-invalidation \
  --distribution-id E31KH7PFML1A6N \
  --paths '/*'
```

Invalidation result:

```text
id: IBJ8QTVVEOBWYF4NQREIPCR8JP
path: /*
initial status: InProgress
final status: Completed
create time: 2026-05-05T16:27:25.197000+00:00
```

Wait command:

```bash
aws cloudfront wait invalidation-completed \
  --distribution-id E31KH7PFML1A6N \
  --id IBJ8QTVVEOBWYF4NQREIPCR8JP
```

Final smoke checks after invalidation:

| URL | Result |
| --- | --- |
| `https://d1fquuc7vsf9cu.cloudfront.net/` | HTTP 200 HTML |
| `https://d1fquuc7vsf9cu.cloudfront.net/index.html` | HTTP 200 HTML |
| `https://d1fquuc7vsf9cu.cloudfront.net/#revenue-cockpit` | HTTP 200 SPA shell |
| `https://d1fquuc7vsf9cu.cloudfront.net/#revenue-cockpit?data=api` | HTTP 200 SPA shell |

Frontend bucket object list after invalidation remains exactly:

```text
assets/index-B9P7aV8v.js
assets/index-BOX0Snck.css
index.html
```

Unexpected resource check:

- API Gateway: none
- Lambda Revenue Ops API: none
- Cognito: none
- Aurora/RDS: none
- Glue/Athena/Step Functions/EventBridge: none
- SSM external API parameters: none
- SaaS CloudWatch alarms: none

Final STEP 2-C status:

```text
complete
```

STEP 2-C now includes:

- frontend build
- S3 upload
- CloudFront invalidation
- post-invalidation smoke test

Still intentionally disabled:

- API/Auth/Aurora/ETL
- live collectors
- POS ingestion
