# M2-8N Post-Merge Contract Closure

## Purpose

M2-8N closes the contract loop after M2-8M merged CDC recovery OpenAPI into the main OpenAPI. It verifies that route, OpenAPI, DTO, error, and auth documentation remain aligned before any Aurora repository or live DB work.

## Confirmed State

- M2-8M OpenAPI merge completed in `sources/personal_project_openapi_v0_2.yaml`.
- `sources/openapi_m2_5_dlq_replay_patch.yaml` is preserved as proposal-only history.
- Production CDC routes remain registered through the M2-8I isolated dispatcher.
- Route/OpenAPI parity reviewed for all CDC recovery routes.
- DTO safety reviewed against safe failure, replay request, and state log projections.
- Redacted error envelope reviewed for 400, 401, 403, 404, 409, and 500 outcomes.
- Auth role documentation reviewed for `readonly_role`, `operator`, `maintainer`, and `system_worker`.

## Live Boundary

Aurora repository is not live in route dispatch before M2-8O/M2-9 gates. SQL apply is not performed before M2-9B. Runtime dry-run is not executed before M2-9C.

## Required Future Gates

- migration review
- rollback plan
- verification queries
- controlled runtime gate
- bounded sample-count
- bounded time-window
- evidence_report_ref
- cleanup owner

## Decision

M2-8N contract closure is complete when its validator passes. The next allowed implementation is M2-8O mocked Aurora repository only. Live DB work remains gated.
