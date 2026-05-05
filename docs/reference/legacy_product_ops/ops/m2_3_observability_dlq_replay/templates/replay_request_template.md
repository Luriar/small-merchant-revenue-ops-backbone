# M2-3 Replay Request Template

This template records an evidence-safe replay or reprocess request.

Replay is not raw message replay by default.

## Request Metadata

- Request id:
- Failure id:
- Requested by:
- Owner:
- Requested at:
- Evidence report ref:

## Scope

- Source topic:
- Source table:
- Target topic or target table:
- Primary key identifiers:
- Bounded source window:
- Max attempt count:
- Idempotency key:

## Reason

- Failure type:
- Detection signal:
- Reason summary without raw values:

## Execution Contract

- New run row required: yes/no
- Original run mutation prohibited: yes/no
- Source re-read preferred: yes/no
- Safe metadata only: yes/no
- Cleanup owner:
- Cleanup status requirement:

## Stop Conditions

- Stop if forbidden field leakage appears.
- Stop if raw payloads or full message bodies are required.
- Stop if publication scope must be broadened.
- Stop if slot lag / WAL pressure grows unexpectedly.
- Stop if anyone proposes `REPLICA IDENTITY FULL` as a quick fix.

## Approval

- Approved: yes/no
- Approver:
- Approval timestamp:
- Conditions:
