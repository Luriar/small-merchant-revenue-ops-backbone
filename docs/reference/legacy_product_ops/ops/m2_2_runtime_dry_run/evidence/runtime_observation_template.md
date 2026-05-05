# Runtime Observation Template

Use this template for safe runtime observations.

Do not record raw payloads.
Do not record full message bodies.
Do not record secrets, DB URLs, endpoints, account IDs, SecretString, tokens, passwords, or raw connection strings.
Do not record issue title/body/payload/reporter values.
Do not record prod_change payload/actor values.
Do not record screenshots or logs exposing raw values.

## Runtime Context

- Environment class:
- Publication table membership:
- Allowed column names:
- Topic names:
- Sampled message counts:

## Observations

- yes/no leakage result:
- `op`/`ts_ms` presence result:
- ClickHouse JSONEachRow parsing result:
- `_deleted` mapping result:
- slot lag summary:
- cleanup status:

## Follow-Up

- Follow-up required: yes/no
- Owner:
- Due date:
