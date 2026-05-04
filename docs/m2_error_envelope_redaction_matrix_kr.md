# M2 Error Envelope / Redaction Matrix

Purpose: Define safe API error envelope behavior before handler implementation.

Default envelope:

```json
{
  "error": {
    "code": "safe_code",
    "message": "safe message",
    "status": 409,
    "evidence_report_ref": "optional-safe-ref"
  }
}
```

Explicitly forbidden in errors/logs:

- raw payloads
- full message bodies
- issue title/body/payload/reporter values
- prod_change payload/actor values
- secrets
- DB URLs
- endpoints
- tokens
- passwords
- raw connection strings

| Error Case | HTTP Status | Error Code | Safe Message Rule | Allowed Fields | Forbidden Fields | evidence_report_ref | Field-Name Sets | Log Redaction Rule | Operator Message | Stop Condition |
|---|---:|---|---|---|---|---|---|---|---|---|
| validation error | 400 | `validation_error` | generic field-level reason only | code,message,status,field names | forbidden values | yes if safe | yes | log count and IDs only | input validation failed | forbidden value needed |
| unauthorized | 401 | `unauthorized` | no auth details | code,message,status | credential material | no | no | log route label and status only | authentication required | repeated auth leak |
| forbidden | 403 | `forbidden` | no role inventory leak | code,message,status | principal raw values | no | no | log role category only | role not permitted | mutation attempted before role check |
| not found | 404 | `not_found` | id missing/not found only | code,message,status,requested id | raw record details | no | no | log safe ID only | record not found | raw lookup details exposed |
| idempotency conflict | 409 | `idempotency_conflict` | conflict on normalized intent | code,message,status,evidence ref,field names | compared values | yes | yes | log key hash/ref only | idempotent request conflicts | same key creates new intent |
| invalid state transition | 409 | `invalid_state_transition` | current status/action only | code,message,status,evidence ref | raw record details | yes | yes | log IDs/status only | transition is not allowed | mutation executed anyway |
| internal error | 500 | `internal_error` | generic only | code,message,status | stack, SQL, connection data | no by default | no | classify without raw detail | internal server error | raw detail exposed |

Rules:

- safe field-name sets may be included only as names, never values.
- `evidence_report_ref` can be included only if it is already safe metadata.
- handler must map unknown errors to 500 without raw details.
- service and repository errors must not expose persistence internals.
