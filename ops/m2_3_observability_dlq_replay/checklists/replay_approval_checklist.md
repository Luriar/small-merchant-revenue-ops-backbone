# M2-3 Replay Approval Checklist

This checklist is template-only and does not run commands.

## Replay Request

- [ ] Failure id provided.
- [ ] Reason provided.
- [ ] Owner assigned.
- [ ] Target topic or target table identified.
- [ ] Bounded scope defined.
- [ ] Max attempt count defined.
- [ ] Idempotency key defined.
- [ ] Cleanup owner assigned.
- [ ] Evidence report reference assigned.

## Contract Alignment

- [ ] Replay is not raw message replay by default.
- [ ] Reprocess prefers safe metadata and source re-read where possible.
- [ ] Retry/reprocess creates a new run row.
- [ ] Original run remains immutable.
- [ ] Replay output updates evidence-safe status only.

## Stop Conditions

- [ ] Stop if forbidden field leakage appears.
- [ ] Stop if raw payloads or full message bodies are required.
- [ ] Stop if publication scope must be broadened.
- [ ] Stop if connector uses `publication.autocreate.mode=all_tables`.
- [ ] Stop if slot lag / WAL pressure grows unexpectedly.
- [ ] Stop if anyone proposes `REPLICA IDENTITY FULL` as a quick fix.
- [ ] Stop if cleanup evidence cannot be completed.
