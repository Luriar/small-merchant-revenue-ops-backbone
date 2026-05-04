# M2-3 Observability Incident Note Template

This template records evidence-safe incident notes for CDC/read-model failures.

## Incident Metadata

- Incident id:
- Opened at:
- Owner:
- Severity:
- Source layer:
- Failure type:

## Signal Summary

- Detection signal:
- Threshold or decision rule:
- First seen:
- Last seen:
- Affected topic names:
- Affected table names:
- Field-name set summary:

## Safety Review

- Forbidden field leakage detected: yes/no
- Raw payloads recorded: no
- Full message bodies recorded: no
- Secrets recorded: no
- Slot lag / WAL pressure observed: yes/no
- Cleanup evidence required: yes/no

## Response Decision

- Stop condition triggered: yes/no
- Retry/replay/reprocess requested: yes/no
- New run row required: yes/no
- `REPLICA IDENTITY FULL` quick fix rejected: yes/no
- Owner-approved bounded scope:

## Closure

- Cleanup completed: yes/no
- Evidence report completed: yes/no
- Follow-up actions:
