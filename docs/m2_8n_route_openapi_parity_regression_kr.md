# M2-8N Route/OpenAPI Parity Regression

## Evidence Method

Parity was reviewed across:

- M2-8I production route registration tests
- M2-8M main OpenAPI merge
- CDC DTO mapper field sets
- CDC redacted error envelope
- M2 auth role contract

## Route Coverage

| Route | OpenAPI merged | Production route test | Parity status |
| --- | --- | --- | --- |
| `GET /api/v1/cdc/failures` | yes | yes | pass |
| `GET /api/v1/cdc/failures/{failure_id}` | yes | yes | pass |
| `GET /api/v1/cdc/failures/{failure_id}/state-log` | yes | yes | pass |
| `POST /api/v1/cdc/failures/{failure_id}/replay-requests` | yes | yes | pass |
| `GET /api/v1/cdc/replay-requests` | yes | yes | pass |
| `GET /api/v1/cdc/replay-requests/{replay_request_id}` | yes | yes | pass |
| `POST /api/v1/cdc/replay-requests/{replay_request_id}/approve` | yes | yes | pass |
| `POST /api/v1/cdc/replay-requests/{replay_request_id}/cancel` | yes | yes | pass |

## DTO Safety Regression

The OpenAPI contract follows the safe DTO mapper projections:

- failure metadata projection
- replay request metadata projection
- append-only state log metadata projection

No raw payloads, no full message bodies, no issue raw values, no prod_change payload/actor values, no stack traces, no SQL details, and no persistence internals are permitted.

## Error Envelope Regression

The main OpenAPI uses redacted CDC error envelope fields only:

- `error.code`
- `error.message`
- `error.status`
- optional `error.evidence_report_ref`

## Decision

Route/OpenAPI parity is sufficient for mocked Aurora repository implementation. Live DB work remains gated.
