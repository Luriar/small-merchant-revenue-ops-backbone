# M1.2 Run / Retry / Reprocess Aurora Smoke

## 1. 맥락

M1.2 smoke는 실제 API 서버가 Aurora-backed run store로 실행될 때 운영 run lifecycle을 보존하는지 확인하는 수동 절차다. 검증 초점은 Aurora `run` / `run_state_log`를 운영 정본으로 두고, retry와 reprocess가 기존 run을 되감지 않고 새 run row를 만들거나 idempotent replay로 수렴하는지 확인하는 것이다.

이 절차는 fake analytics, ClickHouse, CDC, MSK, EKS를 검증하지 않는다. OpenAPI, DTO, endpoint contract, handler, frontend도 변경하지 않는다.

## 2. 작업 범위

검증 대상:

- `run` record가 Aurora에 저장된다.
- `POST /api/v1/runs/{run_id}/retry`가 retryable run(`failed` 또는 `dlq`)을 대상으로 새 run을 생성한다.
- 같은 retry `idempotency_key` replay가 같은 `new_run_id`를 반환한다.
- `POST /api/v1/reprocess`가 새 reprocess run을 생성한다.
- 같은 reprocess `idempotency_key` replay가 같은 `new_run_id`를 반환한다.
- `GET /api/v1/runs/{run_id}`가 safe projection만 반환한다.
- `GET /api/v1/runs/{run_id}/state-log`가 append-only 상태 이력을 안정된 순서로 반환한다.
- Aurora DB에서 `run` 및 `run_state_log` row를 확인한다.
- API 응답에 raw `input_ref`, raw payload marker, credential marker, SQL-text marker, stack-trace marker가 노출되지 않는다.

범위 밖:

- OpenAPI, DTO, endpoint contract, frontend 변경.
- ClickHouse, CDC, MSK, EKS, analytics read path.
- 실제 secret, 실제 `AURORA_DATABASE_URL`, 실제 bearer token, 실제 password 기록.
- 운영 데이터 삭제 cleanup. Smoke data는 unique suffix로 격리한다.

## 3. 현재 구현에서 확인한 API 조건

- 공개 run 생성 API는 현재 없다. `POST /api/v1/runs` 같은 route를 만들거나 가정하지 않는다.
- M1.2 seed run은 Aurora `run` table에 synthetic row를 직접 INSERT해서 준비한다.
- retry 대상 run status는 `failed` 또는 `dlq`여야 한다.
- retry request body는 `idempotency_key`, `reason`만 허용한다.
- reprocess request body는 `idempotency_key`, `target_kind`, `target_ref`, `reason`만 허용한다.
- reprocess `target_kind`는 `dlq_batch` 또는 `event_batch`만 허용한다.
- `run_state_log`는 `GET /api/v1/runs/{run_id}/state-log`로 조회한다.
- `run_state_log` INSERT bootstrap trigger가 적용된 환경에서는 새 retry/reprocess run 생성 시 `from_status = null`, `to_status = pending` row가 자동으로 추가된다.

## 4. 사전 조건

- API가 Aurora-backed store로 실행 중이어야 한다.
- 수동 확인 셸에 `curl`, `jq`, `psql`, `grep`이 있어야 한다.
- `AURORA_DATABASE_URL` 또는 `DATABASE_URL`은 로컬 셸/런타임에만 주입하고 문서, 로그, PR, 이슈에 남기지 않는다.
- `AURORA_DB_SSLMODE=require`가 필요한 Aurora 환경에서는 API와 smoke 셸 모두 동일하게 설정한다.
- `RUN_STORE_BACKEND=aurora`가 설정되어야 한다. M1.1과 같은 runtime parity를 위해 change/event/issue/trace backend도 Aurora로 둔다.
- DB seed는 synthetic smoke setup이다. `migration_role`을 API runtime으로 사용하지 않는다.

예시 placeholder:

```bash
export API_BASE_URL='https://<api-endpoint>'
export AURORA_DATABASE_URL_SECRET_ARN='<aurora-database-url-secret-arn>'

export AURORA_DB_SSLMODE=require
export RUN_STORE_BACKEND=aurora
export CHANGE_STORE_BACKEND=aurora
export EVENT_STORE_BACKEND=aurora
export ISSUE_STORE_BACKEND=aurora
export TRACE_STORE_BACKEND=aurora

# If auth is enabled, replace placeholders in the curl examples:
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

Connection smoke:

```bash
node apps/api/src/aurora-connection-smoke.js
```

Expected:

- `status` is `ok`.
- Raw database URL is not printed.

## 5. Synthetic Smoke 값

매 실행마다 suffix를 바꿔 충돌을 피한다.

```bash
export SMOKE_SUFFIX='m1-2-<yyyymmddhhmm>'

