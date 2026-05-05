# M2-3 Failure Triage Checklist

This checklist is template-only and does not run commands.

## Failure Classification

- [ ] Failure type selected from the M2-3 contract.
- [ ] Source layer identified.
- [ ] Severity assigned.
- [ ] Likely owner assigned.
- [ ] Detection signal recorded without raw values.

## Evidence-Safe Capture

- [ ] Field-name set recorded.
- [ ] Topic name recorded if relevant.
- [ ] Source table recorded if relevant.
- [ ] Primary key identifiers recorded if relevant.
- [ ] Yes/no forbidden field leakage result recorded.
- [ ] Slot lag / WAL pressure summary recorded if relevant.
- [ ] Cleanup evidence requirement identified.

## Stop Conditions

- [ ] Stop if forbidden field leakage appears.
- [ ] Stop if raw payloads or full message bodies are required.
- [ ] Stop if publication contains `FOR ALL TABLES`.
- [ ] Stop if publication contains `FOR TABLES IN SCHEMA`.
- [ ] Stop if connector uses `publication.autocreate.mode=all_tables`.
- [ ] Stop if `__op` or `__ts_ms` drift appears.
- [ ] Stop if slot lag / WAL pressure grows unexpectedly.
- [ ] Stop if anyone proposes `REPLICA IDENTITY FULL` as a quick fix.

## Forbidden Evidence

- [ ] No raw payloads recorded.
- [ ] No full message bodies recorded.
- [ ] No secrets, endpoints, DB URLs, tokens, passwords, or raw connection strings recorded.
- [ ] No issue title/body/payload/reporter values recorded.
- [ ] No prod_change payload/actor values recorded.
