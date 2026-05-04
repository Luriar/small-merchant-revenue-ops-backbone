# M1.1 Aurora-backed Operational API Smoke

## 1. 맥락

M1.1 smoke는 Aurora-backed store 설정에서 운영 API의 최소 세로 흐름이 실제 Aurora에 기록되고, issue read API가 PII-safe projection만 반환하는지 확인하는 수동 절차다.

이 절차는 release-to-issue traceability 기반 Product Ops Backbone의 M1.1 확인용이다. OpenAPI, DTO, handler, frontend, ClickHouse, CDC, MSK, EKS, endpoint contract는 이 smoke 절차의 변경 범위가 아니다.

## 2. 작업 범위

검증 대상:

- `POST /api/v1/changes` create/replay가 Aurora `prod_change` 및 idempotency ledger에 반영된다.
- `POST /api/v1/events/intake` create/replay가 Aurora `event_intake`에 반영된다.
- `POST /api/v1/issues/intake` create/replay가 Aurora `issue` 및 idempotency ledger에 반영된다.
- `GET /api/v1/issues/{issue_id}`가 safe projection만 반환한다.
- `GET /api/v1/issues`가 safe projection만 반환한다.
- raw issue `title`, `body`, `reporter`, `payload` 값이 응답에 노출되지 않는다.
- issue detail은 `body_present`, `reporter_present` 같은 safe presence flag를 반환할 수 있다.

범위 밖:

- OpenAPI, DTO, handler, frontend, ClickHouse, CDC, MSK, EKS, endpoint contract 변경.
- 실제 Aurora URL, 토큰, secret 값 기록.
- 운영/고객 PII를 사용하는 smoke.

## 3. 사전 조건

- API가 Aurora-backed store로 실행 중이어야 한다.
- 수동 확인 셸에 `curl`, `jq`, `psql`, `grep`이 있어야 한다.
- `AURORA_DATABASE_URL` 또는 `DATABASE_URL`은 로컬 셸/런타임에만 주입하고 문서, 로그, PR, 이슈에 남기지 않는다.
- secret ARN, API endpoint, token, issue id는 모두 placeholder로 기록한다.
- smoke payload는 비운영 synthetic sentinel 값만 사용한다.

예시 placeholder:

```bash
export API_BASE_URL='https://<api-endpoint>'
export AURORA_DATABASE_URL_SECRET_ARN='<aurora-database-url-secret-arn>'
# If auth is enabled, pass placeholders in the curl examples:
# Authorization: Bearer <operator-token-placeholder>
# Authorization: Bearer <viewer-token-placeholder>
```

DB URL을 secret manager에서 가져와야 하는 환경에서는 값을 출력하지 않는다.

```bash
export AURORA_DATABASE_URL="$(aws secretsmanager get-secret-value \
  --secret-id "$AURORA_DATABASE_URL_SECRET_ARN" \
  --query SecretString \
  --output text)"
```

## 4. Synthetic Smoke 값

매 실행마다 suffix를 바꿔 충돌을 피한다.

```bash
export SMOKE_SUFFIX='m1-1-<yyyymmddhhmm>'
export CHANGE_IDEMPOTENCY_KEY="smoke-change-${SMOKE_SUFFIX}"
export EVENT_ID="smoke-event-${SMOKE_SUFFIX}"
export ISSUE_IDEMPOTENCY_KEY="smoke-issue-${SMOKE_SUFFIX}"
export ISSUE_EXTERNAL_ID="smoke-ext-${SMOKE_SUFFIX}"

export RAW_TITLE_SENTINEL="SMOKE_RAW_TITLE_SENTINEL_${SMOKE_SUFFIX}"
export RAW_BODY_SENTINEL="SMOKE_RAW_BODY_SENTINEL_${SMOKE_SUFFIX}"
export RAW_REPORTER_SENTINEL="smoke-reporter-${SMOKE_SUFFIX}@example.invalid"
export RAW_PAYLOAD_SENTINEL="SMOKE_RAW_PAYLOAD_SENTINEL_${SMOKE_SUFFIX}"
```