export SEED_TARGET_REF="m1_2_seed_event_${SMOKE_SUFFIX}"
export RETRY_IDEMPOTENCY_KEY="smoke-retry-${SMOKE_SUFFIX}"
export REPROCESS_IDEMPOTENCY_KEY="smoke-reprocess-${SMOKE_SUFFIX}"
export REPROCESS_TARGET_REF="m1_2_dlq_batch_${SMOKE_SUFFIX}"

export RAW_INPUT_REF_SENTINEL="SMOKE_RAW_INPUT_REF_SENTINEL_${SMOKE_SUFFIX}"
export RAW_PAYLOAD_SENTINEL="SMOKE_RAW_PAYLOAD_SENTINEL_${SMOKE_SUFFIX}"
export RAW_CREDENTIAL_SENTINEL="SMOKE_RAW_CREDENTIAL_SENTINEL_${SMOKE_SUFFIX}"
export RAW_SQL_TEXT_SENTINEL="SMOKE_RAW_SQL_TEXT_SENTINEL_${SMOKE_SUFFIX}"
export RAW_STACK_TRACE_SENTINEL="SMOKE_RAW_STACK_TRACE_SENTINEL_${SMOKE_SUFFIX}"
```

## 6. Seed Run 준비

현재 공개 API에는 seed run 생성 route가 없다. M1.2에서는 Aurora DML로 synthetic failed run을 준비한다. 이 seed row는 retry 대상이므로 `status = failed`, `completed_at IS NOT NULL`이어야 한다.

```bash
export SEED_RUN_ID="$(
  psql "$AURORA_DATABASE_URL" -v ON_ERROR_STOP=1 -At \
    -v target_ref="$SEED_TARGET_REF" \
    -v raw_input_ref="$RAW_INPUT_REF_SENTINEL" \
    -v raw_payload="$RAW_PAYLOAD_SENTINEL" \
    -v raw_credential="$RAW_CREDENTIAL_SENTINEL" \
    -v raw_sql_text="$RAW_SQL_TEXT_SENTINEL" \
    -v raw_stack_trace="$RAW_STACK_TRACE_SENTINEL" \
    -c "INSERT INTO run (
          run_type,
          target_kind,
          target_ref,
          status,
          attempt,
          max_attempts,
          error_class,
          error_detail,
          input_ref,
          completed_at
        )
        VALUES (
          'normalization',
          'event',
          :'target_ref',
          'failed',
          1,
          3,
          'm1_2_seed_failure',
          jsonb_build_object(
            'raw_payload_marker', :'raw_payload',
            'sql_text_marker', :'raw_sql_text',
            'stack_trace_marker', :'raw_stack_trace'
          ),
          jsonb_build_object(
            'raw_input_ref_marker', :'raw_input_ref',
            'credential_marker', :'raw_credential'
          ),
          NOW()
        )
        RETURNING run_id;"
)"
```

Aurora seed verification:

```bash
psql "$AURORA_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v seed_run_id="$SEED_RUN_ID" \
  -v raw_input_ref="$RAW_INPUT_REF_SENTINEL" \
  -v raw_payload="$RAW_PAYLOAD_SENTINEL" \
  -v raw_credential="$RAW_CREDENTIAL_SENTINEL" \
  -v raw_sql_text="$RAW_SQL_TEXT_SENTINEL" \
  -v raw_stack_trace="$RAW_STACK_TRACE_SENTINEL" \
  -c "SELECT
        run_id,
        run_type,
        target_kind,
        target_ref,
        status,
        attempt,
        created_at,
        completed_at IS NOT NULL AS completed_at_present,
        input_ref->>'raw_input_ref_marker' = :'raw_input_ref' AS raw_input_ref_stored,
        input_ref->>'credential_marker' = :'raw_credential' AS credential_marker_stored,
        error_detail->>'raw_payload_marker' = :'raw_payload' AS raw_payload_stored,
        error_detail->>'sql_text_marker' = :'raw_sql_text' AS sql_text_marker_stored,
        error_detail->>'stack_trace_marker' = :'raw_stack_trace' AS stack_trace_marker_stored
      FROM run
      WHERE run_id = :'seed_run_id';" \
  -c "SELECT log_id, run_id, from_status, to_status, attempt, occurred_at
      FROM run_state_log
      WHERE run_id = :'seed_run_id'
      ORDER BY occurred_at ASC, log_id ASC;"
