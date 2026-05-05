# Message Field Set Capture Template

Use this template to record safe evidence only.

Do not record raw payloads.
Do not record full message bodies.
Do not record secrets, DB URLs, endpoints, account IDs, SecretString, tokens, passwords, or raw connection strings.
Do not record issue title/body/payload/reporter values.
Do not record prod_change payload/actor values.
Do not record screenshots or logs exposing raw values.

## Capture Metadata

- Capture ID:
- Topic name:
- Sampled message counts:
- Capture time:
- Observer:

## Field-Name Sets

Record field-name sets only.

```text
<field-name-set-placeholder>
```

## Safety Results

- yes/no leakage result:
- `op` presence result:
- `ts_ms` presence result:
- `__op` absent:
- `__ts_ms` absent:
- Debezium envelope fields absent as data columns:

## Notes

- No raw values retained: yes/no
- Cleanup status:
