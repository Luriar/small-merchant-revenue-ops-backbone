# M2-8C Error Envelope Decision Record

## Decision Summary

M2-8C-Prep accepts a CDC handler-boundary safe adapter pattern for expected CDC domain errors and service decisions. This task does not modify runtime behavior, `server.js`, `auth.js`, or `error-response.js`.

Accepted decision:

- expected CDC domain errors are converted to safe error envelopes at the CDC handler boundary
- route wiring may adapt safe CDC error objects into the existing shared error-response pattern, or return them through a small CDC-safe adapter
- 401 unauthorized and 403 forbidden remain auth-layer concerns
- 409 idempotency_conflict and 409 invalid_state_transition include only safe code/message/status and optional safe evidence_report_ref
- unknown errors use the existing shared 500 path only after raw detail is stripped or wrapped as `internal_error`

## Accepted Integration Pattern

The accepted pattern is Option B plus Option C:

- use a small CDC-specific safe adapter at the route handler boundary
- keep expected CDC validation, not_found, idempotency conflict, invalid state transition, and worker boundary outcomes explicit
- reserve thrown unknown errors for shared 500 handling
- preserve the common envelope shape with safe `error.code`, `error.message`, `error.status`, and conditional `error.evidence_report_ref`

## Rejected Alternatives

- Rejected: propagate raw domain or repository errors directly. Reason: raw errors can expose stack traces, SQL details, persistence internals, or unsafe values.
- Rejected: rely only on shared `AppError` without a CDC adapter. Reason: current shared shape does not carry CDC `status` and `evidence_report_ref` without additional adaptation.
- Rejected: generate 401/403 in service logic. Reason: auth-layer concerns should remain outside service mutation logic.
- Rejected: include conflict comparison details in 409 responses. Reason: compared values may contain unsafe data.

## Why Raw Errors Must Not Be Propagated

Raw errors can contain raw payloads, full message bodies, issue raw values, prod_change payload/actor values, secrets, tokens, DB URLs, raw connection strings, stack traces, SQL details, or persistence internals. The CDC route boundary must convert known errors to safe envelopes and route unknown failures to generic 500 handling.

## Why 409 Conflict Details Must Be Redacted

409 idempotency_conflict and invalid_state_transition are operator-facing control decisions, not evidence dumps. They must not include compared request body, compared idempotency values, raw failed message values, raw record details, or persistence internals. Safe status/action labels and evidence_report_ref are allowed only when already safe.

## Why 500 Must Not Expose Stack Traces Or Persistence Details

500 internal_error represents unexpected behavior. Exposing stack traces, SQL details, raw connection strings, database constraints with unsafe context, or persistence internals would turn an operational failure into a data leakage path.

## How evidence_report_ref Should Be Handled

`evidence_report_ref` is allowed only when already safe metadata:

- allowed conditionally for 400 validation_error
- not allowed for 401 unauthorized or 403 forbidden
- allowed for 409 idempotency_conflict and invalid_state_transition when already safe
- conditional for 409 worker_boundary_conflict
- not allowed by default for 500 internal_error

## Future Revisit Conditions

Revisit this decision only if:

- shared `error-response.js` gains a first-class safe `status` and `evidence_report_ref` envelope
- route-level integration tests prove every CDC error case remains safe
- repository strategy defines safe persistence error normalization
- OpenAPI error schemas are owned and approved
- no raw payloads, no full message bodies, no issue raw values, no prod_change payload/actor values, no stack traces, no SQL details, and logs must not reveal raw values remain enforced