주의:

- `/api/v1/issues/intake`에는 `affected_service`를 보내지 않는다.
- `event_intake` DB 검증은 `created_at`을 사용한다. `accepted_at` 컬럼을 기대하지 않는다.
- safe projection 검증에서 `body_present`, `reporter_present` 같은 presence flag 필드명 자체를 grep 실패 조건으로 삼지 않는다. raw sentinel 값만 검색한다.

## 5. Smoke 절차

### 5.1 Change intake create/replay

Create:

```bash
curl -sS -X POST "$API_BASE_URL/api/v1/changes" \
  -H 'content-type: application/json' \
  -H 'Authorization: Bearer <operator-token-placeholder>' \
  -d '{
    "idempotency_key": "'"$CHANGE_IDEMPOTENCY_KEY"'",
    "change_type": "release",
    "title": "M1.1 smoke release",
    "target_service": "checkout",
    "source": "m1_1_smoke",
    "occurred_at": "2026-04-30T00:00:00.000Z"
  }' | tee /tmp/m1_1_change_create.json
```

Replay with the same request body:

```bash
curl -sS -X POST "$API_BASE_URL/api/v1/changes" \
  -H 'content-type: application/json' \
  -H 'Authorization: Bearer <operator-token-placeholder>' \
  -d '{
    "idempotency_key": "'"$CHANGE_IDEMPOTENCY_KEY"'",
    "change_type": "release",
    "title": "M1.1 smoke release",
    "target_service": "checkout",
    "source": "m1_1_smoke",
    "occurred_at": "2026-04-30T00:00:00.000Z"
  }' | tee /tmp/m1_1_change_replay.json
```

Expected:

- Create returns a `change_id`.
- Replay returns the same `change_id`.
- Replay has `idempotent_replay=true`.

Aurora verification:

```bash
export CHANGE_ID="$(jq -r '.change_id' /tmp/m1_1_change_create.json)"

psql "$AURORA_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v change_id="$CHANGE_ID" \
  -v idempotency_key="$CHANGE_IDEMPOTENCY_KEY" \
  -c "SELECT change_id, target_service, source, occurred_at, created_at FROM prod_change WHERE change_id = :'change_id';" \
  -c "SELECT request_type, idempotency_key, change_id, created_at FROM change_intake_idempotency WHERE idempotency_key = :'idempotency_key';"
```

### 5.2 Event intake create/replay

Create:

```bash
curl -sS -X POST "$API_BASE_URL/api/v1/events/intake" \
  -H 'content-type: application/json' \
  -H 'Authorization: Bearer <operator-token-placeholder>' \
  -d '{
    "event_id": "'"$EVENT_ID"'",
    "occurred_at": "2026-04-30T00:01:00.000Z",
    "target_service": "checkout",
    "event_type": "product",
    "event_subtype": "checkout_completed",
    "source": "m1_1_smoke",
    "retry_count": 0,
    "is_error": false,
    "payload": {
      "smoke_marker": "event-intake"
    }
  }' | tee /tmp/m1_1_event_create.json
```

Replay with the same `event_id`:

```bash
curl -sS -X POST "$API_BASE_URL/api/v1/events/intake" \
  -H 'content-type: application/json' \
  -H 'Authorization: Bearer <operator-token-placeholder>' \
  -d '{
    "event_id": "'"$EVENT_ID"'",
    "occurred_at": "2026-04-30T00:01:00.000Z",
    "target_service": "checkout",
    "event_type": "product",
    "event_subtype": "checkout_completed",
    "source": "m1_1_smoke",
    "retry_count": 0,
    "is_error": false,
    "payload": {
      "smoke_marker": "event-intake"
    }
  }' | tee /tmp/m1_1_event_replay.json
```