```

Expected:

- Seed run exists in Aurora.
- Seed run is `failed`.
- Raw sentinel values are stored only inside Aurora setup fields and are not printed by API read responses later.
- If insert bootstrap trigger is applied, seed run may have one `run_state_log` row with `from_status = null`, `to_status = failed`.

## 7. Retry Smoke

Create retry:

```bash
curl -sS -X POST "$API_BASE_URL/api/v1/runs/$SEED_RUN_ID/retry" \
  -H 'content-type: application/json' \
  -H 'Authorization: Bearer <operator-token-placeholder>' \
  -d '{
    "idempotency_key": "'"$RETRY_IDEMPOTENCY_KEY"'",
    "reason": "m1_2_smoke_retry"
  }' | tee /tmp/m1_2_retry_create.json
```

Expected:

- HTTP status is `202`.
- Response has `action = retry_requested`.
- Response has `original_run_id = <seed-run-id>`.
- Response has `idempotent_replay = false`.
- Response has `status = accepted`.
- Response has `new_run_id`.

Capture the retry run id:

```bash
export RETRY_RUN_ID="$(jq -r '.new_run_id' /tmp/m1_2_retry_create.json)"
```

Aurora retry verification:

```bash
psql "$AURORA_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v seed_run_id="$SEED_RUN_ID" \
  -v retry_run_id="$RETRY_RUN_ID" \
  -v retry_idempotency_key="$RETRY_IDEMPOTENCY_KEY" \
  -c "SELECT
        run_id,
        run_type,
        target_kind,
        target_ref,
        status,
        attempt,
        input_ref->>'action' AS action,
        input_ref->>'original_run_id' = :'seed_run_id' AS original_run_matches,
        input_ref->>'idempotency_key' = :'retry_idempotency_key' AS idempotency_key_matches,
        input_ref ? 'reason' AS reason_present,
        created_at
      FROM run
      WHERE run_id = :'retry_run_id';" \
  -c "SELECT COUNT(*)::integer AS retry_row_count
      FROM run
      WHERE input_ref->>'action' = 'retry'
        AND input_ref->>'original_run_id' = :'seed_run_id'
        AND input_ref->>'idempotency_key' = :'retry_idempotency_key';" \
  -c "SELECT log_id, run_id, from_status, to_status, attempt, occurred_at
      FROM run_state_log
      WHERE run_id = :'retry_run_id'
      ORDER BY occurred_at ASC, log_id ASC;"
```

Expected:

- Retry run exists in Aurora.
- Retry run status is `pending`.
- Retry run `attempt` is seed `attempt + 1`.
- `retry_row_count = 1`.
- New retry run has an initial state-log row. With insert bootstrap trigger, it is `from_status = null`, `to_status = pending`.

Replay retry with the same idempotency key:

```bash
export RETRY_STATE_LOG_COUNT_BEFORE="$(
  psql "$AURORA_DATABASE_URL" -v ON_ERROR_STOP=1 -At \
    -v retry_run_id="$RETRY_RUN_ID" \
    -c "SELECT COUNT(*) FROM run_state_log WHERE run_id = :'retry_run_id';"
)"

curl -sS -X POST "$API_BASE_URL/api/v1/runs/$SEED_RUN_ID/retry" \
  -H 'content-type: application/json' \
  -H 'Authorization: Bearer <operator-token-placeholder>' \
  -d '{
    "idempotency_key": "'"$RETRY_IDEMPOTENCY_KEY"'",
    "reason": "m1_2_smoke_retry"
  }' | tee /tmp/m1_2_retry_replay.json

