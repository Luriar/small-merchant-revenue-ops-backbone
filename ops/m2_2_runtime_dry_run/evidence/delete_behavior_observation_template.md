# Delete Behavior Observation Template

Use this template to record DELETE behavior without raw values.

Do not record raw payloads.
Do not record full message bodies.
Do not record secrets, DB URLs, endpoints, account IDs, SecretString, tokens, passwords, or raw connection strings.
Do not record issue title/body/payload/reporter values.
Do not record prod_change payload/actor values.
Do not record screenshots or logs exposing raw values.

## DELETE Runtime Observation

- Topic name:
- Sampled message counts:
- DELETE `op = d` observed: yes/no
- DELETE primary-key presence result:
- Runtime DELETE shape: full-row | partial-row | PK-only | not observed
- `REPLICA IDENTITY DEFAULT` confirmed: yes/no
- `_deleted` mapping result:

## Decision

- Safe to continue: yes/no
- Follow-up required:
- REPLICA IDENTITY FULL proposed: yes/no
- If proposed, reviewed as exception: yes/no