Expected:

- Create returns the submitted `event_id`.
- Replay returns the same `event_id`.
- Replay has `idempotent_replay=true`.

Aurora verification:

```bash
psql "$AURORA_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v event_id="$EVENT_ID" \
  -c "SELECT event_id, target_service, event_type, event_subtype, source, occurred_at, created_at FROM event_intake WHERE event_id = :'event_id';"
```

### 5.3 Issue intake create/replay

Create:

```bash
curl -sS -X POST "$API_BASE_URL/api/v1/issues/intake" \
  -H 'content-type: application/json' \
  -H 'Authorization: Bearer <operator-token-placeholder>' \
  -d '{
    "idempotency_key": "'"$ISSUE_IDEMPOTENCY_KEY"'",
    "external_id": "'"$ISSUE_EXTERNAL_ID"'",
    "source": "m1_1_smoke",
    "title": "'"$RAW_TITLE_SENTINEL"'",
    "body": "'"$RAW_BODY_SENTINEL"'",
    "issue_family": "checkout_failure",
    "severity": 2,
    "payload": {
      "raw_payload_marker": "'"$RAW_PAYLOAD_SENTINEL"'"
    },
    "reporter": "'"$RAW_REPORTER_SENTINEL"'",
    "occurred_at": "2026-04-30T00:02:00.000Z"
  }' | tee /tmp/m1_1_issue_create.json
```

Replay with the same `source + external_id` and same `idempotency_key`:

```bash
curl -sS -X POST "$API_BASE_URL/api/v1/issues/intake" \
  -H 'content-type: application/json' \
  -H 'Authorization: Bearer <operator-token-placeholder>' \
  -d '{
    "idempotency_key": "'"$ISSUE_IDEMPOTENCY_KEY"'",
    "external_id": "'"$ISSUE_EXTERNAL_ID"'",
    "source": "m1_1_smoke",
    "title": "'"$RAW_TITLE_SENTINEL"'",
    "body": "'"$RAW_BODY_SENTINEL"'",
    "issue_family": "checkout_failure",
    "severity": 2,
    "payload": {
      "raw_payload_marker": "'"$RAW_PAYLOAD_SENTINEL"'"
    },
    "reporter": "'"$RAW_REPORTER_SENTINEL"'",
    "occurred_at": "2026-04-30T00:02:00.000Z"
  }' | tee /tmp/m1_1_issue_replay.json
```

Expected:

- Create returns an `issue_id`.
- Replay returns the same `issue_id`.
- Replay has `idempotent_replay=true`.

Aurora verification:

```bash
export ISSUE_ID="$(jq -r '.issue_id' /tmp/m1_1_issue_create.json)"

psql "$AURORA_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v issue_id="$ISSUE_ID" \
  -v idempotency_key="$ISSUE_IDEMPOTENCY_KEY" \
  -c "SELECT issue_id, source, external_id, issue_family, severity, status, created_at, body IS NOT NULL AS body_present, reporter IS NOT NULL AS reporter_present, payload IS NOT NULL AS payload_present FROM issue WHERE issue_id = :'issue_id';" \
  -c "SELECT request_type, idempotency_key, issue_id, created_at FROM issue_intake_idempotency WHERE idempotency_key = :'idempotency_key';"
```

### 5.4 Issue detail safe projection

```bash
curl -sS "$API_BASE_URL/api/v1/issues/$ISSUE_ID" \
  -H 'Authorization: Bearer <viewer-token-placeholder>' \
  | tee /tmp/m1_1_issue_detail.json
```

Expected safe fields may include:

- `issue_id`
- `issue_family`
- `severity`
- `status`
- `summary`
- `source`
- `external_id_present`
- `created_at`
- `body_present`
- `reporter_present`
- `affected_variation_present`
- `keywords_count`

Raw value leak check:

