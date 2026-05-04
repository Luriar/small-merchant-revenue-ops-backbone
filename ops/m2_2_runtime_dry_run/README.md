# M2-2 Runtime Dry Run Package

This directory contains templates for a future controlled M2-2 runtime dry run.

This is not production rollout. Do not run these templates directly against infrastructure. They are guardrailed placeholders for a later approved execution window.

Package contents:

- `commands/`: safe command templates using placeholders and echo-only default behavior
- `evidence/`: safe evidence capture templates
- `checklists/`: preflight, stop condition, cleanup, and evidence review checklists

M2-1 contract reference:

- source tables: `public.prod_change`, `public.trace`, `public.issue`
- publication: `m2_1_traceability_pub`
- slot: `m2_1_traceability_slot`
- topics: `cdc.aurora.prod_change`, `cdc.aurora.trace`, `cdc.aurora.issue`
- forbidden fields: `prod_change.payload`, `prod_change.actor`, `issue.title`, `issue.body`, `issue.payload`, `issue.reporter`

Safety rule:

- Record field-name sets, sampled message counts, topic names, yes/no leakage result, `op`/`ts_ms` presence, DELETE primary-key presence, `_deleted` mapping result, slot lag summary, and cleanup status.
- Do not record raw payloads, full message bodies, secrets, DB URLs, endpoints, account IDs, SecretString, tokens, passwords, raw connection strings, issue raw values, prod_change raw values, screenshots, or logs exposing raw values.
