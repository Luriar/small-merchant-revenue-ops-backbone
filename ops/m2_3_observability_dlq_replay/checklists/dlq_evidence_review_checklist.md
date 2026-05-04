# M2-3 DLQ Evidence Review Checklist

This checklist is template-only and does not run commands.

## Required Safe Metadata

- [ ] `failure_id`
- [ ] `failure_type`
- [ ] `source_topic`
- [ ] `source_table`
- [ ] `primary_key`
- [ ] `op`
- [ ] `ts_ms`
- [ ] `observed_field_names`
- [ ] `missing_required_fields`
- [ ] `unexpected_fields`
- [ ] `forbidden_field_names_detected`
- [ ] `parser_error_class`
- [ ] `parser_error_summary`
- [ ] `first_seen_at`
- [ ] `last_seen_at`
- [ ] `attempt_count`
- [ ] `status`
- [ ] `owner`
- [ ] `evidence_report_ref`

## Do-Not-Record Review

- [ ] No raw payloads.
- [ ] No full message bodies.
- [ ] No secrets.
- [ ] No DB URLs.
- [ ] No endpoints.
- [ ] No account IDs.
- [ ] No tokens.
- [ ] No passwords.
- [ ] No raw connection strings.
- [ ] No issue title/body/payload/reporter values.
- [ ] No prod_change payload/actor values.

## Stop Conditions

- [ ] Stop if forbidden field leakage includes values instead of field names.
- [ ] Stop if DLQ stores raw message content.
- [ ] Stop if replay requires `REPLICA IDENTITY FULL` as a quick fix.
- [ ] Stop if cleanup evidence is missing.
