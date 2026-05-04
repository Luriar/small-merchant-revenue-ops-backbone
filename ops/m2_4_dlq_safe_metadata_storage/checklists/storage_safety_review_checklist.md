# M2-4 Storage Safety Review Checklist

This checklist is template-only and does not run commands.

## Storage Shape

- [ ] Aurora is the operational source of truth.
- [ ] Kafka DLQ topic is metadata-only transport/buffer.
- [ ] ClickHouse read model is optional analytical read model.
- [ ] No raw failed message is stored anywhere.
- [ ] JSONB fields contain field names, identifiers, counts, or bounded scope only.

## Forbidden Storage

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

## Required Linkage

- [ ] `evidence_report_ref` exists.
- [ ] Replay request has an idempotency key.
- [ ] Replay request links to `failure_id`.
- [ ] Replay creates new run row.
- [ ] Cleanup/evidence report linkage exists.