```bash
grep -F "$RAW_TITLE_SENTINEL" /tmp/m1_1_issue_detail.json
grep -F "$RAW_BODY_SENTINEL" /tmp/m1_1_issue_detail.json
grep -F "$RAW_REPORTER_SENTINEL" /tmp/m1_1_issue_detail.json
grep -F "$RAW_PAYLOAD_SENTINEL" /tmp/m1_1_issue_detail.json
```

Expected:

- Each `grep -F` command returns no output and exits non-zero.
- Do not fail this check only because field names such as `body_present` or `reporter_present` appear.

Presence flag check:

```bash
jq '.body_present, .reporter_present' /tmp/m1_1_issue_detail.json
```

Expected:

- Presence flags may be `true` when the raw fields were stored.
- The raw values still must not appear.

### 5.5 Issue list safe projection

```bash
curl -sS "$API_BASE_URL/api/v1/issues?limit=20" \
  -H 'Authorization: Bearer <viewer-token-placeholder>' \
  | tee /tmp/m1_1_issue_list.json
```

Raw value leak check:

```bash
grep -F "$RAW_TITLE_SENTINEL" /tmp/m1_1_issue_list.json
grep -F "$RAW_BODY_SENTINEL" /tmp/m1_1_issue_list.json
grep -F "$RAW_REPORTER_SENTINEL" /tmp/m1_1_issue_list.json
grep -F "$RAW_PAYLOAD_SENTINEL" /tmp/m1_1_issue_list.json
```

Expected:

- Each `grep -F` command returns no output and exits non-zero.
- List projection must not include raw `title`, `body`, `reporter`, `payload`, raw `keywords`, raw `external_id`, or raw `affected_variation`.
- Safe presence/count fields are allowed when defined by the read DTO.

## 6. 수용 기준

M1.1 smoke passes only when all of the following are true:

- Change create/replay returns one stable `change_id`, and Aurora contains the `prod_change` row plus idempotency ledger row.
- Event create/replay returns one stable `event_id`, and Aurora contains one `event_intake` row verified with `created_at`.
- Issue create/replay returns one stable `issue_id`, and Aurora contains the `issue` row plus fallback idempotency ledger row when applicable.
- Issue detail returns safe projection only.
- Issue list returns safe projection only.
- Raw issue title/body/reporter/payload sentinel values do not appear in read responses.
- Secret ARN, bearer token, and actual Aurora database URL are not printed or committed.

## 7. 산출물 요약 템플릿

After a manual run, record only placeholders and pass/fail status:

```text
M1.1 Aurora-backed operational API smoke

Date:
Environment:
API endpoint: <api-endpoint>
Aurora secret ARN: <aurora-database-url-secret-arn>

Change intake:
- create status:
- replay status:
- change_id: <change-id>
- Aurora prod_change verified: yes | no
- Aurora change_intake_idempotency verified: yes | no

Event intake:
- create status:
- replay status:
- event_id: <event-id>
- Aurora event_intake.created_at verified: yes | no

Issue intake:
- create status:
- replay status:
- issue_id: <issue-id>
- Aurora issue verified: yes | no
- Aurora issue_intake_idempotency verified: yes | no

Issue safe projection:
- detail raw title/body/reporter/payload absent: yes | no
- list raw title/body/reporter/payload absent: yes | no
- presence flags acceptable: yes | no

Result: pass | fail
Notes/TODO:
```

## 8. 남은 리스크 또는 TODO

- 이 절차는 M1.1 수동 smoke 공식 절차이며 자동화된 CI smoke가 아니다.
- 실제 운영 데이터나 실사용자 PII로 실행하지 않는다.
- `grep` 기반 leak check는 sentinel raw 값 검출에 한정된다. 이후 자동 smoke를 만들면 JSON schema-level projection assertion을 추가한다.
- ClickHouse, CDC, MSK, EKS read path 검증은 M1.1 범위 밖이다.
