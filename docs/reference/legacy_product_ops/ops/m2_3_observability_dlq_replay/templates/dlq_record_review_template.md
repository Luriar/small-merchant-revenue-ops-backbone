# M2-3 DLQ Record Review Template

This template reviews one metadata-only DLQ record.

## Record Identity

- Failure id:
- Failure type:
- Status:
- Owner:
- Evidence report ref:

## Safe Metadata

- Source topic:
- Source table:
- Primary key identifiers:
- Operation:
- Timestamp field present: yes/no
- Observed field-name set:
- Missing required field names:
- Unexpected field names:
- Forbidden field names detected:

## Parser / Mapping Summary

- Parser error class:
- Parser error summary without raw values:
- ClickHouse target table if relevant:
- MV mapping affected: yes/no
- DELETE rewrite affected: yes/no

## Do-Not-Record Confirmation

- Raw payloads absent: yes/no
- Full message bodies absent: yes/no
- Secrets absent: yes/no
- Endpoints absent: yes/no
- DB URLs absent: yes/no
- Issue title/body/payload/reporter values absent: yes/no
- Prod_change payload/actor values absent: yes/no

## Decision

- Stop / retry / replay / reprocess / close:
- New run row required: yes/no
- Cleanup evidence required: yes/no
- Reviewer:
- Reviewed at:
