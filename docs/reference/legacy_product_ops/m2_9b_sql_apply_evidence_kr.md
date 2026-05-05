# M2-9B SQL Apply Evidence

## Outcome

Apply outcome: **succeeded**.

## Apply Target

- Apply target safe label: `product-ops-dev-aurora`
- Target environment: **dev**, non-production. Source of classification: `infra/terraform/envs/dev` and operator confirmation.
- Migration role: `app_migration_dev_role`
- Region label: `ap-northeast-2`. Account identifier not recorded in docs.
- No DB URL, hostname, port, IAM ARN, credential, token, or password is recorded in this document.

## Apply File

- Apply file path: `infra/sql/aurora/m2_4_dlq_replay_metadata.sql`
- The forward SQL file retains its `PROPOSAL ONLY - DO NOT APPLY AUTOMATICALLY` marker. The marker was not removed. The apply was explicitly authorized by the M2-9A GO record at `docs/m2_9a_sql_apply_go_no_go_decision_kr.md` together with this M2-9B task.

## Apply Command Type (Sanitized)

- Command type: `psql` with `-v ON_ERROR_STOP=1` and `--single-transaction`, applying the file via `-f`. Executed by the human operator from the authorized dev path. No DB URL, hostname, port, or credential is recorded.
- Stop-on-first-error: yes (`ON_ERROR_STOP=1`)
- Transaction wrapping: yes (`--single-transaction`)

## Apply Window

- Start/end status: completed in under one minute, end-to-end. No partial-apply state was observed.
- Apply succeeded: **yes**.
- Apply succeeded on first attempt: yes; no retry occurred.

## Affected Objects

The apply created the three M2-4 CDC replay metadata tables together with their inline check and unique constraints, the three implicit primary-key constraints, the implicit foreign-key constraints, and the ten named indexes.

### Tables (3 of 3)

- `public.cdc_failure` — created
- `public.cdc_replay_request` — created
- `public.cdc_failure_state_log` — created

### Named Indexes (10 of 10)

- `idx_cdc_failure_status`
- `idx_cdc_failure_type`
- `idx_cdc_failure_source_topic`
- `idx_cdc_failure_owner`
- `idx_cdc_failure_first_seen_at`
- `idx_cdc_replay_failure`
- `idx_cdc_replay_status`
- `idx_cdc_replay_owner`
- `idx_cdc_replay_idempotency_key`
- `idx_cdc_failure_state_log_failure`

### Named Constraints (15 of 15)

- `chk_cdc_failure_op`
- `chk_cdc_failure_attempt_count`
- `chk_cdc_failure_status`
- `chk_cdc_failure_primary_key_object`
- `chk_cdc_failure_observed_fields_array`
- `chk_cdc_failure_missing_fields_array`
- `chk_cdc_failure_unexpected_fields_array`
- `chk_cdc_failure_forbidden_fields_array`
- `chk_cdc_replay_action`
- `chk_cdc_replay_attempt_count`
- `chk_cdc_replay_status`
- `chk_cdc_replay_cleanup_status`
- `chk_cdc_replay_bounded_scope_object`
- `uq_cdc_replay_idempotency_key`
- `chk_cdc_failure_state_safe_metadata_object`

### Implicit Constraints (9, expected)

The post-apply verification observed **24 total constraints** on the three tables. The 15 named constraints above plus 9 implicit constraints created by the table definitions:

- 3 implicit primary-key constraints (one per table: `failure_id`, `replay_request_id`, `state_log_id`)
- 6 implicit foreign-key constraints:
  - `public.cdc_failure (source_run_id) → public.run`
  - `public.cdc_replay_request (failure_id) → public.cdc_failure`
  - `public.cdc_replay_request (source_run_id) → public.run`
  - `public.cdc_replay_request (new_run_id) → public.run`
  - `public.cdc_failure_state_log (failure_id) → public.cdc_failure`
  - `public.cdc_failure_state_log (replay_request_id) → public.cdc_replay_request`

These 9 implicit constraints are expected. They are recorded here for completeness and are not flagged as extra unexpected objects.

## Rollback Status

- Rollback prepared before apply: **yes** (see `docs/m2_9b_rollback_sql_review_kr.md` and `infra/sql/aurora/m2_4_dlq_replay_metadata_rollback.sql`)
- Rollback executed: **no**
- Rollback was not needed.

The reviewed rollback file remains in place for future use. It is not invoked in the M2-9B success path.

## Boundary Confirmations

- SQL apply has been performed in M2-9B. The apply targeted the confirmed dev target `product-ops-dev-aurora` only.
- Runtime dry-run has not been executed.
- No production DB was used.
- No M2-9C controlled runtime dry-run was entered.
- No replay/reprocess workflow was triggered.
- No Kafka, Debezium, ClickHouse, kubectl, Terraform, deployment, or unrelated AWS write command was run.
- No DB URL, hostname, port, IAM ARN, AWS account ID, credential, token, or password is recorded.
- No raw payload, full message body, issue raw value, or prod_change payload/actor value is recorded.
- No stack trace, SQL error internal, or persistence internal is recorded.
- The forward SQL file `infra/sql/aurora/m2_4_dlq_replay_metadata.sql` was not modified.
- The earlier M2-9A GO and NO-GO records were not modified.
- The main OpenAPI `sources/personal_project_openapi_v0_2.yaml` was not modified beyond M2-8M merged state.
- The proposal-only patch `sources/openapi_m2_5_dlq_replay_patch.yaml` retains its proposal-only marker and was not modified.

## Cross-References

- Schema verification report: `docs/m2_9b_schema_verification_report_kr.md`
- Decision record: `docs/m2_9b_sql_apply_decision_record_kr.md`
- Rollback SQL: `infra/sql/aurora/m2_4_dlq_replay_metadata_rollback.sql`
- Rollback SQL review: `docs/m2_9b_rollback_sql_review_kr.md`
- M2-9A GO master: `docs/m2_9a_live_db_preflight_go_evidence_kr.md`
- M2-9A GO/NO-GO decision: `docs/m2_9a_sql_apply_go_no_go_decision_kr.md`
- M2-9B next-task prompt (this task's source prompt): `docs/m2_9b_next_sql_apply_prompt_kr.md`
- M2-9C next-task prompt: `docs/m2_9c_next_controlled_runtime_dry_run_prompt_kr.md`