export RETRY_STATE_LOG_COUNT_AFTER="$(
  psql "$AURORA_DATABASE_URL" -v ON_ERROR_STOP=1 -At \
    -v retry_run_id="$RETRY_RUN_ID" \
    -c "SELECT COUNT(*) FROM run_state_log WHERE run_id = :'retry_run_id';"
)"
```

Expected:

- Replay HTTP status is `200`.
- Replay has `idempotent_replay = true`.
- Replay `new_run_id` equals `RETRY_RUN_ID`.
- `RETRY_STATE_LOG_COUNT_BEFORE` equals `RETRY_STATE_LOG_COUNT_AFTER`.
- No new run row is created for the same retry idempotency key.

## 8. Reprocess Smoke

Create reprocess:

```bash
curl -sS -X POST "$API_BASE_URL/api/v1/reprocess" \
  -H 'content-type: application/json' \
  -H 'Authorization: Bearer <operator-token-placeholder>' \
  -d '{
    "idempotency_key": "'"$REPROCESS_IDEMPOTENCY_KEY"'",
    "target_kind": "dlq_batch",
    "target_ref": "'"$REPROCESS_TARGET_REF"'",
    "reason": "m1_2_smoke_reprocess"
  }' | tee /tmp/m1_2_reprocess_create.json
```

Expected:

- HTTP status is `202`.
- Response has `action = reprocess_requested`.
- Response has `idempotent_replay = false`.
- Response has `status = accepted`.
- Response has `new_run_id`.

Capture the reprocess run id:

```bash
export REPROCESS_RUN_ID="$(jq -r '.new_run_id' /tmp/m1_2_reprocess_create.json)"
```

Aurora reprocess verification:

```bash
psql "$AURORA_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v reprocess_run_id="$REPROCESS_RUN_ID" \
  -v reprocess_idempotency_key="$REPROCESS_IDEMPOTENCY_KEY" \
  -v reprocess_target_ref="$REPROCESS_TARGET_REF" \
  -c "SELECT
        run_id,
        run_type,
        target_kind,
        target_ref,
        status,
        attempt,
        input_ref->>'action' AS action,
        input_ref->>'idempotency_key' = :'reprocess_idempotency_key' AS idempotency_key_matches,
        input_ref ? 'reason' AS reason_present,
        created_at
      FROM run
      WHERE run_id = :'reprocess_run_id';" \
  -c "SELECT COUNT(*)::integer AS reprocess_row_count
      FROM run
      WHERE run_type = 'reprocess'
        AND target_kind = 'dlq_batch'
        AND target_ref = :'reprocess_target_ref'
        AND input_ref->>'idempotency_key' = :'reprocess_idempotency_key';" \
  -c "SELECT log_id, run_id, from_status, to_status, attempt, occurred_at
      FROM run_state_log
      WHERE run_id = :'reprocess_run_id'
      ORDER BY occurred_at ASC, log_id ASC;"
```

Expected:

- Reprocess run exists in Aurora.
- Reprocess run has `run_type = reprocess`.
- Reprocess run status is `pending`.
- Reprocess run `attempt = 0`.
- `reprocess_row_count = 1`.
- New reprocess run has an initial state-log row. With insert bootstrap trigger, it is `from_status = null`, `to_status = pending`.

Replay reprocess with the same idempotency key:

```bash
export REPROCESS_STATE_LOG_COUNT_BEFORE="$(
  psql "$AURORA_DATABASE_URL" -v ON_ERROR_STOP=1 -At \
    -v reprocess_run_id="$REPROCESS_RUN_ID" \
    -c "SELECT COUNT(*) FROM run_state_log WHERE run_id = :'reprocess_run_id';"
)"

curl -sS -X POST "$API_BASE_URL/api/v1/reprocess" \
  -H 'content-type: application/json' \
  -H 'Authorization: Bearer <operator-token-placeholder>' \
  -d '{
    "idempotency_key": "'"$REPROCESS_IDEMPOTENCY_KEY"'",
    "target_kind": "dlq_batch",
    "target_ref": "'"$REPROCESS_TARGET_REF"'",
    "reason": "m1_2_smoke_reprocess"
  }' | tee /tmp/m1_2_reprocess_replay.json

