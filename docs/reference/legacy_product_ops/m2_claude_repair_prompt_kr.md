# M2 Claude Repair Prompt

Use this only for the failed or gated repository/live DB phase.

```text
Repair the failed M2 repository/live DB phase only.
Do not broaden route wiring.
Do not rewrite auth.js or error-response.js.
Do not modify OpenAPI except docs if needed.
Do not run production DB.
If SQL apply failed or is gated, inspect schema/migration idempotency and rollback plan before retry.
If runtime dry-run failed or is gated, inspect bounded sample, state transition, cleanup, and evidence report before retry.
Preserve safe DTO projection, redacted errors, idempotency, append-only state log, original failure immutability, and original run immutability.
Current M2-9A state is NO-GO until explicit dev/staging DB target, cleanup owner, evidence_report_ref, bounded sample-count, bounded time-window, rollback, and verification evidence are provided.
```
