# M2-5 API Safety Review Checklist

This checklist is template-only and does not run commands.

## Request / Response Shape

- [ ] Safe metadata only.
- [ ] No raw payloads.
- [ ] No full message bodies.
- [ ] No secrets.
- [ ] No DB URLs.
- [ ] No endpoints.
- [ ] No issue raw values.
- [ ] No prod_change payload/actor values.
- [ ] No forbidden field leakage in examples or schema fields.

## Required Fields

- [ ] `failure_id` present where applicable.
- [ ] `replay_request_id` present where applicable.
- [ ] `status` present.
- [ ] `evidence_report_ref` present.
- [ ] `idempotency_key` required for replay request creation.
- [ ] `new_run_id` nullable until future worker creates the new run row.

## Stop Conditions

- [ ] Stop on forbidden leakage.
- [ ] Stop if raw message replay is required.
- [ ] Stop if cleanup/evidence report linkage is missing.