export REPROCESS_STATE_LOG_COUNT_AFTER="$(
  psql "$AURORA_DATABASE_URL" -v ON_ERROR_STOP=1 -At \
    -v reprocess_run_id="$REPROCESS_RUN_ID" \
    -c "SELECT COUNT(*) FROM run_state_log WHERE run_id = :'reprocess_run_id';"
)"
```

Expected:

- Replay HTTP status is `200`.
- Replay has `idempotent_replay = true`.
- Replay `new_run_id` equals `REPROCESS_RUN_ID`.
- `REPROCESS_STATE_LOG_COUNT_BEFORE` equals `REPROCESS_STATE_LOG_COUNT_AFTER`.
- No new run row is created for the same reprocess idempotency key.

## 9. Safe Run Read Projection

Check seed, retry, and reprocess run detail:

```bash
curl -sS "$API_BASE_URL/api/v1/runs/$SEED_RUN_ID" \
  -H 'Authorization: Bearer <viewer-token-placeholder>' \
  | tee /tmp/m1_2_seed_run_detail.json

curl -sS "$API_BASE_URL/api/v1/runs/$RETRY_RUN_ID" \
  -H 'Authorization: Bearer <viewer-token-placeholder>' \
  | tee /tmp/m1_2_retry_run_detail.json

curl -sS "$API_BASE_URL/api/v1/runs/$REPROCESS_RUN_ID" \
  -H 'Authorization: Bearer <viewer-token-placeholder>' \
  | tee /tmp/m1_2_reprocess_run_detail.json
```

Expected safe fields may include:

- `run_id`
- `run_type`
- `target_kind`
- `target_ref`
- `status`
- `attempt`
- `created_at`
- retry summary fields for retry runs: `retry_action`, `original_run_id`

Raw value leak check:

```bash
for file in \
  /tmp/m1_2_seed_run_detail.json \
  /tmp/m1_2_retry_run_detail.json \
  /tmp/m1_2_reprocess_run_detail.json
do
  grep -F "$RAW_INPUT_REF_SENTINEL" "$file"
  grep -F "$RAW_PAYLOAD_SENTINEL" "$file"
  grep -F "$RAW_CREDENTIAL_SENTINEL" "$file"
  grep -F "$RAW_SQL_TEXT_SENTINEL" "$file"
  grep -F "$RAW_STACK_TRACE_SENTINEL" "$file"
done
```

Expected:

- Each `grep -F` command returns no output and exits non-zero.
- API response must not contain raw `input_ref`, `output_ref`, `error_detail`, raw payload marker, credential marker, SQL-text marker, or stack-trace marker.

Optional shape check:

```bash
jq 'has("input_ref"), has("output_ref"), has("error_detail"), has("idempotency_key"), has("reason")' \
  /tmp/m1_2_retry_run_detail.json
```

Expected:

- All values are `false`.

## 10. State-log Read Projection

Check state-log API for retry and reprocess runs:

```bash
curl -sS "$API_BASE_URL/api/v1/runs/$RETRY_RUN_ID/state-log" \
  -H 'Authorization: Bearer <viewer-token-placeholder>' \
  | tee /tmp/m1_2_retry_state_log.json

curl -sS "$API_BASE_URL/api/v1/runs/$REPROCESS_RUN_ID/state-log" \
  -H 'Authorization: Bearer <viewer-token-placeholder>' \
  | tee /tmp/m1_2_reprocess_state_log.json
```

Expected:

- Response shape is `{ "items": [...] }`.
- Each item contains safe fields: `state_log_id`, `run_id`, `from_status`, `to_status`, `changed_at`.
- Items are ordered by Aurora `occurred_at ASC, log_id ASC`.
- Raw `metadata` is not exposed.

Compare with Aurora ordering:

```bash
psql "$AURORA_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v retry_run_id="$RETRY_RUN_ID" \
  -v reprocess_run_id="$REPROCESS_RUN_ID" \
  -c "SELECT log_id AS state_log_id, run_id, from_status, to_status, occurred_at AS changed_at
      FROM run_state_log
      WHERE run_id = :'retry_run_id'
      ORDER BY occurred_at ASC, log_id ASC;" \
  -c "SELECT log_id AS state_log_id, run_id, from_status, to_status, occurred_at AS changed_at
      FROM run_state_log
      WHERE run_id = :'reprocess_run_id'
      ORDER BY occurred_at ASC, log_id ASC;"
