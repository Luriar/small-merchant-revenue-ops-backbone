# M2-2 Cleanup Checklist

- [ ] Debezium connector stopped.
- [ ] Connector stopped state verified.
- [ ] Replication slot checked.
- [ ] slot lag summary recorded.
- [ ] WAL pressure summary recorded.
- [ ] Dry-run-only slot removed through approved runbook, if applicable.
- [ ] Dry-run-only Kafka topics removed, if applicable.
- [ ] ClickHouse dry-run tables cleaned, if applicable.
- [ ] Temporary sample files removed.
- [ ] No raw payloads retained.
- [ ] No full message bodies retained.
- [ ] No secrets, DB URLs, endpoints, account IDs, SecretString, tokens, passwords, or raw connection strings retained.
- [ ] cleanup status recorded.
- [ ] Cleanup owner sign-off recorded.
