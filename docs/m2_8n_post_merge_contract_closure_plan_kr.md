# M2-8N Post-Merge Contract Closure Plan

## Purpose

M2-8N should review the M2-8M OpenAPI merge after validation and prepare the next Aurora repository readiness gate. This is planning only.

## Current State

OpenAPI main merge has completed for the CDC recovery API contract. CDC recovery routes are registered through the M2-8I isolated dispatcher and remain stub-backed.

Aurora repository is still not implemented. SQL apply is still forbidden. External infrastructure commands are still forbidden.

## Next Focus

- post-merge contract closure
- route/OpenAPI parity regression
- safe DTO projection regression
- redacted CDC error envelope regression
- auth role documentation regression
- Aurora repository implementation readiness gate

## Required Checks Before Repository Work

- confirm all M2-8M validation remains green
- confirm `sources/openapi_m2_5_dlq_replay_patch.yaml` remains proposal-only history
- confirm no route output exposes raw payloads, full message bodies, issue raw values, prod_change payload/actor values, stack traces, SQL details, or persistence internals
- confirm repository strategy still requires migration review and rollback plan before implementation
- confirm controlled runtime re-entry remains a separate gate

## Stop Conditions

Stop if the next task requires real DB queries, Aurora connection, SQL apply, direct repository implementation, or external infrastructure commands before readiness gates are approved.