```

Raw state-log leak check:

```bash
grep -F 'metadata' /tmp/m1_2_retry_state_log.json
grep -F 'metadata' /tmp/m1_2_reprocess_state_log.json
grep -F "$RAW_PAYLOAD_SENTINEL" /tmp/m1_2_retry_state_log.json
grep -F "$RAW_PAYLOAD_SENTINEL" /tmp/m1_2_reprocess_state_log.json
```

Expected:

- Each `grep -F` command returns no output and exits non-zero.
- State-log API does not expose trigger `metadata`.

## 11. 수용 기준

M1.2 smoke passes only when all of the following are true:

- Synthetic seed run exists in Aurora with retryable status `failed` or `dlq`.
- Retry create returns `202` and creates a new Aurora `run` row.
- Retry replay with the same idempotency key returns `200` and the same `new_run_id`.
- Reprocess create returns `202` and creates a new Aurora `run` row.
- Reprocess replay with the same idempotency key returns `200` and the same `new_run_id`.
- Retry and reprocess replay do not add duplicate `run` rows.
- `run_state_log` contains append-only rows for new retry/reprocess runs and remains unchanged by replay.
- `GET /api/v1/runs/{run_id}` returns safe projection only.
- `GET /api/v1/runs/{run_id}/state-log` returns safe state history without raw `metadata`.
- API responses do not expose raw input refs, raw payload markers, credential markers, SQL-text markers, stack-trace markers, raw database URLs, or bearer tokens.
- No ClickHouse, CDC, MSK, EKS, or analytics path is involved.

## 12. 산출물 요약 템플릿

After a manual run, record only placeholders and pass/fail status:

```text
M1.2 Run / Retry / Reprocess Aurora smoke

Date:
Environment:
API endpoint: <api-endpoint>
Aurora secret ARN: <aurora-database-url-secret-arn>

Seed run:
- seed_run_id: <seed-run-id>
- seed status: failed | dlq
- Aurora run verified: yes | no
- Seed run_state_log observed: yes | no

Retry:
- create status:
- replay status:
- retry_run_id: <retry-run-id>
- retry Aurora row count for idempotency key: 1 | other
- retry state-log unchanged by replay: yes | no

Reprocess:
- create status:
- replay status:
- reprocess_run_id: <reprocess-run-id>
- reprocess Aurora row count for idempotency key: 1 | other
- reprocess state-log unchanged by replay: yes | no

Safe projection:
- run detail raw input_ref/payload/credential/sql/stack sentinels absent: yes | no
- state-log metadata absent: yes | no

Result: pass | fail
Notes/TODO:
```

## 13. 실행 결과

M1.2 Run / Retry / Reprocess Aurora smoke passed manually.

Recorded result:

- Seed failed run was created successfully.
- Retry create/replay passed.
- Retry replay returned the same `new_run_id` with `idempotent_replay = true`.
- Retry Aurora row count for the idempotency key was `1`.
- Retry `run_state_log` did not increase on replay.
- Reprocess create/replay passed.
- Reprocess replay returned the same `new_run_id` with `idempotent_replay = true`.
- Reprocess Aurora row count for the idempotency key was `1`.
- Reprocess `run_state_log` did not increase on replay.
- `GET /api/v1/runs/{run_id}` returned safe projection only.
- Run detail did not expose `input_ref`, `output_ref`, `error_detail`, `idempotency_key`, `reason`, or raw sentinel values.
- `GET /api/v1/runs/{run_id}/state-log` returned safe state-log projection only.
- State-log response exposed only safe state fields: `state_log_id`, `run_id`, `from_status`, `to_status`, `changed_at`.
- State-log response did not expose `metadata` or raw sentinel values.

Recorded identifiers are intentionally redacted:

- `seed_run_id`: `<seed-run-id>`
- `retry_run_id`: `<retry-run-id>`
- `reprocess_run_id`: `<reprocess-run-id>`

No real `AURORA_DATABASE_URL`, password, `SecretString`, bearer token, raw sentinel value, or DB endpoint is recorded in this document.

## 14. 남은 리스크 또는 TODO

- 이 절차는 M1.2 수동 smoke 공식 절차이며 자동화된 CI smoke가 아니다.
- 현재 공개 API에는 seed run 생성 route가 없다. 이 문서는 현재 구현에 맞춰 Aurora DML seed를 명시한다.
- Direct DB seed는 smoke setup에만 사용한다. API/worker runtime에서 `migration_role`을 사용하지 않는다.
- `grep` 기반 leak check는 synthetic sentinel raw 값 검출에 한정된다. 이후 자동 smoke를 만들면 JSON shape assertion과 HTTP status assertion을 script로 고정한다.
- ClickHouse, CDC, MSK, EKS, analytics read path 검증은 M1.2 범위 밖이다.
