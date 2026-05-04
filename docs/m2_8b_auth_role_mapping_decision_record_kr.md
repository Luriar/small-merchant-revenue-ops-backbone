# M2-8B Auth Role Mapping Decision Record

## Decision Summary

M2-8B-Prep accepts a compatibility mapping from current `auth.js` roles to M2 CDC recovery roles, without modifying `auth.js` in this task.

Decision:

- `viewer` -> `readonly_role` candidate
- `operator` -> `operator` candidate
- `maintainer` -> new role required
- `system_worker` -> new role required
- approve/cancel -> maintainer-only
- future worker status updates -> system_worker-only

This is not live route wiring. `server.js` must not be modified, `auth.js` must not be modified, no OpenAPI main merge is allowed, no SQL apply is allowed, and no external infrastructure commands are allowed.

## Accepted Mapping

| Current Auth Role | Accepted M2 Mapping | Permission Boundary |
|---|---|---|
| `viewer` | `readonly_role` candidate | read CDC failure and replay request metadata only |
| `operator` | `operator` candidate | read and create replay/reprocess request only |
| none | `maintainer` new role required | read, create, approve, cancel |
| none | `system_worker` new role required | linkNewRunId and future runtime status updates only |

Role checks before service mutation are required. Authorization failures do not reveal raw values.

## Rejected Alternatives

- Rejected: allow `viewer` to create replay requests. Reason: readonly_role cannot mutate.
- Rejected: allow `operator` to approve/cancel. Reason: operator can request recovery but must not authorize it.
- Rejected: map `operator` to `maintainer` by precedence. Reason: approve/cancel requires a distinct approval boundary.
- Rejected: use `system_worker` for human request creation. Reason: system_worker must be isolated from arbitrary replay request creation.
- Rejected: let route handlers perform mutation before role checks. Reason: role checks before service mutation are mandatory.

## Why viewer Must Not Be Allowed To Mutate

`viewer` is compatible only with `readonly_role`. Read access may inspect safe metadata, but mutation can create recovery records and future execution side effects. A read-only user must not create replay/reprocess requests, approve/cancel, linkNewRunId, or mark runtime status.

## Why operator Must Not Approve/Cancel

`operator` can create a structured replay/reprocess request, but approval and cancel decisions require a separate maintainer gate. This preserves separation between request creation and recovery authorization, and prevents under-scoped escalation through the current precedence model.

## Why maintainer Is Required

`maintainer` is required because approve/cancel changes operational recovery state. The role must be explicit so M2-8B can test maintainer-only approval/cancel behavior with 401/403/409 outcomes and safe error envelopes.

## Why system_worker Must Be Isolated From Human Request Creation

`system_worker` represents future runtime execution status. It may linkNewRunId and mark running/succeeded/failed/cleanup_complete, but it must not create arbitrary replay requests or approve/cancel. Isolation limits automated credentials to worker actions and prevents broad human recovery authority.

## Future Revisit Conditions

Revisit this decision only if:

- production auth gains explicit role claims or a role-set model
- maintainer and system_worker credential sources are designed
- route-level integration tests prove 401/403/409 behavior
- safe error response behavior is implemented
- repository strategy is approved
- no raw payloads, no full message bodies, no issue raw values, and no prod_change payload/actor values remain enforced
